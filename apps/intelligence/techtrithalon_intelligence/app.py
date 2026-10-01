from fastapi import FastAPI

from techtrithalon_intelligence import __version__
from techtrithalon_intelligence.contracts import HealthResponse

app = FastAPI(title="TechTrithalon Intelligence", version=__version__)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(version=__version__)
