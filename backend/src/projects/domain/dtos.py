from dataclasses import dataclass
from uuid import UUID

from .vo import ProjectStatus


@dataclass
class ProjectFilters:
    """Все возможные фильтры для проектов."""

    counterparty_id: UUID | None = None
    statuses: set[ProjectStatus] | None = None
    search_query: str | None = None