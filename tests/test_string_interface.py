from app.services.midi_hub.string_interface import StringInterfaceService


def test_string_interface_config_send_receive_and_clear():
    service = StringInterfaceService()

    status = service.configure(
        enabled=True,
        listen_host="0.0.0.0",
        listen_port=3037,
        target_host="192.168.10.20",
        target_port=4040,
    )
    assert status["enabled"] is True
    assert status["target_port"] == 4040

    outbound = service.send("GO 12")
    assert outbound["ok"] is True
    assert outbound["entry"]["parsed"]["action"] == "cue_go"

    inbound = service.receive("MACRO START_SHOW")
    assert inbound["ok"] is True
    assert inbound["entry"]["parsed"]["action"] == "macro"

    snapshot = service.status()
    assert snapshot["log_count"] == 2

    cleared = service.clear_logs()
    assert cleared["ok"] is True
    assert cleared["cleared"] == 2
