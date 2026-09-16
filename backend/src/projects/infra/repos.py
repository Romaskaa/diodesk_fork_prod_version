from typing import override

from uuid import UUID

from sqlalchemy import Select, and_, exists, or_, select

from src.shared.infra.repos import ModelMapper, SqlAlchemyRepository
from src.shared.schemas import Page, Pagination

from ..domain.dtos import ProjectFilters

from ..domain.entities import Project, ProjectMember, ProjectStage
from ..domain.vo import MemberRole, ProjectKey
from .models import ProjectMemberOrm, ProjectOrm, ProjectStageOrm


class ProjectMemberMapper(ModelMapper[ProjectMember, ProjectMemberOrm]):
    @staticmethod
    def to_entity(model: ProjectMemberOrm) -> ProjectMember:
        return ProjectMember(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            project_id=model.project_id,
            user_id=model.user_id,
            roles=set(model.roles),
            created_by=model.created_by,
        )

    @staticmethod
    def from_entity(entity: ProjectMember) -> ProjectMemberOrm:
        return ProjectMemberOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            user_id=entity.user_id,
            project_id=entity.project_id,
            roles=list(entity.roles),
            created_by=entity.created_by,
        )


class ProjectStageMapper(ModelMapper[ProjectStage, ProjectStageOrm]):
    @staticmethod
    def to_entity(model: ProjectStageOrm) -> ProjectStage:
        return ProjectStage(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            project_id=model.project_id,
            name=model.name,
            execution_order=model.execution_order,
            status=model.status,
            planned_start=model.planned_start,
            planned_end=model.planned_end,
            started_at=model.started_at,
            completed_at=model.completed_at,
            responsible_id=model.responsible_id,
            description=model.description,
            completion_criteria=model.completion_criteria,
        )

    @staticmethod
    def from_entity(entity: ProjectStage) -> ProjectStageOrm:
        return ProjectStageOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            project_id=entity.project_id,
            name=entity.name,
            execution_order=entity.execution_order,
            status=entity.status,
            planned_start=entity.planned_start,
            planned_end=entity.planned_end,
            started_at=entity.started_at,
            completed_at=entity.completed_at,
            responsible_id=entity.responsible_id,
            description=entity.description,
            completion_criteria=entity.completion_criteria,
        )


class ProjectMapper(ModelMapper[Project, ProjectOrm]):
    @staticmethod
    def to_entity(model: ProjectOrm) -> Project:
        return Project(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            created_by=model.created_by,
            name=model.name,
            description=model.description,
            key=ProjectKey(model.key),
            counterparty_id=model.counterparty_id,
            owner_id=model.owner_id,
            status=model.status,
            stages=[ProjectStageMapper.to_entity(stage) for stage in model.stages]
        )

    @staticmethod
    def from_entity(entity: Project) -> ProjectOrm:
        return ProjectOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            created_by=entity.created_by,
            name=entity.name,
            key=entity.key.value,
            description=entity.description,
            counterparty_id=entity.counterparty_id,
            owner_id=entity.owner_id,
            status=entity.status,
            stages=[ProjectStageMapper.from_entity(stage) for stage in entity.stages],
        )


class SqlProjectRepository(SqlAlchemyRepository[Project, ProjectOrm]):
    model = ProjectOrm
    model_mapper = ProjectMapper

    async def get_by_key(self, key: ProjectKey) -> Project | None:
        stmt = select(self.model).where(self.model.key == key.value)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_existing_keys(self, keys: list[str]) -> set[str]:
        if not keys:
            return set()

        stmt = select(self.model.key).where(self.model.key.in_(keys))
        result = await self.session.execute(stmt)

        return {row[0] for row in result.all()}

    async def get_by_user_membership(
        self,
        user_id: UUID,
        pagination: Pagination,
        owner_only: bool = False,
    ) -> Page[Project]:
        stmt = select(self.model)
        membership_exists = exists().where(
            and_(
                ProjectMemberOrm.project_id == self.model.id,
                ProjectMemberOrm.user_id == user_id,
                ProjectMemberOrm.deleted_at.is_(None),
            )
        )

        if owner_only:
            stmt = stmt.where(self.model.owner_id == user_id)
        else:
            stmt = stmt.where(or_(self.model.owner_id == user_id, membership_exists))

        return await self._paginate(stmt, pagination)
    

    def _apply_project_filters(
        self, stmt: Select[tuple[ProjectOrm]], filters: ProjectFilters,
    ) -> Select[tuple[ProjectOrm]]:
        if filters.counterparty_id:
            stmt = stmt.where(self.model.counterparty_id == filters.counterparty_id)

        if filters.statuses:
            stmt = stmt.where(self.model.status.in_(filters.statuses))

        if filters.search_query:
            stmt = stmt.where(self.model.name.ilike(f"%{filters.search_query}%"))

        return stmt


    async def paginate(
        self, pagination: Pagination, filters: ProjectFilters | None = None,
    ) -> Page[Project]:
        stmt = select(self.model)

        if filters is not None:
            stmt = self._apply_project_filters(stmt, filters)

        return await self._paginate(stmt, pagination)

class SqlProjectMemberRepository(SqlAlchemyRepository[ProjectMember, ProjectMemberOrm]):
    model = ProjectMemberOrm
    model_mapper = ProjectMemberMapper

    @override
    async def paginate(
            self,
            pagination: Pagination,
            project_id: UUID | None = None,
            include_project_roles: list[MemberRole] | None = None,
    ) -> Page[ProjectMember]:
        stmt = select(self.model)

        if project_id is not None:
            stmt = stmt.where(self.model.project_id == project_id)

        if include_project_roles is not None:
            stmt = stmt.where(self.model.roles.in_(include_project_roles))

        return await self._paginate(stmt, pagination)

    async def find(self, project_id: UUID, user_id: UUID) -> ProjectMember | None:
        stmt = select(self.model).where(
            (self.model.project_id == project_id) & (self.model.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def get_by_user(self, user_id: UUID) -> list[ProjectMember]:
        stmt = select(self.model).where(
            (self.model.user_id == user_id) & (self.model.deleted_at.is_(None))
        )
        results = await self.session.execute(stmt)
        return [self.model_mapper.to_entity(model) for model in results.scalars().all()]
    async def list_by_project(self, project_id: UUID) -> list[ProjectMember]:
        stmt = select(self.model).where(
            self.model.project_id == project_id,
            self.model.deleted_at.is_(None)
        )
        result = await self.session.execute(stmt)
        models = result.scalars().all()
        return [self.model_mapper.to_entity(m) for m in models]