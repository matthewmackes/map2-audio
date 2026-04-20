from fastapi import FastAPI

from app.routes import midi as midi_routes


def test_legacy_midi_routes_are_marked_deprecated_in_openapi() -> None:
    assert midi_routes.router is not None

    app = FastAPI()
    app.include_router(midi_routes.router)

    schema = app.openapi()
    legacy_operations = [
        operation
        for path, methods in schema["paths"].items()
        if path.startswith("/api/midi")
        for operation in methods.values()
    ]

    assert legacy_operations
    assert all(operation.get("deprecated") is True for operation in legacy_operations)
