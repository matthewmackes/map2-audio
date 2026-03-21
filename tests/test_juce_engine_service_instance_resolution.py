from app.services.juce_engine_service import JuceEngineService


class _FakePedalboardEngine:
    def __init__(self, items):
        self._items = list(items)

    def get_current_pedalboard(self):
        return {"name": "Test", "items": list(self._items)}


def test_get_instance_id_for_uri_prefers_matching_position_for_duplicates():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101, "position": 0},
        {"uri": "urn:test:duplicate", "instance_id": 202, "position": 3},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate", 3) == 202  # noqa: SLF001


def test_get_instance_id_for_uri_falls_back_to_first_match_without_position():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101},
        {"uri": "urn:test:duplicate", "instance_id": 202},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate") == 101  # noqa: SLF001
