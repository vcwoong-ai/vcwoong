"""
Tests for SectorClassifier.
"""

import pytest

from src.classification.sector_classifier import ClassificationResult, SectorClassifier


@pytest.fixture
def classifier() -> SectorClassifier:
    return SectorClassifier()


class TestBioClassification:
    def test_biotech_company_name(self, classifier: SectorClassifier) -> None:
        result = classifier.classify("GeneBiotech Inc.", "")
        assert result.sector == "bio"

    def test_pharma_description(self, classifier: SectorClassifier) -> None:
        text = (
            "A clinical-stage biopharmaceutical company developing "
            "antibody therapeutics for oncology and autoimmune diseases."
        )
        result = classifier.classify(text)
        assert result.sector == "bio"
        assert result.is_bio

    def test_pipeline_keywords(self, classifier: SectorClassifier) -> None:
        text = (
            "The company has three Phase 2 drug candidates in its pipeline. "
            "FDA approval is expected following NDA submission."
        )
        result = classifier.classify(text)
        assert result.sector == "bio"

    def test_rnpv_loa_keywords(self, classifier: SectorClassifier) -> None:
        text = "rNPV analysis; likelihood of approval; peak sales royalty milestone."
        result = classifier.classify(text)
        assert result.sector == "bio"

    def test_healthcare_alias(self, classifier: SectorClassifier) -> None:
        result = classifier.classify("irrelevant", sector_hint="healthcare")
        assert result.sector == "bio"
        assert result.source == "hint"

    def test_biopharma_hint(self, classifier: SectorClassifier) -> None:
        result = classifier.classify("irrelevant", sector_hint="biopharma")
        assert result.sector == "bio"
        assert result.source == "hint"


class TestNonBioClassification:
    def test_finance_company(self, classifier: SectorClassifier) -> None:
        text = "Investment bank providing asset management and private equity services."
        result = classifier.classify(text)
        assert result.sector == "finance"

    def test_tech_company(self, classifier: SectorClassifier) -> None:
        text = "Cloud software company offering SaaS developer tools and AI/ML APIs."
        result = classifier.classify(text)
        assert result.sector == "tech"

    def test_energy_company(self, classifier: SectorClassifier) -> None:
        text = "Oil and gas exploration and production company with renewable solar assets."
        result = classifier.classify(text)
        assert result.sector == "energy"

    def test_unknown_fallback(self, classifier: SectorClassifier) -> None:
        text = "lorem ipsum dolor sit amet consectetur adipiscing elit"
        result = classifier.classify(text)
        assert result.sector == "unknown"
        assert result.confidence == 0.0

    def test_explicit_hint_overrides_auto(self, classifier: SectorClassifier) -> None:
        text = "Large investment bank with global operations."
        result = classifier.classify(text, sector_hint="bio")
        assert result.sector == "bio"
        assert result.source == "hint"


class TestClassificationResult:
    def test_is_bio_true(self) -> None:
        r = ClassificationResult(sector="bio", confidence=0.9)
        assert r.is_bio is True

    def test_is_bio_healthcare(self) -> None:
        r = ClassificationResult(sector="healthcare", confidence=0.9)
        assert r.is_bio is True

    def test_is_bio_false(self) -> None:
        r = ClassificationResult(sector="finance", confidence=0.8)
        assert r.is_bio is False

    def test_confidence_range(self, classifier: SectorClassifier) -> None:
        text = "biopharmaceutical pipeline clinical trial phase 2 oncology"
        result = classifier.classify(text)
        assert 0.0 <= result.confidence <= 1.0
