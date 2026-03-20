from app.services.midi_hub.virtual_gpio import VirtualGpioService


def test_virtual_gpio_snapshot_toggle_and_label():
    service = VirtualGpioService()

    snapshot = service.snapshot()
    assert snapshot["input_count"] == 12
    assert snapshot["output_count"] == 12

    renamed = service.set_label("in-01", "Go button")
    assert renamed["label"] == "Go button"

    toggled = service.toggle("in-01")
    assert toggled["ok"] is True
    assert toggled["channel"]["state"] is True

    output = service.set_state("out-03", True, source="macro")
    assert output["channel"]["state"] is True
    assert output["event"]["source"] == "macro"

    final_snapshot = service.snapshot()
    assert len(final_snapshot["events"]) == 2
