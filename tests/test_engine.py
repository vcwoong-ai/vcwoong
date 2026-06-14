"""
Integration tests for ReportEngine.
"""

import pytest

from src.engine import ReportEngine
from src.models.context import FinancialProjection
from src.models.report import MISSING_DATA_PLACEHOLDER


@pytest.fixture
def engine() -> ReportEngine:
    return ReportEngine()


class TestBioRouting:
    def test_bio_hint_routes_to_dr_cell(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="OncoCo",
            description="Small biotech.",
            sector_hint="bio",
        )
        assert report.agent_name == "Dr. Cell"
        assert report.sector == "bio"

    def test_healthcare_hint_routes_to_dr_cell(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="MedCo",
            description="Medical device maker.",
            sector_hint="healthcare",
        )
        assert report.agent_name == "Dr. Cell"

    def test_auto_bio_detection(self, engine: ReportEngine) -> None:
        description = (
            "A clinical-stage biopharmaceutical company developing antibody "
            "therapeutics for oncology. Ph2 trials ongoing."
        )
        report = engine.generate(company_name="BioPharma X", description=description)
        assert report.sector == "bio"
        assert report.agent_name == "Dr. Cell"


class TestFallbackForUnknownSector:
    def test_unknown_sector_returns_fallback(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="ACME Corp",
            description="lorem ipsum dolor sit amet",
            sector_hint="quantum_computing",
        )
        assert report.agent_name == "FallbackAgent"
        assert len(report.sections) == 1
        assert "에이전트" in report.sections[0].body

    def test_unknown_sector_has_warning(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="ACME Corp",
            description="lorem ipsum",
            sector_hint="quantum_computing",
        )
        assert any("에이전트" in w or "sector" in w for w in report.warnings)


class TestFullBioReport:
    def test_pipeline_and_rnpv_end_to_end(self, engine: ReportEngine) -> None:
        pipeline = [
            {"name": "ONCO-101", "indication": "NSCLC", "stage": "Ph2"},
            {"name": "ONCO-202", "indication": "Breast cancer", "stage": "Ph3"},
        ]
        projections = [
            FinancialProjection(
                asset_name="ONCO-101",
                peak_sales_usd_million=800.0,
                years_to_launch=4.0,
                royalty_rate=0.10,
                revenue_duration_years=10.0,
                probability_of_approval=0.28,
            ),
            FinancialProjection(
                asset_name="ONCO-202",
                peak_sales_usd_million=1500.0,
                years_to_launch=2.0,
                royalty_rate=0.15,
                revenue_duration_years=10.0,
                probability_of_approval=0.58,
            ),
        ]
        report = engine.generate(
            company_name="OncoPharma Inc.",
            description="Oncology-focused biopharma with two late-stage assets.",
            raw_pipeline=pipeline,
            financial_projections=projections,
            sector_hint="bio",
        )

        # Basic structure
        assert report.sector == "bio"
        assert len(report.pipeline_assets) == 2

        # rNPV is calculated
        assert report.rnpv is not None
        assert report.rnpv.total_rnpv_usd_million is not None
        assert report.rnpv.total_rnpv_usd_million > 0

        # Markdown renders without error
        md = report.to_markdown()
        assert "ONCO-101" in md
        assert "ONCO-202" in md
        assert "파이프라인명" in md
        assert "rNPV" in md

    def test_missing_pipeline_flagged_in_report(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="EmptyBio",
            description="Pharma company with no disclosed pipeline.",
            sector_hint="bio",
        )
        assert any(
            "파이프라인" in w or "pipeline" in w.lower()
            for w in report.warnings
        )

    def test_missing_financials_flagged_in_report(self, engine: ReportEngine) -> None:
        report = engine.generate(
            company_name="NoProjBio",
            description="Biotech with no financial projections.",
            raw_pipeline=[{"name": "X-01", "indication": "Cancer", "stage": "Ph1"}],
            sector_hint="bio",
        )
        assert report.rnpv.total_rnpv_usd_million is None
        assert MISSING_DATA_PLACEHOLDER in report.rnpv.summary_line
