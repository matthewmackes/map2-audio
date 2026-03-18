import asyncio

from app.routes import services as services_routes


class _FakeOrchestrator:
    def get_all_status(self):
        return {
            "services": {
                "database": {
                    "display_name": "Database",
                    "priority": 1,
                    "dependencies": [],
                    "is_optional": False,
                },
                "command_queue": {
                    "display_name": "Command Queue",
                    "priority": 3,
                    "dependencies": ["database"],
                    "is_optional": False,
                },
                "websocket_manager": {
                    "display_name": "WebSocket Manager",
                    "priority": 3,
                    "dependencies": [],
                    "is_optional": False,
                },
            },
            "startup_order": ["database", "websocket_manager", "command_queue"],
        }

    def get_startup_dependency_map(self):
        return {
            "traffic_gate_services": ["database", "command_queue", "websocket_manager"],
            "dependency_levels": [
                {"level": 1, "services": ["database", "websocket_manager"]},
                {"level": 2, "services": ["command_queue"]},
            ],
            "startup_progress": {
                "completed_services": 2,
                "total_services": 3,
                "completed_levels": 1,
                "total_levels": 2,
            },
            "services": {
                "database": {
                    "level": 1,
                    "dependents": ["command_queue"],
                    "gates_accepting_traffic": True,
                },
                "websocket_manager": {
                    "level": 1,
                    "dependents": [],
                    "gates_accepting_traffic": True,
                },
                "command_queue": {
                    "level": 2,
                    "dependents": [],
                    "gates_accepting_traffic": True,
                },
            },
        }


def test_startup_order_exposes_dependency_levels_and_traffic_gates(monkeypatch):
    monkeypatch.setattr(
        "app.routes.services.get_orchestrator",
        lambda: _FakeOrchestrator(),
    )

    payload = asyncio.run(services_routes.get_startup_order())

    assert payload["traffic_gate_services"] == ["database", "command_queue", "websocket_manager"]
    assert payload["dependency_levels"][0]["services"] == ["database", "websocket_manager"]
    assert payload["startup_progress"]["completed_levels"] == 1
    assert payload["startup_order"][0]["level"] == 1
    assert payload["startup_order"][0]["dependents"] == ["command_queue"]
    assert payload["startup_order"][0]["gates_accepting_traffic"] is True
