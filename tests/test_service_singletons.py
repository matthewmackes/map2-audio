import warnings

warnings.filterwarnings(
    "ignore",
    message="ServiceManager is deprecated.*",
    category=DeprecationWarning,
)

from app.services.nam_library import (
    NAMLibraryService,
    get_nam_library_service,
    initialize_nam_library,
    reset_nam_library_service,
)
from app.services.service_manager import (
    ServiceManager,
    get_service_manager,
    reset_service_manager,
)


def test_service_manager_singleton_reset():
    reset_service_manager()
    first = get_service_manager()
    second = get_service_manager()

    assert first is second

    reset_service_manager()
    replacement = get_service_manager()
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
