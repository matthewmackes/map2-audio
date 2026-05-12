"""T2512-OPENAPI-SCHEMA — generated-doc audit for the looper router.

Existing tests (tests/test_looper_routes.py) verify that each route
object has a `summary` and `operation_id`. That checks the *source*
metadata. This test mounts the looper router on a fresh FastAPI app
and inspects the *generated* OpenAPI document so a regression in
include_router config, tag wiring, or path-param shape can't slip
through unnoticed.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.looper import router as looper_router


# ---------------------------------------------------------------------------
# Path enumeration — all 13 routes show up under /api/v1/looper
# ---------------------------------------------------------------------------


EXPECTED_PATHS_BY_METHOD: dict[str, set[str]] = {
    "get": {
        "/api/v1/looper/status",
    },
    "post": {
        "/api/v1/looper/track/{track}/record",
        "/api/v1/looper/track/{track}/stop",
        "/api/v1/looper/track/{track}/clear",
        "/api/v1/looper/track/{track}/undo",
        "/api/v1/looper/track/{track}/redo",
    },
    "patch": {
        "/api/v1/looper/track/{track}/level",
        "/api/v1/looper/track/{track}/muted",
        "/api/v1/looper/track/{track}/soloed",
        "/api/v1/looper/track/{track}/reverse",
        "/api/v1/looper/track/{track}/half-speed",
        "/api/v1/looper/track/{track}/locked",
        "/api/v1/looper/track/{track}/one-shot",
        "/api/v1/looper/track/{track}/auto-armed",
        "/api/v1/looper/track/{track}/auto-threshold",
        "/api/v1/looper/master/level",
    },
}


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(looper_router)
    return app


def test_openapi_doc_includes_every_looper_path() -> None:
    """The generated paths section enumerates every route we expect."""
    schema = _build_app().openapi()
    actual = set(schema["paths"].keys())
    expected = set().union(*EXPECTED_PATHS_BY_METHOD.values())
    missing = expected - actual
    extra_under_looper = {
        p for p in actual - expected if p.startswith("/api/v1/looper")
    }
    assert not missing, f"missing looper paths in OpenAPI doc: {missing}"
    assert not extra_under_looper, (
        f"unexpected new looper paths in OpenAPI doc (update test?): "
        f"{extra_under_looper}"
    )


def test_openapi_doc_assigns_looper_tag_to_every_operation() -> None:
    """Every operation under /api/v1/looper must carry the 'looper'
    tag so the Swagger UI groups them together."""
    schema = _build_app().openapi()
    failures: list[str] = []
    for path, methods in schema["paths"].items():
        if not path.startswith("/api/v1/looper"):
            continue
        for method, op in methods.items():
            if method == "parameters":
                continue
            tags = op.get("tags") or []
            if "looper" not in tags:
                failures.append(f"{method.upper()} {path} tags={tags}")
    assert not failures, f"operations missing 'looper' tag: {failures}"


def test_openapi_doc_has_summary_for_every_looper_op() -> None:
    """Mirror of the route-object test but against the generated doc —
    catches the case where a route's `summary` is dropped during
    schema generation (e.g. through middleware or a custom
    `app.openapi` override)."""
    schema = _build_app().openapi()
    failures: list[str] = []
    for path, methods in schema["paths"].items():
        if not path.startswith("/api/v1/looper"):
            continue
        for method, op in methods.items():
            if method == "parameters":
                continue
            if not op.get("summary"):
                failures.append(f"{method.upper()} {path}")
    assert not failures, f"operations missing summary: {failures}"


def test_openapi_doc_assigns_unique_operationids() -> None:
    schema = _build_app().openapi()
    op_ids: list[str] = []
    for path, methods in schema["paths"].items():
        if not path.startswith("/api/v1/looper"):
            continue
        for method, op in methods.items():
            if method == "parameters":
                continue
            op_id = op.get("operationId")
            if op_id:
                op_ids.append(op_id)
    duplicates = {oid for oid in op_ids if op_ids.count(oid) > 1}
    assert not duplicates, f"duplicate operationId values: {duplicates}"


# ---------------------------------------------------------------------------
# Path-param shape: every /track/{track}/* route exposes the integer param
# ---------------------------------------------------------------------------


def test_track_routes_expose_integer_track_path_param() -> None:
    schema = _build_app().openapi()
    track_routes = [
        path for path in schema["paths"].keys()
        if path.startswith("/api/v1/looper/track/")
    ]
    assert track_routes, "expected at least one /track/ route in the OpenAPI doc"
    for path in track_routes:
        methods = schema["paths"][path]
        for method, op in methods.items():
            if method == "parameters":
                continue
            params = op.get("parameters", [])
            track_param = next(
                (p for p in params if p.get("name") == "track"
                 and p.get("in") == "path"),
                None,
            )
            assert track_param is not None, (
                f"{method.upper()} {path} missing path param 'track'"
            )
            schema_obj = track_param.get("schema", {})
            assert schema_obj.get("type") == "integer", (
                f"{method.upper()} {path} 'track' should be integer, "
                f"got {schema_obj}"
            )


# ---------------------------------------------------------------------------
# Response-schema shape: every looper route returns LooperStatusResponse
# ---------------------------------------------------------------------------


def test_every_looper_op_returns_looper_status_response() -> None:
    """Every successful response must point at #/components/schemas/LooperStatusResponse
    so a typed client (TypeScript via openapi-typescript) gets a
    stable return type."""
    schema = _build_app().openapi()
    failures: list[str] = []
    for path, methods in schema["paths"].items():
        if not path.startswith("/api/v1/looper"):
            continue
        for method, op in methods.items():
            if method == "parameters":
                continue
            ok = op.get("responses", {}).get("200", {})
            content = ok.get("content", {}).get("application/json", {})
            ref = content.get("schema", {}).get("$ref", "")
            if "LooperStatusResponse" not in ref:
                failures.append(f"{method.upper()} {path} → {ref!r}")
    assert not failures, (
        f"operations not returning LooperStatusResponse: {failures}"
    )


def test_looper_status_schema_contains_bpm_and_one_shot_fields() -> None:
    """Spot-check that recently-added fields (T2512-CLOCK bpm,
    T2512-OS one_shot, T2512-AUTO auto_armed) survive into the
    generated schema. A regression in the Pydantic model would drop
    them silently."""
    schema = _build_app().openapi()
    comp = schema.get("components", {}).get("schemas", {})
    status_schema = comp.get("LooperStatusResponse", {})
    track_schema = comp.get("TrackStatusResponse", {})

    assert "bpm" in status_schema.get("properties", {}), (
        "T2512-CLOCK regression: LooperStatusResponse.bpm missing"
    )

    track_props = track_schema.get("properties", {})
    for required_field in (
        "locked", "one_shot", "auto_armed", "auto_threshold_db",
    ):
        assert required_field in track_props, (
            f"TrackStatusResponse.{required_field} missing from generated schema"
        )
