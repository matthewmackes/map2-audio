from __future__ import annotations

import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_special_mode_auth_returns_503_when_password_unset(monkeypatch):
    monkeypatch.delenv("SPECIAL_MODE_PASSWORD", raising=False)
    module = importlib.import_module("app.routes.auth")
    module = importlib.reload(module)

    app = FastAPI()
    app.include_router(module.router)
    client = TestClient(app)
    response = client.post("/api/auth/special-backdoor", json={"password": "backdoor"})

    assert response.status_code == 503
