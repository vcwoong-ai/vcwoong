"""
SectorClassifier ??keyword/rule-based sector detection.

Sectors are identified by matching against a prioritised list of keyword sets.
If the caller supplies an explicit ``sector_hint`` on the context it always wins.
Otherwise the classifier scores the company description and name against each
sector's keyword list and returns the highest-scoring match.

Currently supported sectors
----------------------------
- ``bio``       ??Biotechnology / pharmaceutical / healthcare
- ``finance``   ??Banking, asset management, insurance, fintech
- ``tech``      ??Software, semiconductors, cloud, AI/ML hardware
- ``energy``    ??Oil & gas, renewables, utilities
- ``unknown``   ??Fallback when no sector reaches the confidence threshold
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Keyword taxonomy
# ---------------------------------------------------------------------------

# Each entry is (sector_key, list_of_keywords).
# Keywords are matched case-insensitively against the concatenation of the
# company name + description.  Longer / more specific terms score higher.

_SECTOR_KEYWORDS: list[tuple[str, list[str]]] = [
    (
        "bio",
        [
            # Company-type signals
            "biotech", "biopharma", "pharma", "pharmaceutical",
            "therapeutics", "biosciences", "bioscience", "biologics",
            "immunotherapy", "oncology", "biologic",
            # Clinical / regulatory
            "clinical trial", "clinical stage", "phase 1", "phase 2", "phase 3",
            "ph1", "ph2", "ph3", "ind ", "nda", "bla", "anda",
            "fda approval", "fda approved", "ema approval",
            # Asset types
            "pipeline", "drug candidate", "mab", "antibody", "vaccine",
            "gene therapy", "cell therapy", "car-t", "mrna", "adc",
            "small molecule", "recombinant",
            # Financial / valuation terms specific to bio
            "rnpv", "r-npv", "loa", "likelihood of approval",
            "peak sales", "royalty", "milestone",
            # Disease areas
            "cancer", "tumor", "carcinoma", "diabetes", "fibrosis",
            "alzheimer", "parkinson", "rare disease", "orphan drug",
            "autoimmune", "inflammation", "infectious disease",
            # Healthcare broader
            "healthcare", "health care", "hospital", "medical device",
            "diagnostics", "in vitro",
        ],
    ),
    (
        "finance",
        [
            "bank", "banking", "investment bank", "asset management",
            "hedge fund", "private equity", "venture capital",
            "insurance", "fintech", "payment", "lending",
            "credit", "mortgage", "brokerage", "wealth management",
            "fund manager", "portfolio",
        ],
    ),
    (
        "tech",
        [
            "software", "saas", "cloud", "semiconductor", "chip",
            "artificial intelligence", "machine learning", "deep learning",
            "data center", "gpu", "cpu", "networking", "cybersecurity",
            "e-commerce", "platform", "api", "developer tools",
        ],
    ),
    (
        "energy",
        [
            "oil", "gas", "petroleum", "refinery", "lng",
            "renewable", "solar", "wind energy", "nuclear",
            "utilities", "power generation", "electricity",
        ],
    ),
]

# Minimum cumulative score to assign a sector instead of "unknown"
_CONFIDENCE_THRESHOLD = 1


# ---------------------------------------------------------------------------
# Dataclass result
# ---------------------------------------------------------------------------

@dataclass
class ClassificationResult:
    sector: str                             # Winning sector key (lower-case)
    confidence: float                       # Normalised 0?? score
    scores: dict[str, float] = field(default_factory=dict)
    source: str = "auto"                    # "hint" | "auto" | "fallback"

    @property
    def is_bio(self) -> bool:
        return self.sector in {"bio", "healthcare"}


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------

class SectorClassifier:
    """Classify a company/context into a sector."""

    def classify(
        self,
        text: str,
        sector_hint: Optional[str] = None,
    ) -> ClassificationResult:
        """Return the best-matching sector for *text*.

        Parameters
        ----------
        text:
            Concatenated company name + description (or any free text).
        sector_hint:
            Optional caller-supplied sector override.  If provided, it is
            normalised and returned immediately without scoring.
        """
        if sector_hint:
            normalised = self._normalise_hint(sector_hint)
            return ClassificationResult(
                sector=normalised,
                confidence=1.0,
                source="hint",
            )

        return self._score(text)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalise_hint(hint: str) -> str:
        """Map common aliases to canonical sector keys."""
        h = hint.lower().strip()
        aliases: dict[str, str] = {
            "healthcare": "bio",
            "health care": "bio",
            "pharma": "bio",
            "pharmaceutical": "bio",
            "biotech": "bio",
            "biopharma": "bio",
            "medical": "bio",
            "financial": "finance",
            "fintech": "finance",
            "banking": "finance",
            "technology": "tech",
            "software": "tech",
        }
        return aliases.get(h, h)

    @staticmethod
    def _score(text: str) -> ClassificationResult:
        # Split CamelCase / PascalCase so compound names like "GeneBiotech"
        # become "gene biotech" and word-boundary patterns can match.
        expanded = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
        normalised = expanded.lower()
        # Replace common punctuation so multi-word terms still match
        normalised = re.sub(r"[_\-/]", " ", normalised)

        scores: dict[str, float] = {}
        for sector_key, keywords in _SECTOR_KEYWORDS:
            total = 0.0
            for kw in keywords:
                pattern = re.compile(r"\b" + re.escape(kw) + r"\b")
                matches = pattern.findall(normalised)
                if matches:
                    # Longer keywords get higher weight
                    total += len(matches) * (1 + len(kw.split()) * 0.5)
            scores[sector_key] = total

        best_sector = max(scores, key=lambda k: scores[k])
        best_score = scores[best_sector]

        if best_score < _CONFIDENCE_THRESHOLD:
            return ClassificationResult(
                sector="unknown",
                confidence=0.0,
                scores=scores,
                source="fallback",
            )

        # Normalise: divide by sum so confidence is 0??
        total_score = sum(scores.values()) or 1.0
        confidence = round(best_score / total_score, 3)

        return ClassificationResult(
            sector=best_sector,
            confidence=confidence,
            scores=scores,
            source="auto",
        )
