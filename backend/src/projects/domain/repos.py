from typing import override

from uuid import UUID

from .dtos import ProjectFilters

from src.shared.domain.repos import Repository
from src.shared.schemas import Page, Pagination

from .entities import Project, ProjectMember
from .vo import ProjectKey, MemberRole


class ProjectRepository(Repository[Project]):


    @override
    async def paginate(
        self, pagination: Pagination, filters: ProjectFilters | None = None,
    ) -> Page[Project]: ...

    async def get_by_key(self, key: ProjectKey) -> Project | None:
        """Получение проекта по его уникальному ключу"""

    async def get_existing_keys(self, keys: list[str]) -> set[str]:
        """
        Возвращает множество ключей, которые уже существуют.
        Оптимизировано для пакетной проверки.
        """

    async def get_by_user_membership(
            self,
            user_id: UUID,
            pagination: Pagination,
            owner_only: bool = False,
    ) -> Page[Project]:
        """
        Получение проектов в которых состоит пользователь
        """


class ProjectMemberRepository(Repository[ProjectMember]):

    @override
    async def paginate(
            self,
            pagination: Pagination,
            project_id: UUID | None = None,
            include_project_roles: list[MemberRole] | None = None,
    ) -> Page[ProjectMember]: ...

    async def find(self, project_id: UUID, user_id: UUID) -> ProjectMember | None:
        """Поиск участника внутри проекта по уникальной комбинации"""

    async def get_by_user(self, user_id: UUID) -> list[ProjectMember]:
        """
        Возвращает все членства пользователя во всех проектах.
        Используется для получения полного списка проектов пользователя
        (например, для построения селектора проектов или персональной панели).
        """ 
    async def list_by_project(self, project_id: UUID) -> list[ProjectMember]:
        """Получить всех участников проекта."""

