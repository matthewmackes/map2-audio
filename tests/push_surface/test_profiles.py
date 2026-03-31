from app.services.push_surface.device_profile import (
    GENERIC_PUSH_PROFILE,
    PUSH_2_PROFILE,
    guess_profile_for_ports,
)


def test_guess_profile_prefers_matching_push_generation():
    profile = guess_profile_for_ports(["Ableton Push 2 Live Port", "Ableton Push 2 User Port"])
    assert profile.profile_id == PUSH_2_PROFILE.profile_id


def test_generic_profile_exposes_grid_and_buttons():
    pad = GENERIC_PUSH_PROFILE.pad_binding(0, 0)
    assert pad is not None
    assert pad.logical_name == "grid_0_0"
    assert GENERIC_PUSH_PROFILE.binding_for_logical_name("page_home") is not None
    assert GENERIC_PUSH_PROFILE.binding_for_logical_name("encoder_0") is not None
