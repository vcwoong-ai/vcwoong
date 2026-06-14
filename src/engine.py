"""
ReportEngine — top-level orchestrator.

Usage
-----
Programmatic::

    from src.engine import ReportEngine
    from src.models.context import FinancialProjection, SectorContext

    engine = ReportEngine()
    report = engine.generate(
        company_name="BioPharma Co.",
        description="Clinical-stage oncology company …",
        raw_pipeline=[{"name": "BP-101", "indication": "NSCLC", "stage": "Ph2"}],
        financial_projections=[
            FinancialProjection(
                asset_name="BP-101",
                peak_sales_usd_million=800,
                years_to_launch=4,
                probability_of_approval=0.28,
            )
        ],
    )
    print(report.to_markdown())

CLI::

    python -m src.engine --company "BioPharma Co." --description "..." \\
        --sector bio
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, Optional

from src.agents.registry import register_all_agents, registry
from src.classification.sector_classifier import SectorClassifier
from src.models.context import FinancialProjection, SectorContext
from src.models.report import MISSING_DATA_PLACEHOLDER, Report, Section


class ReportEngine:
    """Orchestrates sector classification → agent routing → report generation."""

    def __init__(self) -> None:
        self._classifier = SectorClassifier()
        register_all_agents()

    # ------------------------------------------------------------------
    # Primary entry point
    # ------------------------------------------------------------------

    def generate(
        self,
        company_name: str,
        description: str,
        raw_pipeline: Optional[list[dict[str, Any]]] = None,
        financial_projections: Optional[list[FinancialProjection]] = None,
        sector_hint: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> Report:
        """Generate a sector-appropriate report.

        Parameters
        ----------
        company_name:
            Name of the company or asset group being analysed.
        description:
            Free-text description of the company (annual-report excerpt, etc.).
        raw_pipeline:
            List of raw pipeline dicts (parsed from filings or user input).
        financial_projections:
            Structured financial projections per pipeline asset.
        sector_hint:
            Explicit sector override.  Bypasses auto-classification.
        extra:
            Any additional key/value data to attach to the context.

        Returns
        -------
        Report
            Fully populated report from the sector agent.
        """
        context = SectorContext(
            company_name=company_name,
            description=description,
            sector_hint=sector_hint,
            raw_pipeline=raw_pipeline or [],
            financial_projections=financial_projections or [],
            extra=extra or {},
        )

        classification = self._classifier.classify(
            text=f"{company_name} {description}",
            sector_hint=sector_hint,
        )

        # Make the detected sector available to agents via the context
        context.sector_hint = classification.sector

        agent = registry.get_agent(classification.sector)

        if agent is None:
            return self._fallback_report(context, classification.sector)

        return agent.generate(context)

    # ------------------------------------------------------------------
    # Fallback when no agent is registered for the sector
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback_report(context: SectorContext, sector: str) -> Report:
        body = (
            f"섹터 '{sector}'에 대한 에이전트가 등록되어 있지 않습니다.\n\n"
            f"현재 지원 섹터: bio / healthcare\n\n"
            f"회사 설명:\n{context.description or MISSING_DATA_PLACEHOLDER}"
        )
        return Report(
            company_name=context.company_name,
            sector=sector,
            agent_name="FallbackAgent",
            sections=[Section(title="보고서 생성 불가", body=body)],
            warnings=[f"등록된 에이전트 없음: sector='{sector}'"],
        )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cli() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m src.engine",
        description="Report Generation Engine — generate a sector report from CLI.",
    )
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--description", required=True, help="Company description text")
    parser.add_argument("--sector", default=None, help="Sector hint (e.g. bio, finance, tech)")
    args = parser.parse_args()

    engine = ReportEngine()
    report = engine.generate(
        company_name=args.company,
        description=args.description,
        sector_hint=args.sector,
    )
    print(report.to_markdown())


if __name__ == "__main__":
    _cli()
