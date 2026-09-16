from typing import ClassVar

from src.iam.domain.authz import PermissionResult, Subject
from src.iam.domain.entities import User
from src.projects.domain.entities import ProjectMember
from src.projects.domain.vo import MemberRole

from .entities import Task
from .vo import TaskStatus


class IsProjectStaffRule:
    ALLOWED_PROJECT_ROLES: ClassVar[set[MemberRole]] = {
        MemberRole.CONTRIBUTOR, MemberRole.MANAGER, MemberRole.OWNER
    }

    def __init__(self, membership: ProjectMember | None = None) -> None:
        self.membership = membership

    def check(self) -> PermissionResult:
        return PermissionResult(True)

class TaskEditingRule:
    def __init__(self, subject: Subject, task: Task) -> None:
        self.subject = subject
        self.task = task

    def check(self) -> PermissionResult:
        if str(self.subject.id) in {str(self.task.assignee_id), str(self.task.created_by)}:
            return PermissionResult(True)

        return PermissionResult(False, "Only assignee or creator can edit this task")


class TaskReviewerStatusRule:
    """
    Правило перевода задачи в следующий статус для проверяющего.
    """

    ALLOWED_NEXT_STATUSES: ClassVar[set[TaskStatus]] = {
        TaskStatus.TO_FIX,
        TaskStatus.TO_TEST,
        TaskStatus.DONE,
        TaskStatus.CANCELLED,
    }
    
    ALLOWED_FROM_STATUSES: ClassVar[set[TaskStatus]] = {
        TaskStatus.TO_REVIEW,
        TaskStatus.DONE,
    }

    def __init__(self, subject: Subject, task: Task, new_status: TaskStatus) -> None:
        self.subject = subject
        self.task = task
        self.new_status = new_status

    def check(self) -> PermissionResult:
        if str(self.task.reviewer_id) != str(self.subject.id):
            return PermissionResult(False, "You are not the reviewer for this task")

        if self.task.status not in self.ALLOWED_FROM_STATUSES:
            return PermissionResult(
                False,
                f"Task reviewer can only change from: "
                f"{', '.join([status.value for status in self.ALLOWED_FROM_STATUSES])}",
            )

        if self.new_status not in self.ALLOWED_NEXT_STATUSES:
            return PermissionResult(
                False,
                f"Task reviewer can only change to: "
                f"{', '.join([status.value for status in self.ALLOWED_NEXT_STATUSES])}",
            )
        return PermissionResult(True)
class TaskAssigneeStatusRule:
    """
    Правило перевода задачи в новый статус для её исполнителя.
    """

    ALLOWED_NEXT_STATUSES: ClassVar[set[TaskStatus]] = {
        TaskStatus.BACKLOG,
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.BLOCKED,
        TaskStatus.PAUSED,
        TaskStatus.TO_REVIEW,
        TaskStatus.TO_FIX, 
        TaskStatus.TO_TEST,
        TaskStatus.DONE,
        TaskStatus.CANCELLED,
    }

    def __init__(self, subject: Subject, task: Task, new_status: TaskStatus) -> None:
        self.subject = subject
        self.task = task
        self.new_status = new_status

    def check(self) -> PermissionResult:
        if str(self.task.assignee_id) != str(self.subject.id):
            return PermissionResult(False, "You are not the assignee of this task")

        if self.new_status not in self.ALLOWED_NEXT_STATUSES:
            return PermissionResult(
                False,
                f"Task assignee can only change to: "
                f"{', '.join([status.value for status in self.ALLOWED_NEXT_STATUSES])}",
            )

        return PermissionResult(True)


class IsTaskReviewer:
    def __init__(self, subject: Subject | User, task: Task) -> None:
        self.subject = subject
        self.task = task

    def check(self) -> PermissionResult:
        if str(self.subject.id) == str(self.task.reviewer_id):
            return PermissionResult(True)

        return PermissionResult(False, "You are not the reviewer for this task")


class IsTaskCreator:
    def __init__(self, subject: Subject, task: Task) -> None:
        self.subject = subject
        self.task = task

    def check(self) -> PermissionResult:
        if str(self.subject.id) == str(self.task.created_by):
            return PermissionResult(True)

        return PermissionResult(False, "You are not the creator of this task")