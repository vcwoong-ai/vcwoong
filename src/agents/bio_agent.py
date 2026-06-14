"""
BioSectorAgent — "Dr. Cell"

Handles report generation for BIO / healthcare sector companies.

Key behaviours
--------------
1. **Pipeline table** extraction and rendering with Korean column headers:
       파이프라인명 | 적응증 | 임상단계 | 예상 LoA | rNPV 기여

2. **rNPV calculation** when financial projections are supplied.
       rNPV ≈ Σ_i [ (peak_sales_i × LoA_i × royalty_i × duration_factor_i)
                     / (1 + r)^years_to_launch_i ]

3. **Missing-data flagging**: any field that cannot be confirmed from source
   data is set to ``MISSING_DATA_PLACEHOLDER`` ("[데이터 미확인]").
   Values are NEVER fabricated.
"""

from __future__ import annotations

import math
from typing import Any, Optional

from src.agents.base import BaseSectorAgent
from src.models.context import FinancialProjection, SectorContext
from src.models.report import (
    MISSING_DATA_PLACEHOLDER,
    PipelineAsset,
    RNPVResult,
    Report,
    Section,
)
from src.prompts.builder import PromptBuilder

# ---------------------------------------------------------------------------
# Industry-standard LoA benchmarks (BIO/Informa 2024 data)
# Source: BIO Clinical Development Success Rates 2011–2020
# ---------------------------------------------------------------------------
_LOA_BENCHMARKS: dict[str, float] = {
    "ph1": 0.52,
    "phase 1": 0.52,
    "ph2": 0.28,
    "phase 2": 0.28,
    "ph3": 0.58,
    "phase 3": 0.58,
    "nda": 0.85,
    "bla": 0.85,
    "preclinical": 0.10,
    "pre-clinical": 0.10,
    "approved": 1.00,
}

# Default rNPV parameters
_DEFAULT_DISCOUNT_RATE = 0.10
_DEFAULT_ROYALTY_RATE = 0.12
_DEFAULT_REVENUE_DURATION_YEARS = 10.0

# Raw-data field aliases accepted when parsing pipeline dicts
_FIELD_ALIASES: dict[str, list[str]] = {
    "pipeline_name": ["pipeline_name", "name", "asset", "drug", "compound", "파이프라인명"],
    "indication": ["indication", "disease", "target", "적응증"],
    "clinical_stage": ["clinical_stage", "stage", "phase", "임상단계"],
    "expected_loa": ["expected_loa", "loa", "probability", "예상_loa", "예상 loa"],
    "rnpv_contribution": ["rnpv_contribution", "rnpv", "npv", "rnpv 기여"],
}


def _get_field(data: dict[str, Any], canonical: str) -> Optional[str]:
    """Return the first matching value for *canonical* field from *data*."""
    for alias in _FIELD_ALIASES.get(canonical, [canonical]):
        value = data.get(alias)
        if value is not None:
            return str(value).strip()
    return None


def _loa_from_stage(stage: str) -> Optional[float]:
    """Return industry-benchmark LoA for a given clinical stage string."""
    return _LOA_BENCHMARKS.get(stage.lower().strip())


def _duration_factor(years: float, discount_rate: float) -> float:
    """Present-value annuity factor for a revenue stream of *years* at *discount_rate*."""
    if discount_rate == 0:
        return years
    return (1 - (1 + discount_rate) ** (-years)) / discount_rate


class BioSectorAgent(BaseSectorAgent):
    """Dr. Cell — BIO / healthcare sector report agent."""

    sector_keys = ("bio", "healthcare")
    agent_name = "Dr. Cell"

    def __init__(self, discount_rate: float = _DEFAULT_DISCOUNT_RATE) -> None:
        self._discount_rate = discount_rate
        self._prompt_builder = PromptBuilder()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def generate(self, context: SectorContext) -> Report:
        """Generate a BIO sector report for *context*.

        Steps
        -----
        1. Validate context → collect warnings.
        2. Extract pipeline assets (or flag missing).
        3. Calculate rNPV if financial projections are present.
        4. Build prompt string (stored as a section for transparency).
        5. Assemble and return the Report.
        """
        warnings = self.validate_context(context)

        pipeline_assets = self._extract_pipeline(context, warnings)
        rnpv = self._calculate_rnpv(context, pipeline_assets, warnings)

        system_prompt = self._prompt_builder.build("bio", context)

        sections = self._build_sections(context, system_prompt, pipeline_assets, rnpv, warnings)

        report = Report(
            company_name=context.company_name,
            sector="bio",
            agent_name=self.agent_name,
            sections=sections,
            pipeline_assets=pipeline_assets,
            rnpv=rnpv,
            warnings=warnings,
        )
        return report

    # ------------------------------------------------------------------
    # Context validation
    # ------------------------------------------------------------------

    def validate_context(self, context: SectorContext) -> list[str]:
        warnings = super().validate_context(context)
        if not context.raw_pipeline:
            warnings.append(
                f"파이프라인 데이터가 제공되지 않았습니다. "
                f"pipeline 컬럼은 {MISSING_DATA_PLACEHOLDER}로 표시됩니다."
            )
        if not context.financial_projections:
            warnings.append(
                f"재무 추정치(financial projections)가 없습니다. "
                f"rNPV는 {MISSING_DATA_PLACEHOLDER}로 표시됩니다."
            )
        return warnings

    # ------------------------------------------------------------------
    # Pipeline extraction
    # ------------------------------------------------------------------

    def _extract_pipeline(
        self,
        context: SectorContext,
        warnings: list[str],
    ) -> list[PipelineAsset]:
        """Parse ``context.raw_pipeline`` into ``PipelineAsset`` objects.

        Missing fields are set to ``MISSING_DATA_PLACEHOLDER``.
        """
        if not context.raw_pipeline:
            return []

        assets: list[PipelineAsset] = []
        missing_fields: list[str] = []

        for idx, entry in enumerate(context.raw_pipeline, start=1):
            name = _get_field(entry, "pipeline_name") or MISSING_DATA_PLACEHOLDER
            indication = _get_field(entry, "indication") or MISSING_DATA_PLACEHOLDER
            stage = _get_field(entry, "clinical_stage") or MISSING_DATA_PLACEHOLDER

            # LoA: use supplied value, fall back to benchmark, else flag
            raw_loa = _get_field(entry, "expected_loa")
            if raw_loa:
                loa_display = raw_loa
            else:
                stage_key = stage.lower() if stage != MISSING_DATA_PLACEHOLDER else ""
                bench = _loa_from_stage(stage_key)
                if bench is not None:
                    loa_display = f"{bench:.0%} (BIO/Informa 벤치마크)"
                else:
                    loa_display = MISSING_DATA_PLACEHOLDER
                    missing_fields.append(f"자산 #{idx} ({name}) — 예상 LoA")

            # rNPV contribution — filled in later by _calculate_rnpv
            rnpv_contrib = _get_field(entry, "rnpv_contribution") or MISSING_DATA_PLACEHOLDER

            if stage == MISSING_DATA_PLACEHOLDER:
                missing_fields.append(f"자산 #{idx} ({name}) — 임상단계")
            if indication == MISSING_DATA_PLACEHOLDER:
                missing_fields.append(f"자산 #{idx} ({name}) — 적응증")

            assets.append(
                PipelineAsset(
                    pipeline_name=name,
                    indication=indication,
                    clinical_stage=stage,
                    expected_loa=loa_display,
                    rnpv_contribution=rnpv_contrib,
                )
            )

        if missing_fields:
            warnings.append(
                "데이터 미확인 항목 (파이프라인): " + "; ".join(missing_fields)
            )

        return assets

    # ------------------------------------------------------------------
    # rNPV calculation
    # ------------------------------------------------------------------

    def _calculate_rnpv(
        self,
        context: SectorContext,
        assets: list[PipelineAsset],
        warnings: list[str],
    ) -> RNPVResult:
        """Compute rough rNPV from ``context.financial_projections``.

        If no projections are supplied, returns a result with
        ``total_rnpv_usd_million = None`` and ``data_complete = False``.

        Formula (per asset i)::

            rNPV_i = peak_sales_i × LoA_i × royalty_i
                     × duration_factor(revenue_duration_i, r)
                     / (1 + r)^years_to_launch_i

        where ``r = self._discount_rate``.
        """
        if not context.financial_projections:
            return RNPVResult(
                total_rnpv_usd_million=None,
                data_complete=False,
                notes=(
                    f"재무 추정치 미제공 — rNPV 계산 불가. "
                    f"({MISSING_DATA_PLACEHOLDER})"
                ),
            )

        per_asset: dict[str, Optional[float]] = {}
        missing_inputs: list[str] = []

        for proj in context.financial_projections:
            asset_rnpv = self._rnpv_single(proj, missing_inputs)
            per_asset[proj.asset_name] = asset_rnpv

        # Update pipeline asset rnpv_contribution fields in-place
        for asset in assets:
            if asset.pipeline_name in per_asset:
                val = per_asset[asset.pipeline_name]
                asset.rnpv_contribution = (
                    f"${val:,.1f}M" if val is not None else MISSING_DATA_PLACEHOLDER
                )

        computable = [v for v in per_asset.values() if v is not None]
        total: Optional[float] = sum(computable) if computable else None

        notes_parts: list[str] = [
            f"할인율: {self._discount_rate:.0%}",
            f"계산된 자산 수: {len(computable)} / {len(per_asset)}",
        ]
        if missing_inputs:
            notes_parts.append("입력 누락: " + "; ".join(missing_inputs))
            warnings.append("데이터 미확인 항목 (rNPV): " + "; ".join(missing_inputs))

        return RNPVResult(
            total_rnpv_usd_million=total,
            per_asset=per_asset,
            discount_rate=self._discount_rate,
            data_complete=len(missing_inputs) == 0,
            notes=" | ".join(notes_parts),
        )

    def _rnpv_single(
        self,
        proj: FinancialProjection,
        missing_inputs: list[str],
    ) -> Optional[float]:
        """Return rNPV for one asset projection, or None if inputs are missing."""
        incomplete = False

        peak_sales = proj.peak_sales_usd_million
        if peak_sales is None:
            missing_inputs.append(f"{proj.asset_name}: peak_sales")
            incomplete = True

        years_launch = proj.years_to_launch
        if years_launch is None:
            missing_inputs.append(f"{proj.asset_name}: years_to_launch")
            incomplete = True

        royalty = proj.royalty_rate or _DEFAULT_ROYALTY_RATE

        duration = proj.revenue_duration_years or _DEFAULT_REVENUE_DURATION_YEARS

        # LoA: prefer projection-level override, else look up by stage
        loa = proj.probability_of_approval
        if loa is None:
            missing_inputs.append(f"{proj.asset_name}: probability_of_approval")
            incomplete = True

        if incomplete:
            return None

        # All inputs confirmed present — cast to float for mypy
        ps: float = peak_sales  # type: ignore[assignment]
        yl: float = years_launch  # type: ignore[assignment]
        loa_f: float = loa  # type: ignore[assignment]

        df = _duration_factor(duration, self._discount_rate)
        pv_revenue = ps * loa_f * royalty * df
        rnpv = pv_revenue / (1 + self._discount_rate) ** yl
        return round(rnpv, 2)

    # ------------------------------------------------------------------
    # Section assembly
    # ------------------------------------------------------------------

    def _build_sections(
        self,
        context: SectorContext,
        system_prompt: str,
        assets: list[PipelineAsset],
        rnpv: RNPVResult,
        warnings: list[str],
    ) -> list[Section]:
        """Return the ordered list of report sections for a BIO report."""
        sections: list[Section] = []

        # --- Company overview ------------------------------------------------
        sections.append(
            Section(
                title="Company Overview",
                body=(
                    context.description
                    if context.description.strip()
                    else MISSING_DATA_PLACEHOLDER
                ),
            )
        )

        # --- Pipeline summary ------------------------------------------------
        pipeline_body_lines: list[str] = []
        pipeline_body_lines.append(self._pipeline_table_markdown(assets))

        # Enumerate all [데이터 미확인] fields at the end of the section
        unconfirmed = self._collect_unconfirmed(assets, rnpv)
        if unconfirmed:
            pipeline_body_lines.append("\n**데이터 미확인 항목:**\n")
            for item in unconfirmed:
                pipeline_body_lines.append(f"- {item}")

        sections.append(
            Section(title="파이프라인 요약", body="\n".join(pipeline_body_lines))
        )

        # --- rNPV ------------------------------------------------------------
        rnpv_body_lines: list[str] = [rnpv.summary_line]
        if rnpv.notes:
            rnpv_body_lines.append(f"\n> {rnpv.notes}")

        if rnpv.per_asset:
            rnpv_body_lines.append("\n**자산별 rNPV:**\n")
            for asset_name, val in rnpv.per_asset.items():
                display = f"${val:,.1f}M" if val is not None else MISSING_DATA_PLACEHOLDER
                rnpv_body_lines.append(f"- {asset_name}: {display}")

        sections.append(
            Section(title="rNPV 추정", body="\n".join(rnpv_body_lines))
        )

        # --- Prompt transparency (useful for debugging / audit) --------------
        sections.append(
            Section(
                title="System Prompt (Dr. Cell)",
                body=f"<details>\n<summary>프롬프트 보기</summary>\n\n```\n{system_prompt}\n```\n</details>",
            )
        )

        return sections

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pipeline_table_markdown(assets: list[PipelineAsset]) -> str:
        if not assets:
            return f"*파이프라인 데이터 없음 — {MISSING_DATA_PLACEHOLDER}*"
        header = (
            "| 파이프라인명 | 적응증 | 임상단계 | 예상 LoA | rNPV 기여 |\n"
            "|---|---|---|---|---|"
        )
        rows = [a.to_table_row() for a in assets]
        return header + "\n" + "\n".join(rows)

    @staticmethod
    def _collect_unconfirmed(
        assets: list[PipelineAsset],
        rnpv: RNPVResult,
    ) -> list[str]:
        """Return a list of all fields set to MISSING_DATA_PLACEHOLDER."""
        items: list[str] = []
        for a in assets:
            if a.indication == MISSING_DATA_PLACEHOLDER:
                items.append(f"`{a.pipeline_name}` — 적응증")
            if a.clinical_stage == MISSING_DATA_PLACEHOLDER:
                items.append(f"`{a.pipeline_name}` — 임상단계")
            if a.expected_loa == MISSING_DATA_PLACEHOLDER:
                items.append(f"`{a.pipeline_name}` — 예상 LoA")
            if a.rnpv_contribution == MISSING_DATA_PLACEHOLDER:
                items.append(f"`{a.pipeline_name}` — rNPV 기여")
        if not rnpv.data_complete and rnpv.total_rnpv_usd_million is None:
            items.append("전체 rNPV — 재무 추정치 없음")
        return items
