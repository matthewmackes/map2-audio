from app.services.usb_audio_manager import USBAudioManager, USBDeviceStatus


def test_get_device_status_dict_includes_non_hotone_usb_audio_devices(monkeypatch):
    manager = USBAudioManager()
    manager.detected_devices = [
        USBDeviceStatus(
            vendor_id="84ef",
            product_id="0014",
            name="Hotone Jogg",
            bus="001",
            device="002",
            speed="12",
            power_control="on",
            autosuspend_delay=0,
            is_connected=True,
            alsa_device="hw:2,0",
            is_hotone=True,
            hotone_model="jogg",
        ),
        USBDeviceStatus(
            vendor_id="0582",
            product_id="0074",
            name="EDIROL UA-1000",
            bus="001",
            device="003",
            speed="480",
            power_control="on",
            autosuspend_delay=0,
            is_connected=True,
            alsa_device="hw:3,0",
            is_hotone=False,
        ),
    ]
    manager.primary_device = manager.detected_devices[0]

    monkeypatch.setattr(manager, "detect_usb_devices", lambda: manager.detected_devices)

    payload = manager.get_device_status_dict()

    assert payload["hotone_detected"] is True
    assert payload["device_count"] == 2
    assert [device["name"] for device in payload["all_devices"]] == ["Hotone Jogg", "EDIROL UA-1000"]
