from app.services.midi_hub.tesira_client import TesiraClient


def test_tesira_connect_command_and_subscription_flow():
    client = TesiraClient()

    status = client.connect(host="192.168.10.55", port=23, auto_reconnect=True)
    assert status["connected"] is True
    assert status["host"] == "192.168.10.55"

    aliases_response = client.send_command("SESSION get aliases")
    assert aliases_response["ok"] is True
    assert aliases_response["aliases"]

    level_response = client.send_command("Level1 set level -6.5")
    assert level_response["ok"] is True
    assert level_response["value"] == -6.5

    subscription = client.subscribe("Level1", "level")
    assert subscription["ok"] is True
    token = subscription["subscription"]["token"]
    assert token.startswith("Level1:level:")

    matrix = client.matrix_status()
    assert matrix
    assert matrix[0]["input"] == 1

    preset = client.recall_preset(1002)
    assert preset["ok"] is True
    assert preset["preset"]["preset_id"] == 1002

    removed = client.unsubscribe(token)
    assert removed["ok"] is True


def test_tesira_device_actions_and_disconnect():
    client = TesiraClient()
    client.connect(host="tesira.local")

    info = client.send_command("DEVICE get deviceInfo")
    assert info["ok"] is True
    assert "device_info" in info

    sleep = client.send_command("DEVICE sleep")
    assert sleep["ok"] is True
    assert sleep["device_info"]["sleeping"] is True

    wake = client.send_command("DEVICE wake")
    assert wake["ok"] is True
    assert wake["device_info"]["sleeping"] is False

    stopped = client.send_command("DEVICE stopAudio")
    assert stopped["ok"] is True
    assert stopped["device_info"]["audio_running"] is False

    disconnected = client.disconnect()
    assert disconnected["connected"] is False
