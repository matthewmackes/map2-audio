from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import sessions as session_routes


def test_mark_session_saved_sets_utc_last_saved(monkeypatch):
    original_state = deepcopy(session_routes._session_state)
    app = FastAPI()
    app.include_router(session_routes.router)
    client = TestClient(app)

    monkeypatch.setattr(session_routes.session_manager, "get_current_session", lambda: None)

    try:
        session_routes._session_state["name"] = "Session A"
        session_routes._session_state["has_unsaved_changes"] = True
        session_routes._session_state["last_saved"] = None

        session_routes.mark_session_saved()

        response = client.get("/api/sessions/current/status")

        assert response.status_code == 200
        payload = response.json()
        parsed = datetime.fromisoformat(payload["last_saved"])
        assert parsed.tzinfo == timezone.utc
        assert payload["has_unsaved_changes"] is False
        assert payload["name"] == "Session A"
    finally:
        session_routes._session_state.clear()
        session_routes._session_state.update(original_state)
