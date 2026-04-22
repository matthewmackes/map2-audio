"""Tests for the activation hook catalog."""

from __future__ import annotations

from app.services.state_authority_hook_catalog import (
    all_known_hook_names,
    canonical_activation_hook_names,
    default_hook_configs,
    hook_configs_for,
    lookup_hook,
    map2_activation_hook_names,
)


def test_plan_canonical_hooks_are_exactly_five():
    """Plan §Activation Hooks Config lists exactly 5 canonical hooks."""
    canonical = canonical_activation_hook_names()
    assert canonical == (
        "midi_map_sync",
        "expression_sync",
        "footswitch_labels",
        "controller_display",
        "maschine_encoders",
    )


def test_map2_surface_hooks_cover_all_hardware_surfaces():
    map2 = map2_activation_hook_names()
    for required in (
        "push_push_surface_state",
        "push_ground_control_pro_assignments",
        "push_mcu_surface_state",
        "push_launch_control_assignments",
        "push_midi_commander_assignments",
        "schedule_preload",
    ):
        assert required in map2


def test_all_known_hooks_combine_canonical_and_map2_surfaces():
    names = all_known_hook_names()
    assert len(names) == 11
    for name in canonical_activation_hook_names():
        assert name in names
    for name in map2_activation_hook_names():
        assert name in names


def test_lookup_hook_returns_full_config_for_known_hook():
    hook = lookup_hook("midi_map_sync")
    assert hook is not None
    assert hook.module == "app.services.midi_service"
    assert hook.function == "sync_midi_map"
    assert hook.phase == "post_apply"
    assert hook.enabled is True
    assert hook.on_error == "warn"
    assert hook.timeout_ms == 2000


def test_lookup_hook_returns_none_for_unknown():
    assert lookup_hook("ghost_hook") is None
    assert lookup_hook("") is None
    assert lookup_hook(None) is None  # type: ignore[arg-type]


def test_hook_configs_for_preserves_order_and_drops_unknown():
    configs = hook_configs_for(["footswitch_labels", "ghost", "midi_map_sync"])
    assert len(configs) == 2
    assert configs[0].name == "footswitch_labels"
    assert configs[1].name == "midi_map_sync"


def test_hook_configs_for_empty_list_returns_empty_tuple():
    assert hook_configs_for([]) == ()
    assert hook_configs_for(None) == ()  # type: ignore[arg-type]


def test_default_hook_configs_puts_canonical_first():
    configs = default_hook_configs()
    # Plan Q46 — run in listed order, canonical 5 first for parity with plan.
    canonical_count = len(canonical_activation_hook_names())
    canonical_names_in_defaults = tuple(cfg.name for cfg in configs[:canonical_count])
    assert canonical_names_in_defaults == canonical_activation_hook_names()


def test_every_default_hook_has_plan_required_metadata_fields():
    """Plan Q90 — full fields with metadata: name, module, function, phase,
    enabled, timeout_ms, on_error."""
    for cfg in default_hook_configs():
        assert cfg.name
        assert cfg.module
        assert cfg.function
        assert cfg.phase
        assert isinstance(cfg.enabled, bool)
        assert isinstance(cfg.timeout_ms, int)
        assert cfg.timeout_ms > 0
        assert cfg.on_error in {"warn", "abort", "ignore"}
