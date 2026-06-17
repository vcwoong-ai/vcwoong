"""
BaseSectorAgent ??abstract base class for all sector-specific agents.

Every sector agent must implement ``generate()``.  The engine calls that
method after routing the context to the correct agent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from src.models.context import SectorContext
from src.models.report import Report


class BaseSectorAgent(ABC):
    """Common interface for sector agents.

    Class attributes
    ----------------
    sector_keys : tuple[str, ...]
        Lower-case sector identifiers this agent handles.
        Used by the registry to build the routing table.
    agent_name : str
        Human-readable display name shown in generated reports.
    """

    sector_keys: ClassVar[tuple[str, ...]] = ()
    agent_name: ClassVar[str] = "BaseAgent"

    @abstractmethod
    def generate(self, context: SectorContext) -> Report:
        """Generate a structured report for the given context.

        Parameters
        ----------
        context:
            All available input data for the target company / asset.

        Returns
        -------
        Report
            A fully populated ``Report`` instance ready to be serialised.
        """

    # ------------------------------------------------------------------
    # Optional hooks ??override in subclasses as needed
    # ------------------------------------------------------------------

    def validate_context(self, context: SectorContext) -> list[str]:
        """Return a list of warning strings for missing/suspect data.

        Called by ``generate()`` implementations; returned warnings are
        attached to the final ``Report``.
        """
        warnings: list[str] = []
        if not context.description.strip():
            warnings.append("?뚯궗 ?ㅻ챸(description)??鍮꾩뼱 ?덉뒿?덈떎.")
        return warnings
