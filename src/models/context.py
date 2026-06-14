"""
SectorContext — the input payload passed to every sector agent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class FinancialProjection:
    """Minimal financial projection for a single pipeline asset.

    All monetary values are in USD millions unless stated otherwise.
    """

    asset_name: str
    peak_sales_usd_million: Optional[float] = None    # 최대 매출 추정 (USD M)
    years_to_launch: Optional[float] = None           # 발매까지 남은 연수
    royalty_rate: Optional[float] = None              # 로열티율 (0–1)
    revenue_duration_years: Optional[float] = None    # 독점기간 (years)
    probability_of_approval: Optional[float] = None   # LoA (0–1), overrides table if set


@dataclass
class SectorContext:
    """All input data available to the report engine for one company."""

    company_name: str
    description: str                                    # Free-text description / filing text
    sector_hint: Optional[str] = None                  # Optional caller-supplied sector tag
    raw_pipeline: list[dict[str, Any]] = field(default_factory=list)
    financial_projections: list[FinancialProjection] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)  # Catch-all for additional data
