import os
import pytest


@pytest.fixture(autouse=True)
def _enable_test_mode(monkeypatch):
    monkeypatch.setenv("MAP2_TEST_MODE", "true")
    yield
