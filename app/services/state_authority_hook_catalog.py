"""Canonical activation-hook catalog for the State Authority.

Plan Q40/Q46/Q90 specify 5 activation hooks listed in
`~/.map2/config.json → activation_hooks`. The MAP2 platform actually runs 11
hooks (the 5 canonical plus 6 hardware-surface variants), which are stored
in the `state_authority.activation_hooks` DB config key. This module
exposes them as `ActivationHookConfig` objects so the new
`SnapshotActivationFSM` can consume the same hook list that the existing
`StateAuthorityActivationService` already runs.

The catalog is the authoritative mapping from hook name → module/function —
operators cannot invent a hook by listing a random name; they must pick
from this registry. New hooks are added here, the DB config list
determines which ones run and in what order.
"""

from __future__ import annotations

from app.services.snapshot_activation_fsm import ActivationHookConfig


# Plan §Activation Hooks Config — five canonical hooks named in the plan.
_PLAN_CANONICAL_HOOKS: tuple[ActivationHookConfig, ...] = (
    ActivationHookConfig(
        name="midi_map_sync",
        module="app.services.midi_service",
        function="sync_midi_map",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="expression_sync",
        module="app.services.expression_service",
        function="sync_mappings",
        phase="post_apply",
        enabled=True,
        timeout_ms=1000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="footswitch_labels",
        module="app.services.snapshot_footswitch_label_service",
        function="push_snapshot_footswitch_labels",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="controller_display",
        module="app.services.snapshot_controller_display_push_service",
        function="push_snapshot_controller_display_preview",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="maschine_encoders",
        module="app.services.maschine_encoder_map_service",
        function="push_encoder_map",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
)


# Additional MAP2-specific surface hooks that already run in the existing
# StateAuthorityActivationService. Documented here so the FSM can include
# them when an operator configures the extended hook list.
_MAP2_SURFACE_HOOKS: tuple[ActivationHookConfig, ...] = (
    ActivationHookConfig(
        name="push_push_surface_state",
        module="app.services.snapshot_push_surface_push_service",
        function="push_snapshot_push_surface_state",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="push_ground_control_pro_assignments",
        module="app.services.snapshot_ground_control_pro_push_service",
        function="push_snapshot_ground_control_pro_assignments",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="push_mcu_surface_state",
        module="app.services.snapshot_mcu_push_service",
        function="push_snapshot_mcu_surface_state",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="push_launch_control_assignments",
        module="app.services.snapshot_launch_control_push_service",
        function="push_snapshot_launch_control_assignments",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="push_midi_commander_assignments",
        module="app.services.snapshot_midi_commander_push_service",
        function="push_snapshot_midi_commander_assignments",
        phase="post_apply",
        enabled=True,
        timeout_ms=2000,
        on_error="warn",
    ),
    ActivationHookConfig(
        name="schedule_preload",
        module="app.services.snapshot_preload",
        function="schedule_snapshot_preload_for_live_snapshot",
        phase="post_apply",
        enabled=True,
        timeout_ms=500,
        on_error="warn",
    ),
)


# All 11 known hooks combined. The canonical-5 always come first per the
# plan's "run in listed order" (Q46) for parity with the FSM spec.
_ALL_HOOKS_BY_NAME: dict[str, ActivationHookConfig] = {
    hook.name: hook for hook in (*_PLAN_CANONICAL_HOOKS, *_MAP2_SURFACE_HOOKS)
}


def canonical_activation_hook_names() -> tuple[str, ...]:
    """The 5 plan-canonical hook names in their canonical order."""
    return tuple(hook.name for hook in _PLAN_CANONICAL_HOOKS)


def map2_activation_hook_names() -> tuple[str, ...]:
    """The 6 MAP2-specific hardware surface hook names in canonical order."""
    return tuple(hook.name for hook in _MAP2_SURFACE_HOOKS)


def all_known_hook_names() -> tuple[str, ...]:
    """Every hook name the catalog knows about (plan-canonical + MAP2 surfaces)."""
    return tuple(_ALL_HOOKS_BY_NAME.keys())


def lookup_hook(name: str) -> ActivationHookConfig | None:
    """Return the catalog entry for a hook name, or None for unknown."""
    return _ALL_HOOKS_BY_NAME.get(str(name or "").strip())


def hook_configs_for(names: list[str] | tuple[str, ...]) -> tuple[ActivationHookConfig, ...]:
    """Resolve a list of hook names (in order) to their ActivationHookConfigs.
    Unknown names are silently dropped; operators configure hooks only from
    the catalog, so an unknown name is operator error or stale DB state."""
    resolved: list[ActivationHookConfig] = []
    for name in names or []:
        entry = lookup_hook(name)
        if entry is not None:
            resolved.append(entry)
    return tuple(resolved)


def default_hook_configs() -> tuple[ActivationHookConfig, ...]:
    """Default hook ordering for a fresh MAP2 install — the plan-canonical 5
    followed by the MAP2 hardware surface set, matching the ordering the
    existing StateAuthorityActivationService runs with."""
    return (*_PLAN_CANONICAL_HOOKS, *_MAP2_SURFACE_HOOKS)
