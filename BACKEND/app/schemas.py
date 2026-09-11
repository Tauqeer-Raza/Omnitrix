from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Permission = Literal["documents", "knowledge", "code", "tasks", "audit", "admin"]
Group = Literal["MASTER", "VISION", "FAST", "LIBRARIAN"]
Password = Annotated[str, StringConstraints(strip_whitespace=False)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginInput(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: Password = Field(min_length=1, max_length=128)


class TaskInput(StrictModel):
    prompt: str = Field(min_length=1, max_length=8000)
    title: str | None = Field(None, max_length=120)
    type: Literal["general", "document", "code"] | None = None
    conversationId: str | None = Field(None, max_length=64)
    documentIds: list[str] = Field(default_factory=list, max_length=10)
    scenario: Literal["normal"] = "normal"


class UserCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    department: str = Field(min_length=1, max_length=120)
    password: Password = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def email_shape(cls, value):
        if "@" not in value or "." not in value.rsplit("@", 1)[-1]:
            raise ValueError("Provide a valid email address.")
        return value.lower()


class UserPatch(StrictModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    department: str | None = Field(None, min_length=1, max_length=120)
    role: Literal["user", "admin"] | None = None
    permissions: list[Permission] | None = None
    modelAccess: list[Group] | None = None
    dailyLimit: int | None = Field(None, ge=1000)
    monthlyLimit: int | None = Field(None, ge=1000)
    enabled: bool | None = None
    password: Password | None = Field(None, min_length=12, max_length=128)


class ModelPatch(StrictModel):
    enabled: bool | None = None
    priority: int | None = Field(None, ge=1, le=10)
    nodeId: str | None = Field(None, max_length=64)
    role: str | None = Field(None, max_length=200)
    context: int | None = Field(None, ge=512, le=2000000)


class NodeCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    host: str = Field(min_length=1, max_length=254)
    type: str = Field(min_length=1, max_length=100)
    accelerator: str = Field(min_length=1, max_length=100)
    memory: int = Field(gt=0, le=100000)
    capacity: int = Field(gt=0, le=1000)
    status: Literal["online", "offline", "degraded"] = "offline"


class NodePatch(StrictModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    host: str | None = Field(None, min_length=1, max_length=254)
    type: str | None = Field(None, max_length=100)
    accelerator: str | None = Field(None, max_length=100)
    memory: int | None = Field(None, gt=0, le=100000)
    capacity: int | None = Field(None, gt=0, le=1000)
    status: Literal["online", "offline", "degraded"] | None = None


class RoutingPatch(StrictModel):
    primaryId: str | None = Field(None, max_length=64)
    fallbackId: str | None = Field(None, max_length=64)
    strategy: Literal["priority", "least_loaded"] | None = None


class PolicyPatch(StrictModel):
    organization: str | None = Field(None, min_length=1, max_length=120)
    dailyLimit: int | None = Field(None, ge=1000)
    monthlyLimit: int | None = Field(None, ge=1000)
    retentionDays: int | None = Field(None, ge=1, le=3650)
    timeout: int | None = Field(None, ge=10, le=3600)
    offline: bool | None = None
    departmentLimits: dict[str, int] | None = None
    requireReview: bool | None = None

    @field_validator("departmentLimits")
    @classmethod
    def limits(cls, value):
        if value and any(v < 1000 for v in value.values()):
            raise ValueError("Department limits must be at least 1,000 tokens.")
        return value


class Plan(StrictModel):
    type: Literal["general", "document", "code"]
    use_knowledge: bool = False
    reason: str = Field("", max_length=240)


def patch_values(model):
    values = model.model_dump(exclude_unset=True)
    if any(v is None for v in values.values()):
        from .domain import APIError

        raise APIError("VALIDATION", "Configuration values cannot be null.", 422)
    return values
