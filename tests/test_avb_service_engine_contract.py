import asyncio

from app.services.avb.avb_service import (
    AvbService,
    AvbStreamConfig,
    StreamDirection,
    StreamState,
)


def _stream_config(stream_id: str) -> AvbStreamConfig:
    return AvbStreamConfig(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )


class _SnakeCaseEngine:
    def __init__(self):
        self.calls = []
        self._streams = set()

    def is_avb_available(self):
        self.calls.append(("is_avb_available",))
        return True

    def create_avb_stream(self, config):
        self.calls.append(("create_avb_stream", dict(config)))
        stream_id = config.get("stream_id")
        if stream_id in self._streams:
            return {"success": False, "error": "duplicate stream"}
        self._streams.add(stream_id)
        return {"success": True}

    def start_avb_stream(self, stream_id):
        self.calls.append(("start_avb_stream", stream_id))
        return {"success": stream_id in self._streams}

    def stop_avb_stream(self, stream_id):
        self.calls.append(("stop_avb_stream", stream_id))
        return {"success": stream_id in self._streams}

    def delete_avb_stream(self, stream_id):
        self.calls.append(("delete_avb_stream", stream_id))
        if stream_id not in self._streams:
            return {"success": False, "error": "not found"}
        self._streams.remove(stream_id)
        return {"success": True}

    def get_avb_stream_stats(self, stream_id):
        self.calls.append(("get_avb_stream_stats", stream_id))
        return {
            "frames_sent": 11,
            "framesReceived": 8,
            "bytesTransferred": 4096,
        }

    def reset_avb_stream_stats(self, stream_id):
        self.calls.append(("reset_avb_stream_stats", stream_id))
        return stream_id in self._streams


class _CamelCaseEngine:
    def __init__(self):
        self.calls = []
        self._streams = set()

    def isAvbAvailable(self):
        self.calls.append(("isAvbAvailable",))
        return True

    def createAvbStream(self, config):
        self.calls.append(("createAvbStream", dict(config)))
        self._streams.add(config.get("stream_id"))
        return {"success": True}

    def startAvbStream(self, stream_id):
        self.calls.append(("startAvbStream", stream_id))
        return {"success": True}

    def stopAvbStream(self, stream_id):
        self.calls.append(("stopAvbStream", stream_id))
        return {"success": True}

    def deleteAvbStream(self, stream_id):
        self.calls.append(("deleteAvbStream", stream_id))
        self._streams.discard(stream_id)
        return {"success": True}


class _SnakeCaseEngineWithAvdeccConnections(_SnakeCaseEngine):
    def __init__(self):
        super().__init__()
        self._active_connections = [
            {
                "talker_entity_id": "0011223344556677",
                "talker_unique_id": 1,
                "listener_entity_id": "8899aabbccddeeff",
                "listener_unique_id": 2,
                "stream_id": "00000000000000aa",
                "stream_vlan_id": 2,
                "stream_dest_mac": "91:e0:f0:00:fe:01",
                "connected": True,
            }
        ]

    def get_active_connections(self):
        self.calls.append(("get_active_connections",))
        return list(self._active_connections)


def test_avb_service_lifecycle_uses_snake_case_engine_contract():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    create_result = asyncio.run(service.create_stream(_stream_config("stream-1")))
    assert create_result == {"stream_id": "stream-1", "status": "created"}
    assert service.streams["stream-1"].state == StreamState.STOPPED

    create_call = next(call for call in engine.calls if call[0] == "create_avb_stream")
    create_payload = create_call[1]
    assert create_payload["stream_id"] == "stream-1"
    assert create_payload["direction"] == "talker"
    assert "srp_reservation_id" not in create_payload
    assert "srp_admission_id" not in create_payload
    assert "srp_metadata" not in create_payload
    for field_name in (
        "owner_node_id",
        "peer_node_id",
        "owner_endpoint_id",
        "peer_endpoint_id",
        "talker_node_id",
        "listener_node_id",
        "talker_endpoint_id",
        "listener_endpoint_id",
    ):
        assert field_name not in create_payload

    start_result = asyncio.run(service.start_stream("stream-1"))
    assert start_result == {"status": "started"}
    assert service.streams["stream-1"].state == StreamState.RUNNING
    assert service.streams["stream-1"].error is None

    stats = service.get_stream_stats("stream-1")
    assert stats is not None
    assert stats["frames_sent"] == 11
    assert stats["frames_received"] == 8
    assert stats["bytes_transferred"] == 4096

    assert service.reset_stream_stats("stream-1") is True
    reset_stats = service.get_stream_stats("stream-1")
    assert reset_stats is not None
    assert reset_stats["frames_sent"] == 11

    stop_result = asyncio.run(service.stop_stream("stream-1"))
    assert stop_result == {"status": "stopped"}
    assert service.streams["stream-1"].state == StreamState.STOPPED
    assert service.streams["stream-1"].error is None

    delete_result = asyncio.run(service.delete_stream("stream-1"))
    assert delete_result == {"status": "deleted"}
    assert "stream-1" not in service.streams


def test_avb_service_lifecycle_uses_camel_case_fallback():
    service = AvbService()
    engine = _CamelCaseEngine()
    service.set_engine(engine)

    create_result = asyncio.run(service.create_stream(_stream_config("stream-2")))
    assert create_result == {"stream_id": "stream-2", "status": "created"}

    start_result = asyncio.run(service.start_stream("stream-2"))
    assert start_result == {"status": "started"}
    assert service.streams["stream-2"].state == StreamState.RUNNING

    stop_result = asyncio.run(service.stop_stream("stream-2"))
    assert stop_result == {"status": "stopped"}
    assert service.streams["stream-2"].state == StreamState.STOPPED

    delete_result = asyncio.run(service.delete_stream("stream-2"))
    assert delete_result == {"status": "deleted"}
    assert "stream-2" not in service.streams

    method_names = [entry[0] for entry in engine.calls]
    assert "createAvbStream" in method_names
    assert "startAvbStream" in method_names
    assert "stopAvbStream" in method_names
    assert "deleteAvbStream" in method_names


def test_avb_service_stream_payload_includes_deterministic_ownership_metadata():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    cfg = _stream_config("stream-ownership")
    cfg.owner_node_id = "node-a"
    cfg.peer_node_id = "node-b"
    cfg.owner_endpoint_id = "0011223344556677:1"
    cfg.peer_endpoint_id = "8899aabbccddeeff:2"
    cfg.talker_node_id = "node-a"
    cfg.listener_node_id = "node-b"
    cfg.talker_endpoint_id = "0011223344556677:1"
    cfg.listener_endpoint_id = "8899aabbccddeeff:2"

    create_result = asyncio.run(service.create_stream(cfg))
    assert create_result == {"stream_id": "stream-ownership", "status": "created"}

    payload = service.get_stream("stream-ownership")
    assert payload is not None
    ownership = payload["ownership"]
    assert ownership["owner_node_id"] == "node-a"
    assert ownership["peer_node_id"] == "node-b"
    assert ownership["talker_node_id"] == "node-a"
    assert ownership["listener_node_id"] == "node-b"
    assert ownership["owner_endpoint_id"] == "0011223344556677:1"
    assert ownership["peer_endpoint_id"] == "8899aabbccddeeff:2"
    assert ownership["talker_endpoint_id"] == "0011223344556677:1"
    assert ownership["listener_endpoint_id"] == "8899aabbccddeeff:2"
    assert ownership["node_ids"] == ["node-a", "node-b"]
    assert ownership["endpoint_ids"] == ["0011223344556677:1", "8899aabbccddeeff:2"]


def test_start_stream_failure_sets_error_state():
    class _Engine(_SnakeCaseEngine):
        def start_avb_stream(self, _stream_id):
            return {"success": False, "error": "start failed"}

    service = AvbService()
    service.set_engine(_Engine())

    create_result = asyncio.run(service.create_stream(_stream_config("stream-err")))
    assert create_result["status"] == "created"

    start_result = asyncio.run(service.start_stream("stream-err"))
    assert start_result["code"] == "START_FAILED"
    assert "start failed" in start_result["error"]
    assert service.streams["stream-err"].state == StreamState.ERROR
    assert "start failed" in (service.streams["stream-err"].error or "")


def test_create_stream_returns_engine_not_ready_when_engine_is_missing():
    service = AvbService()
    service.is_available = lambda: True
    service.set_engine(None)
    service._ensure_engine_bound = lambda: None

    result = asyncio.run(service.create_stream(_stream_config("stream-3")))

    assert result["code"] == "ENGINE_NOT_READY"
    assert "Engine not initialized" in result["error"]


def test_is_available_prefers_snake_case_probe():
    class _Engine:
        def __init__(self):
            self.calls = []

        def is_avb_available(self):
            self.calls.append("snake")
            return True

        def isAvbAvailable(self):
            self.calls.append("camel")
            return False

    service = AvbService()
    engine = _Engine()
    service.set_engine(engine)

    assert service.is_available() is True
    assert engine.calls == ["snake"]


def test_is_available_uses_camel_case_fallback():
    class _Engine:
        def isAvbAvailable(self):
            return True

    service = AvbService()
    service.set_engine(_Engine())

    assert service.is_available() is True


def test_avb_service_rapid_lifecycle_churn_keeps_registry_consistent():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    for idx in range(25):
        stream_id = f"stream-churn-{idx}"
        create_result = asyncio.run(service.create_stream(_stream_config(stream_id)))
        assert create_result == {"stream_id": stream_id, "status": "created"}

        start_result = asyncio.run(service.start_stream(stream_id))
        assert start_result == {"status": "started"}

        stop_result = asyncio.run(service.stop_stream(stream_id))
        assert stop_result == {"status": "stopped"}

        delete_result = asyncio.run(service.delete_stream(stream_id))
        assert delete_result == {"status": "deleted"}

    assert service.streams == {}


def test_avb_service_start_recovery_clears_error_after_retry():
    class _Engine(_SnakeCaseEngine):
        def __init__(self):
            super().__init__()
            self._first_start_failed = False

        def start_avb_stream(self, stream_id):
            if not self._first_start_failed:
                self._first_start_failed = True
                return {"success": False, "error": "network interruption"}
            return super().start_avb_stream(stream_id)

    service = AvbService()
    service.set_engine(_Engine())

    create_result = asyncio.run(service.create_stream(_stream_config("stream-recover")))
    assert create_result["status"] == "created"

    start_failed = asyncio.run(service.start_stream("stream-recover"))
    assert start_failed["code"] == "START_FAILED"
    assert service.streams["stream-recover"].state == StreamState.ERROR
    assert "network interruption" in (service.streams["stream-recover"].error or "")

    start_recovered = asyncio.run(service.start_stream("stream-recover"))
    assert start_recovered == {"status": "started"}
    assert service.streams["stream-recover"].state == StreamState.RUNNING
    assert service.streams["stream-recover"].error is None


def test_avb_service_mixed_direction_churn_and_stats_reset():
    service = AvbService()

    class _Engine(_SnakeCaseEngine):
        def get_avb_stream_stats(self, stream_id):
            # After reset we want zeros to verify state cleared; otherwise reuse base payload.
            if getattr(self, "_zero_after_reset", False):
                return {"frames_sent": 0, "frames_received": 0, "bytesTransferred": 0}
            return super().get_avb_stream_stats(stream_id)

        def reset_avb_stream_stats(self, stream_id):
            self._zero_after_reset = True
            return super().reset_avb_stream_stats(stream_id)

    engine = _Engine()
    service.set_engine(engine)

    stream_ids = [f"stream-mixed-{idx}" for idx in range(10)]

    # Create alternating talker/listener streams
    for idx, stream_id in enumerate(stream_ids):
        direction = StreamDirection.TALKER if idx % 2 == 0 else StreamDirection.LISTENER
        cfg = _stream_config(stream_id)
        cfg.direction = direction
        create_result = asyncio.run(service.create_stream(cfg))
        assert create_result["status"] == "created"

    # Start all, then stop in reverse to stress ordering
    for stream_id in stream_ids:
        assert asyncio.run(service.start_stream(stream_id))["status"] == "started"

    for stream_id in reversed(stream_ids):
        assert asyncio.run(service.stop_stream(stream_id))["status"] == "stopped"
        # ensure stats snapshot still available even after stop
        stats = service.get_stream_stats(stream_id)
        assert stats is not None

    # Reset stats for a subset and confirm zeroed
    subset = stream_ids[:3]
    for stream_id in subset:
        assert service.reset_stream_stats(stream_id) is True
        stats = service.get_stream_stats(stream_id)
        assert stats is not None
        assert stats["frames_sent"] == 0
        assert stats["frames_received"] == 0

    # Delete all
    for stream_id in stream_ids:
        assert asyncio.run(service.delete_stream(stream_id))["status"] == "deleted"

    assert service.streams == {}


def test_stop_stream_is_idempotent_and_avoids_duplicate_engine_calls():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    asyncio.run(service.create_stream(_stream_config("stream-idem-stop")))
    asyncio.run(service.start_stream("stream-idem-stop"))

    first = asyncio.run(service.stop_stream("stream-idem-stop"))
    second = asyncio.run(service.stop_stream("stream-idem-stop"))

    assert first == {"status": "stopped"}
    assert second == {"status": "already_stopped"}

    stop_calls = [c for c in engine.calls if c[0] == "stop_avb_stream"]
    assert len(stop_calls) == 1


def test_delete_stream_is_idempotent_after_first_delete():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    asyncio.run(service.create_stream(_stream_config("stream-idem-delete")))
    asyncio.run(service.start_stream("stream-idem-delete"))
    asyncio.run(service.stop_stream("stream-idem-delete"))

    first = asyncio.run(service.delete_stream("stream-idem-delete"))
    second = asyncio.run(service.delete_stream("stream-idem-delete"))

    assert first == {"status": "deleted"}
    assert second == {"status": "deleted"}

    delete_calls = [c for c in engine.calls if c[0] == "delete_avb_stream"]
    assert len(delete_calls) == 1


def test_avb_service_projects_active_avdecc_connections_into_stream_payloads():
    service = AvbService()
    engine = _SnakeCaseEngineWithAvdeccConnections()
    service.set_engine(engine)

    all_streams = service.get_all_streams()
    assert len(all_streams) == 1
    projected = all_streams[0]

    assert projected["source"] == "avdecc_connection"
    assert projected["state"] == "running"
    assert projected["config"]["interface"] == "avdecc"
    assert projected["config"]["device_type"] == "avdecc"
    assert projected["config"]["avdecc_stream_id"] == "00000000000000aa"
    assert projected["config"]["stream_vlan_id"] == 2
    assert projected["ownership"]["talker_endpoint_id"] == "0011223344556677:1"
    assert projected["ownership"]["listener_endpoint_id"] == "8899aabbccddeeff:2"
    assert projected["avdecc_connection"]["stream_dest_mac"] == "91:e0:f0:00:fe:01"

    stream_id = projected["stream_id"]
    fetched = service.get_stream(stream_id)
    assert fetched is not None
    assert fetched["stream_id"] == stream_id
    assert fetched["source"] == "avdecc_connection"

    stats = service.get_stream_stats(stream_id)
    assert stats is not None
    assert stats["frames_sent"] == 0
    assert stats["frames_received"] == 0
    assert stats["sequence_errors"] == 0


def test_channel_capabilities_payload_includes_local_and_avb_inventory():
    service = AvbService()
    engine = _SnakeCaseEngine()
    service.set_engine(engine)

    capabilities = service.get_channel_capabilities(
        system_info={
            "audio_device": "Jogg USB Audio",
            "input_channels": 2,
            "output_channels": 2,
            "sample_rate": 48000,
        }
    )

    assert "readiness" in capabilities
    assert capabilities["device"] == "Jogg USB Audio"
    assert len(capabilities["local_inputs"]) == 2
    assert len(capabilities["local_outputs"]) == 2
    assert "summary" in capabilities
    assert capabilities["summary"]["local_input_count"] == 2
    assert capabilities["summary"]["local_output_count"] == 2
