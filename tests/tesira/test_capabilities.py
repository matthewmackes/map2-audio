from app.services.tesira.capabilities import get_capabilities_for_model


def test_capabilities_detect_forte_ci():
    caps = get_capabilities_for_model("TesiraFORTE CI")
    assert caps.model_family == "FORTE_CI"
    assert caps.analog_inputs == 12
    assert caps.gpio_count == 4


def test_capabilities_unknown_fallback():
    caps = get_capabilities_for_model("SomeUnknownModel")
    assert caps.model_family == "UNKNOWN"
    assert caps.avb_max_channels >= 0
