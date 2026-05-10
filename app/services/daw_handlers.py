"""T2503 Set 4 — DAW service ``engine_command`` handler suite.

Mirrors the architecture of ``app/services/engine_command_handlers.py``: each
verb is a closure factory taking a ``DawHandlerHooks`` dataclass; ``None``
hooks log + count without side-effects so the dispatcher path is
exercisable in CI without a running engine.

17 verbs registered in this module (locked decision A22 / Set 4 deliverable):

  Transport
    daw.transport.play                    (action=set)
    daw.transport.stop                    (action=set)
    daw.transport.record                  (action=set: 1=arm, 0=disarm)
    daw.transport.set_position            (value=samples)

  Project lifecycle
    daw.project.new                       (args=[name])
    daw.project.load                      (args=[path])
    daw.project.save                      (action=set)

  Tracks
    daw.track.create                      (args=[type, name?])
    daw.track.delete                      (action=set, value=track_id)
    daw.track.set_arm                     (value=track_id, args=[bool])

  Clips
    daw.clip.add                          (args=[track_id, start_samples, length_samples, source])
    daw.clip.remove                       (args=[clip_id])
    daw.clip.move                         (args=[clip_id, new_start_samples])

  Automation
    daw.automation.set_point              (args=[lane_id, position, value])

  Plugins
    daw.plugin.add_to_track               (args=[track_id, plugin_uri])
    daw.plugin.remove_from_track          (args=[track_id, slot_index])
    daw.plugin.set_param                  (args=[track_id, slot_index, param_id, value])
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

from app.services.engine_command_dispatcher import (
    EngineCommandContext,
    EngineCommandDispatcher,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hook function signatures
# ---------------------------------------------------------------------------

# Transport hooks
_TransportPlayFn = Callable[[], None]
_TransportStopFn = Callable[[], None]
_TransportRecordFn = Callable[[bool], None]  # arm
_TransportSetPositionFn = Callable[[int], None]  # samples

# Project lifecycle hooks
_ProjectNewFn = Callable[[str], None]  # project name
_ProjectLoadFn = Callable[[str], None]  # path to project.json
_ProjectSaveFn = Callable[[], None]

# Track hooks
_TrackCreateFn = Callable[..., int]  # (type, name=None) -> new track id
_TrackDeleteFn = Callable[[int], None]
_TrackSetArmFn = Callable[[int, bool], None]

# Clip hooks
_ClipAddFn = Callable[..., int]  # (track_id, start, length, source) -> new clip id
_ClipRemoveFn = Callable[[int], None]
_ClipMoveFn = Callable[[int, int], None]  # (clip_id, new_start)

# Automation hooks
_AutomationSetPointFn = Callable[[int, float, float], None]  # (lane_id, position, value)

# Plugin hooks
_PluginAddToTrackFn = Callable[[int, str], int]  # (track_id, plugin_uri) -> slot_index
_PluginRemoveFromTrackFn = Callable[[int, int], None]  # (track_id, slot_index)
_PluginSetParamFn = Callable[[int, int, str, float], None]  # (track_id, slot, param_id, value)


@dataclass
class DawHandlerHooks:
    """Bundle of side-effect functions DAW handlers call.

    Each hook is optional — ``None`` means "no production binding wired up
    yet"; the handler logs and returns. This lets the dispatcher path land
    before the engine-side methods are finalized (Set 7+ wires real
    DawDeviceManager + DawProjectLoader hooks).
    """

    transport_play: Optional[_TransportPlayFn] = None
    transport_stop: Optional[_TransportStopFn] = None
    transport_record: Optional[_TransportRecordFn] = None
    transport_set_position: Optional[_TransportSetPositionFn] = None

    project_new: Optional[_ProjectNewFn] = None
    project_load: Optional[_ProjectLoadFn] = None
    project_save: Optional[_ProjectSaveFn] = None

    track_create: Optional[_TrackCreateFn] = None
    track_delete: Optional[_TrackDeleteFn] = None
    track_set_arm: Optional[_TrackSetArmFn] = None

    clip_add: Optional[_ClipAddFn] = None
    clip_remove: Optional[_ClipRemoveFn] = None
    clip_move: Optional[_ClipMoveFn] = None

    automation_set_point: Optional[_AutomationSetPointFn] = None

    plugin_add_to_track: Optional[_PluginAddToTrackFn] = None
    plugin_remove_from_track: Optional[_PluginRemoveFromTrackFn] = None
    plugin_set_param: Optional[_PluginSetParamFn] = None


# ---------------------------------------------------------------------------
# Argument extraction helpers
# ---------------------------------------------------------------------------

def _expect_args(ctx: EngineCommandContext, n: int) -> Optional[list[Any]]:
    if len(ctx.args) < n:
        logger.warning(
            "%s: expected %d args, got %d (args=%r)",
            ctx.target, n, len(ctx.args), ctx.args,
        )
        return None
    return ctx.args


def _expect_int(value: Any, *, target: str, label: str) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        logger.warning("%s: %s is not int (got %r)", target, label, value)
        return None


def _expect_float(value: Any, *, target: str, label: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning("%s: %s is not float (got %r)", target, label, value)
        return None


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.lower() in ("1", "true", "on", "yes")
    return bool(value)


# ---------------------------------------------------------------------------
# Transport handlers
# ---------------------------------------------------------------------------

def _make_transport_play_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if hooks.transport_play is None:
            logger.info("daw.transport.play: no hook wired; would start transport")
            return
        hooks.transport_play()
    return handler


def _make_transport_stop_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if hooks.transport_stop is None:
            logger.info("daw.transport.stop: no hook wired; would stop transport")
            return
        hooks.transport_stop()
    return handler


def _make_transport_record_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        arm = _truthy(ctx.value) if ctx.value is not None else _truthy(ctx.action == "set")
        if hooks.transport_record is None:
            logger.info("daw.transport.record: no hook wired; would set record_arm=%s", arm)
            return
        hooks.transport_record(arm)
    return handler


def _make_transport_set_position_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if ctx.value is None:
            logger.warning("daw.transport.set_position: missing value (samples)")
            return
        samples = _expect_int(ctx.value, target=ctx.target, label="position")
        if samples is None:
            return
        if hooks.transport_set_position is None:
            logger.info("daw.transport.set_position: no hook wired; would set position=%d", samples)
            return
        hooks.transport_set_position(samples)
    return handler


# ---------------------------------------------------------------------------
# Project lifecycle handlers
# ---------------------------------------------------------------------------

def _make_project_new_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 1)
        if args is None:
            return
        name = str(args[0])
        if hooks.project_new is None:
            logger.info("daw.project.new: no hook wired; would create project %r", name)
            return
        hooks.project_new(name)
    return handler


def _make_project_load_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 1)
        if args is None:
            return
        path = str(args[0])
        if hooks.project_load is None:
            logger.info("daw.project.load: no hook wired; would load %r", path)
            return
        hooks.project_load(path)
    return handler


def _make_project_save_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if hooks.project_save is None:
            logger.info("daw.project.save: no hook wired; would save current project")
            return
        hooks.project_save()
    return handler


# ---------------------------------------------------------------------------
# Track handlers
# ---------------------------------------------------------------------------

def _make_track_create_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 1)
        if args is None:
            return
        track_type = str(args[0])
        name = str(args[1]) if len(args) > 1 else None
        if hooks.track_create is None:
            logger.info(
                "daw.track.create: no hook wired; would create %s track %r",
                track_type, name,
            )
            return
        hooks.track_create(track_type, name=name) if name is not None else hooks.track_create(track_type)
    return handler


def _make_track_delete_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if ctx.value is None:
            logger.warning("daw.track.delete: missing value (track_id)")
            return
        track_id = _expect_int(ctx.value, target=ctx.target, label="track_id")
        if track_id is None:
            return
        if hooks.track_delete is None:
            logger.info("daw.track.delete: no hook wired; would delete track %d", track_id)
            return
        hooks.track_delete(track_id)
    return handler


def _make_track_set_arm_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        if ctx.value is None:
            logger.warning("daw.track.set_arm: missing value (track_id)")
            return
        track_id = _expect_int(ctx.value, target=ctx.target, label="track_id")
        if track_id is None:
            return
        args = _expect_args(ctx, 1)
        if args is None:
            return
        arm = _truthy(args[0])
        if hooks.track_set_arm is None:
            logger.info("daw.track.set_arm: no hook wired; would arm track %d -> %s", track_id, arm)
            return
        hooks.track_set_arm(track_id, arm)
    return handler


# ---------------------------------------------------------------------------
# Clip handlers
# ---------------------------------------------------------------------------

def _make_clip_add_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 4)
        if args is None:
            return
        track_id = _expect_int(args[0], target=ctx.target, label="track_id")
        start = _expect_int(args[1], target=ctx.target, label="start_samples")
        length = _expect_int(args[2], target=ctx.target, label="length_samples")
        if track_id is None or start is None or length is None:
            return
        source = str(args[3])
        if hooks.clip_add is None:
            logger.info(
                "daw.clip.add: no hook wired; would add clip on track %d at %d (length %d) source=%r",
                track_id, start, length, source,
            )
            return
        hooks.clip_add(track_id, start, length, source)
    return handler


def _make_clip_remove_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 1)
        if args is None:
            return
        clip_id = _expect_int(args[0], target=ctx.target, label="clip_id")
        if clip_id is None:
            return
        if hooks.clip_remove is None:
            logger.info("daw.clip.remove: no hook wired; would remove clip %d", clip_id)
            return
        hooks.clip_remove(clip_id)
    return handler


def _make_clip_move_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 2)
        if args is None:
            return
        clip_id = _expect_int(args[0], target=ctx.target, label="clip_id")
        new_start = _expect_int(args[1], target=ctx.target, label="new_start_samples")
        if clip_id is None or new_start is None:
            return
        if hooks.clip_move is None:
            logger.info("daw.clip.move: no hook wired; would move clip %d to %d", clip_id, new_start)
            return
        hooks.clip_move(clip_id, new_start)
    return handler


# ---------------------------------------------------------------------------
# Automation handlers
# ---------------------------------------------------------------------------

def _make_automation_set_point_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 3)
        if args is None:
            return
        lane_id = _expect_int(args[0], target=ctx.target, label="lane_id")
        position = _expect_float(args[1], target=ctx.target, label="position")
        value = _expect_float(args[2], target=ctx.target, label="value")
        if lane_id is None or position is None or value is None:
            return
        if hooks.automation_set_point is None:
            logger.info(
                "daw.automation.set_point: no hook wired; lane %d pos=%.4f val=%.4f",
                lane_id, position, value,
            )
            return
        hooks.automation_set_point(lane_id, position, value)
    return handler


# ---------------------------------------------------------------------------
# Plugin handlers
# ---------------------------------------------------------------------------

def _make_plugin_add_to_track_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 2)
        if args is None:
            return
        track_id = _expect_int(args[0], target=ctx.target, label="track_id")
        if track_id is None:
            return
        plugin_uri = str(args[1])
        if hooks.plugin_add_to_track is None:
            logger.info(
                "daw.plugin.add_to_track: no hook wired; track %d uri=%r",
                track_id, plugin_uri,
            )
            return
        hooks.plugin_add_to_track(track_id, plugin_uri)
    return handler


def _make_plugin_remove_from_track_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 2)
        if args is None:
            return
        track_id = _expect_int(args[0], target=ctx.target, label="track_id")
        slot = _expect_int(args[1], target=ctx.target, label="slot_index")
        if track_id is None or slot is None:
            return
        if hooks.plugin_remove_from_track is None:
            logger.info(
                "daw.plugin.remove_from_track: no hook wired; track %d slot %d",
                track_id, slot,
            )
            return
        hooks.plugin_remove_from_track(track_id, slot)
    return handler


def _make_plugin_set_param_handler(hooks: DawHandlerHooks) -> Callable[[EngineCommandContext], None]:
    def handler(ctx: EngineCommandContext) -> None:
        args = _expect_args(ctx, 4)
        if args is None:
            return
        track_id = _expect_int(args[0], target=ctx.target, label="track_id")
        slot = _expect_int(args[1], target=ctx.target, label="slot_index")
        param_id = str(args[2])
        value = _expect_float(args[3], target=ctx.target, label="param_value")
        if track_id is None or slot is None or value is None:
            return
        if hooks.plugin_set_param is None:
            logger.info(
                "daw.plugin.set_param: no hook wired; track %d slot %d param=%r value=%.4f",
                track_id, slot, param_id, value,
            )
            return
        hooks.plugin_set_param(track_id, slot, param_id, value)
    return handler


# ---------------------------------------------------------------------------
# Public registration entrypoint
# ---------------------------------------------------------------------------

DAW_VERBS: tuple[str, ...] = (
    "daw.transport.play",
    "daw.transport.stop",
    "daw.transport.record",
    "daw.transport.set_position",
    "daw.project.new",
    "daw.project.load",
    "daw.project.save",
    "daw.track.create",
    "daw.track.delete",
    "daw.track.set_arm",
    "daw.clip.add",
    "daw.clip.remove",
    "daw.clip.move",
    "daw.automation.set_point",
    "daw.plugin.add_to_track",
    "daw.plugin.remove_from_track",
    "daw.plugin.set_param",
)


def register_daw_handlers(
    dispatcher: EngineCommandDispatcher,
    hooks: Optional[DawHandlerHooks] = None,
) -> None:
    """Wire all 17 ``daw.*`` handlers into a dispatcher.

    Pass a populated ``DawHandlerHooks`` to bind real engine side effects;
    pass ``None`` to bind no-op variants (logs only). Tests use the no-op
    variant by default and inject targeted hooks where needed.
    """
    actual = hooks if hooks is not None else DawHandlerHooks()

    dispatcher.register("daw.transport.play", _make_transport_play_handler(actual))
    dispatcher.register("daw.transport.stop", _make_transport_stop_handler(actual))
    dispatcher.register("daw.transport.record", _make_transport_record_handler(actual))
    dispatcher.register("daw.transport.set_position", _make_transport_set_position_handler(actual))

    dispatcher.register("daw.project.new", _make_project_new_handler(actual))
    dispatcher.register("daw.project.load", _make_project_load_handler(actual))
    dispatcher.register("daw.project.save", _make_project_save_handler(actual))

    dispatcher.register("daw.track.create", _make_track_create_handler(actual))
    dispatcher.register("daw.track.delete", _make_track_delete_handler(actual))
    dispatcher.register("daw.track.set_arm", _make_track_set_arm_handler(actual))

    dispatcher.register("daw.clip.add", _make_clip_add_handler(actual))
    dispatcher.register("daw.clip.remove", _make_clip_remove_handler(actual))
    dispatcher.register("daw.clip.move", _make_clip_move_handler(actual))

    dispatcher.register("daw.automation.set_point", _make_automation_set_point_handler(actual))

    dispatcher.register("daw.plugin.add_to_track", _make_plugin_add_to_track_handler(actual))
    dispatcher.register("daw.plugin.remove_from_track", _make_plugin_remove_from_track_handler(actual))
    dispatcher.register("daw.plugin.set_param", _make_plugin_set_param_handler(actual))
