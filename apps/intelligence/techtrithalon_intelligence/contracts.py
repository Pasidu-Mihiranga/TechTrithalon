"""Request/response contracts for the intelligence service.

Every contract here has a Java record twin in the Spring API. Spring is the operational
authority: this service receives everything it needs in the request and returns a result;
it holds no database credentials and never writes operational state.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class Contract(BaseModel):
    """Base for all wire contracts: unknown fields are rejected so drift fails loudly."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class HealthResponse(Contract):
    service: Literal["intelligence"] = "intelligence"
    status: Literal["ok"] = "ok"
    version: str
