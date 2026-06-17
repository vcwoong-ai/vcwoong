"""
AgentRegistry ??maps sector keys to BaseSectorAgent instances.

All sector agents self-register by being imported.  The engine imports
this module and calls ``registry.get_agent(sector)`` to resolve the
correct agent for a given classification result.
"""

from __future__ import annotations

from typing import Optional

from src.agents.base import BaseSectorAgent


class AgentRegistry:
    """Singleton registry that maps sector keys ??agent instances."""

    def __init__(self) -> None:
        self._agents: dict[str, BaseSectorAgent] = {}

    def register(self, agent: BaseSectorAgent) -> None:
        """Register *agent* for each of its declared ``sector_keys``."""
        for key in agent.sector_keys:
            self._agents[key.lower()] = agent

    def get_agent(self, sector: str) -> Optional[BaseSectorAgent]:
        """Return the agent registered for *sector*, or ``None``."""
        return self._agents.get(sector.lower())

    def available_sectors(self) -> list[str]:
        """Return all registered sector keys."""
        return sorted(self._agents.keys())


# Module-level singleton used by ReportEngine
registry = AgentRegistry()


def register_all_agents() -> None:
    """Import every agent module so they can self-register.

    Add new sector agents here as they are implemented.
    """
    # pylint: disable=import-outside-toplevel
    from src.agents.bio_agent import BioSectorAgent  # noqa: F401

    registry.register(BioSectorAgent())
