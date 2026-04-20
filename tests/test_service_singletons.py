from app.services.nam_library import (
    NAMLibraryService,
    get_nam_library_service,
    initialize_nam_library,
    reset_nam_library_service,
)
from app.services.service_orchestrator import ServiceOrchestrator, get_orchestrator


def test_service_orchestrator_singleton_reset():
    ServiceOrchestrator.reset_instance()
    first = get_orchestrator()
    second = get_orchestrator()

    assert first is second

    ServiceOrchestrator.reset_instance()
    replacement = get_orchestrator()
    assert replacement is not first


def test_nam_library_singleton_reset_and_initialize(tmp_path):
    reset_nam_library_service()
    database_url = f"sqlite:///{tmp_path / 'nam.db'}"

    initialized = initialize_nam_library(database_url)
    fetched = get_nam_library_service()

    assert initialized is fetched
    assert fetched.database_url == database_url

    reset_nam_library_service()
    replacement = initialize_nam_library(f"sqlite:///{tmp_path / 'nam-2.db'}")
    assert replacement is not initialized
