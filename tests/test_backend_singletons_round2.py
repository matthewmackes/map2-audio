from app.services.api_observatory import (
    get_api_observatory_service,
    reset_api_observatory_service,
)
from app.services.openapi_schema_sync import (
    get_openapi_schema_sync_service,
    reset_openapi_schema_sync_service,
)
from app.services.tesira.tesira_design_workspace import (
    get_tesira_design_workspace_service,
    reset_tesira_design_workspace_service,
)


def test_api_observatory_singleton_reset():
    reset_api_observatory_service()
    first = get_api_observatory_service()
    second = get_api_observatory_service()
    assert first is second

    reset_api_observatory_service()
    replacement = get_api_observatory_service()
    assert replacement is not first


def test_openapi_schema_sync_singleton_reset():
    reset_openapi_schema_sync_service()
    first = get_openapi_schema_sync_service()
    second = get_openapi_schema_sync_service()
    assert first is second

    reset_openapi_schema_sync_service()
    replacement = get_openapi_schema_sync_service()
    assert replacement is not first


def test_tesira_design_workspace_singleton_reset():
    reset_tesira_design_workspace_service()
    first = get_tesira_design_workspace_service()
    second = get_tesira_design_workspace_service()
    assert first is second

    reset_tesira_design_workspace_service()
    replacement = get_tesira_design_workspace_service()
    assert replacement is not first
