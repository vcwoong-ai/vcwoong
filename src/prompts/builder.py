"""
PromptBuilder — assemble the system prompt for a given sector and context.

Loads YAML templates from ``src/prompts/templates/``, substitutes runtime
variables, and returns the final prompt string.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from src.models.context import SectorContext
from src.models.report import MISSING_DATA_PLACEHOLDER

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def _load_yaml(name: str) -> dict[str, Any]:
    path = _TEMPLATES_DIR / f"{name}.yaml"
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _substitute(template: str, variables: dict[str, str]) -> str:
    """Replace ``{{ key }}`` placeholders in *template*."""
    def replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        return variables.get(key, match.group(0))

    return re.sub(r"\{\{\s*(\w+)\s*\}\}", replacer, template)


class PromptBuilder:
    """Build the full system prompt for a given sector + context."""

    def build(self, sector: str, context: SectorContext) -> str:
        """Return the assembled system prompt string.

        The base template is always included.  If a sector-specific template
        exists for *sector* it is appended after the base.
        """
        base = _load_yaml("base")
        variables = self._variables(context)

        parts: list[str] = [
            _substitute(base.get("system_prompt", ""), variables),
        ]

        # Append sector-specific additions if the template file exists
        sector_template_path = _TEMPLATES_DIR / f"{sector.lower()}.yaml"
        if sector_template_path.exists():
            sector_cfg = _load_yaml(sector.lower())
            additional = sector_cfg.get("additional_instructions", "")
            if additional:
                parts.append(_substitute(additional, variables))

        return "\n\n".join(parts)

    # ------------------------------------------------------------------

    @staticmethod
    def _variables(context: SectorContext) -> dict[str, str]:
        pipeline_count = len(context.raw_pipeline)
        fin_count = len(context.financial_projections)
        summary_lines = [
            f"- Company: {context.company_name}",
            f"- Description: {context.description[:500]}{'...' if len(context.description) > 500 else ''}",
            f"- Pipeline entries supplied: {pipeline_count}",
            f"- Financial projections supplied: {fin_count}",
        ]
        return {
            "company_name": context.company_name,
            "sector": context.sector_hint or "unknown",
            "missing_placeholder": MISSING_DATA_PLACEHOLDER,
            "context_summary": "\n".join(summary_lines),
        }
