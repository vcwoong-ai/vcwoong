"""
Tests for BioSectorAgent (Dr. Cell).

Covers:
- Pipeline table extraction with Korean column headers
- [데이터 미확인] flagging for missing fields
- rNPV calculation correctness
- Missing financial data handling
- Full report structure
"""

import math
import pytest

from src.agents.bio_agent import BioSectorAgent, _duration_factor, _loa_from_stage
from src.models.context import FinancialProjection, SectorContext
from src.models.report import MISSING_DATA_PLACEHOLDER


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def agent() -> BioSectorAgent:
    return BioSectorAgent(discount_rate=0.10)


def _make_context(
    pipeline: list | None = None,
    projections: list | None = None,
    description: str = "Clinical-stage biopharma company.",
) -> SectorContext:
    return SectorContext(
        company_name="TestBio Inc.",
        description=description,
        raw_pipeline=pipeline or [],
        financial_projections=projections or [],
    )


# ---------------------------------------------------------------------------
# Unit helpers
# ---------------------------------------------------------------------------

class TestHelpers:
    def test_loa_from_stage_ph1(self) -> None:
        assert _loa_from_stage("Ph1") == pytest.approx(0.52)

    def test_loa_from_stage_ph2(self) -> None:
        assert _loa_from_stage("phase 2") == pytest.approx(0.28)

    def test_loa_from_stage_ph3(self) -> None:
        assert _loa_from_stage("Ph3") == pytest.approx(0.58)

    def test_loa_from_stage_approved(self) -> None:
        assert _loa_from_stage("Approved") == pytest.approx(1.0)

    def test_loa_from_stage_unknown(self) -> None:
        assert _loa_from_stage("unknown_stage") is None

    def test_duration_factor_zero_rate(self) -> None:
        assert _duration_factor(10.0, 0.0) == pytest.approx(10.0)

    def test_duration_factor_10pct(self) -> None:
        # PV annuity factor for 10 years at 10%
        expected = (1 - 1.1 ** -10) / 0.10
        assert _duration_factor(10.0, 0.10) == pytest.approx(expected)


# ---------------------------------------------------------------------------
# Pipeline extraction
# ---------------------------------------------------------------------------

class TestPipelineExtraction:
    def test_full_pipeline_entry(self, agent: BioSectorAgent) -> None:
        pipeline = [
            {
                "name": "ABC-101",
                "indication": "NSCLC",
                "stage": "Ph2",
                "expected_loa": "28%",
            }
        ]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        assert len(report.pipeline_assets) == 1
        a = report.pipeline_assets[0]
        assert a.pipeline_name == "ABC-101"
        assert a.indication == "NSCLC"
        assert a.clinical_stage == "Ph2"
        assert a.expected_loa == "28%"

    def test_missing_indication_flagged(self, agent: BioSectorAgent) -> None:
        pipeline = [{"name": "XYZ-202", "stage": "Ph1"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        asset = report.pipeline_assets[0]
        assert asset.indication == MISSING_DATA_PLACEHOLDER

    def test_missing_stage_flagged(self, agent: BioSectorAgent) -> None:
        pipeline = [{"name": "XYZ-303", "indication": "Breast cancer"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        asset = report.pipeline_assets[0]
        assert asset.clinical_stage == MISSING_DATA_PLACEHOLDER

    def test_missing_loa_uses_benchmark(self, agent: BioSectorAgent) -> None:
        """When LoA not provided, falls back to BIO/Informa benchmark."""
        pipeline = [{"name": "BNK-505", "indication": "Diabetes", "stage": "Ph3"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        asset = report.pipeline_assets[0]
        # Should contain the benchmark percentage
        assert "58%" in asset.expected_loa or "BIO/Informa" in asset.expected_loa

    def test_missing_stage_loa_flagged(self, agent: BioSectorAgent) -> None:
        """When stage is also missing, LoA cannot be benchmarked."""
        pipeline = [{"name": "GHI-707", "indication": "Fibrosis"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        asset = report.pipeline_assets[0]
        assert asset.expected_loa == MISSING_DATA_PLACEHOLDER

    def test_empty_pipeline(self, agent: BioSectorAgent) -> None:
        ctx = _make_context(pipeline=[])
        report = agent.generate(ctx)

        assert report.pipeline_assets == []

    def test_multiple_assets(self, agent: BioSectorAgent) -> None:
        pipeline = [
            {"name": "A-1", "indication": "NSCLC", "stage": "Ph1"},
            {"name": "A-2", "indication": "Alzheimer", "stage": "Ph3"},
        ]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        assert len(report.pipeline_assets) == 2
        names = [a.pipeline_name for a in report.pipeline_assets]
        assert "A-1" in names
        assert "A-2" in names

    def test_korean_field_aliases(self, agent: BioSectorAgent) -> None:
        """Accepts Korean field names in raw_pipeline dicts."""
        pipeline = [{"파이프라인명": "KOR-001", "적응증": "암", "임상단계": "Ph2"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        a = report.pipeline_assets[0]
        assert a.pipeline_name == "KOR-001"
        assert a.indication == "암"
        assert a.clinical_stage == "Ph2"

    def test_pipeline_table_markdown_contains_korean_headers(
        self, agent: BioSectorAgent
    ) -> None:
        pipeline = [{"name": "TEST-01", "indication": "Cancer", "stage": "Ph2"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        table_md = report.pipeline_table_markdown()
        assert "파이프라인명" in table_md
        assert "적응증" in table_md
        assert "임상단계" in table_md
        assert "예상 LoA" in table_md
        assert "rNPV 기여" in table_md


# ---------------------------------------------------------------------------
# rNPV calculation
# ---------------------------------------------------------------------------

class TestRNPV:
    def test_rnpv_basic_calculation(self, agent: BioSectorAgent) -> None:
        """Verify rNPV formula output with known inputs."""
        proj = FinancialProjection(
            asset_name="DRUG-A",
            peak_sales_usd_million=1000.0,
            years_to_launch=5.0,
            royalty_rate=0.12,
            revenue_duration_years=10.0,
            probability_of_approval=0.30,
        )
        ctx = _make_context(projections=[proj])
        report = agent.generate(ctx)

        assert report.rnpv is not None
        assert report.rnpv.total_rnpv_usd_million is not None

        # Manual calculation
        r = 0.10
        df = (1 - (1 + r) ** -10) / r
        pv = 1000.0 * 0.30 * 0.12 * df
        expected = pv / (1 + r) ** 5
        assert report.rnpv.total_rnpv_usd_million == pytest.approx(expected, rel=1e-4)

    def test_rnpv_missing_peak_sales_flagged(self, agent: BioSectorAgent) -> None:
        proj = FinancialProjection(
            asset_name="DRUG-B",
            years_to_launch=3.0,
            probability_of_approval=0.28,
        )
        ctx = _make_context(projections=[proj])
        report = agent.generate(ctx)

        assert report.rnpv is not None
        assert report.rnpv.per_asset.get("DRUG-B") is None
        # Warnings should mention the missing field
        combined_warnings = " ".join(report.warnings)
        assert "peak_sales" in combined_warnings or MISSING_DATA_PLACEHOLDER in combined_warnings

    def test_rnpv_missing_loa_flagged(self, agent: BioSectorAgent) -> None:
        proj = FinancialProjection(
            asset_name="DRUG-C",
            peak_sales_usd_million=500.0,
            years_to_launch=4.0,
            # probability_of_approval omitted
        )
        ctx = _make_context(projections=[proj])
        report = agent.generate(ctx)

        assert report.rnpv.per_asset.get("DRUG-C") is None

    def test_no_projections_returns_missing(self, agent: BioSectorAgent) -> None:
        ctx = _make_context()
        report = agent.generate(ctx)

        assert report.rnpv is not None
        assert report.rnpv.total_rnpv_usd_million is None
        assert not report.rnpv.data_complete
        assert MISSING_DATA_PLACEHOLDER in report.rnpv.summary_line

    def test_multiple_assets_rnpv_summed(self, agent: BioSectorAgent) -> None:
        projs = [
            FinancialProjection(
                asset_name="A",
                peak_sales_usd_million=800.0,
                years_to_launch=4.0,
                royalty_rate=0.10,
                revenue_duration_years=10.0,
                probability_of_approval=0.28,
            ),
            FinancialProjection(
                asset_name="B",
                peak_sales_usd_million=1200.0,
                years_to_launch=6.0,
                royalty_rate=0.15,
                revenue_duration_years=12.0,
                probability_of_approval=0.58,
            ),
        ]
        ctx = _make_context(projections=projs)
        report = agent.generate(ctx)

        assert report.rnpv.total_rnpv_usd_million is not None
        # Must be the sum of A and B
        val_a = report.rnpv.per_asset["A"]
        val_b = report.rnpv.per_asset["B"]
        assert val_a is not None and val_b is not None
        assert report.rnpv.total_rnpv_usd_million == pytest.approx(val_a + val_b, rel=1e-4)

    def test_pipeline_rnpv_contribution_updated(self, agent: BioSectorAgent) -> None:
        """After rNPV calc, pipeline asset rnpv_contribution should be set."""
        pipeline = [{"name": "DRUG-D", "indication": "NSCLC", "stage": "Ph2"}]
        proj = FinancialProjection(
            asset_name="DRUG-D",
            peak_sales_usd_million=600.0,
            years_to_launch=3.0,
            royalty_rate=0.10,
            revenue_duration_years=10.0,
            probability_of_approval=0.28,
        )
        ctx = _make_context(pipeline=pipeline, projections=[proj])
        report = agent.generate(ctx)

        asset = report.pipeline_assets[0]
        assert asset.rnpv_contribution != MISSING_DATA_PLACEHOLDER
        assert "$" in asset.rnpv_contribution


# ---------------------------------------------------------------------------
# Missing-data policy
# ---------------------------------------------------------------------------

class TestMissingDataPolicy:
    def test_unconfirmed_listed_in_section(self, agent: BioSectorAgent) -> None:
        """[데이터 미확인] items must appear in the 파이프라인 요약 section."""
        pipeline = [{"name": "INCOMPLETE-01"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        pipeline_section = next(
            (s for s in report.sections if s.title == "파이프라인 요약"), None
        )
        assert pipeline_section is not None
        assert MISSING_DATA_PLACEHOLDER in pipeline_section.body or "데이터 미확인" in pipeline_section.body

    def test_warnings_contain_missing_info(self, agent: BioSectorAgent) -> None:
        ctx = _make_context()  # No pipeline, no projections
        report = agent.generate(ctx)

        combined = " ".join(report.warnings)
        assert "pipeline" in combined.lower() or "파이프라인" in combined

    def test_no_hallucinated_values(self, agent: BioSectorAgent) -> None:
        """Fields with no input must be MISSING_DATA_PLACEHOLDER, not invented."""
        pipeline = [{"name": "MINIMAL-01"}]
        ctx = _make_context(pipeline=pipeline)
        report = agent.generate(ctx)

        a = report.pipeline_assets[0]
        assert a.indication == MISSING_DATA_PLACEHOLDER
        assert a.clinical_stage == MISSING_DATA_PLACEHOLDER
        # LoA must also be missing (no stage to benchmark from)
        assert a.expected_loa == MISSING_DATA_PLACEHOLDER


# ---------------------------------------------------------------------------
# Report structure
# ---------------------------------------------------------------------------

class TestReportStructure:
    def test_agent_name_is_dr_cell(self, agent: BioSectorAgent) -> None:
        ctx = _make_context()
        report = agent.generate(ctx)
        assert report.agent_name == "Dr. Cell"

    def test_sector_is_bio(self, agent: BioSectorAgent) -> None:
        ctx = _make_context()
        report = agent.generate(ctx)
        assert report.sector == "bio"

    def test_required_sections_present(self, agent: BioSectorAgent) -> None:
        ctx = _make_context(
            pipeline=[{"name": "X", "indication": "Cancer", "stage": "Ph1"}]
        )
        report = agent.generate(ctx)
        titles = [s.title for s in report.sections]
        assert "파이프라인 요약" in titles
        assert "rNPV 추정" in titles

    def test_to_markdown_renders(self, agent: BioSectorAgent) -> None:
        pipeline = [{"name": "TEST", "indication": "Cancer", "stage": "Ph2"}]
        proj = FinancialProjection(
            asset_name="TEST",
            peak_sales_usd_million=500.0,
            years_to_launch=5.0,
            royalty_rate=0.12,
            revenue_duration_years=10.0,
            probability_of_approval=0.28,
        )
        ctx = _make_context(pipeline=pipeline, projections=[proj])
        report = agent.generate(ctx)
        md = report.to_markdown()

        assert "TestBio Inc." in md
        assert "파이프라인 요약" in md
        assert "rNPV" in md
        assert "Dr. Cell" in md
