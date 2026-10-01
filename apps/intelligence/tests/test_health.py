import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from techtrithalon_intelligence.app import app
from techtrithalon_intelligence.contracts import HealthResponse

client = TestClient(app)


def test_health_matches_contract() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert HealthResponse.model_validate(response.json()) == HealthResponse(version="0.1.0")


def test_contracts_reject_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        HealthResponse.model_validate({"service": "intelligence", "status": "ok", "version": "x", "extra": 1})


def test_service_has_no_database_configuration() -> None:
    """Python must never hold operational DB credentials (Spring is the source of truth)."""
    import os

    leaked = [k for k in os.environ if k.startswith(("SPRING_DATASOURCE", "POSTGRES_", "DATABASE_URL"))]
    assert not leaked, f"database settings visible to the intelligence service: {leaked}"
