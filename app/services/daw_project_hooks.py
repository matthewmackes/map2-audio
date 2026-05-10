"""T2503 Set 5 — Project-service hooks for the engine_command dispatcher.

Builds a populated ``DawHandlerHooks`` that routes every project / track /
clip / plugin / automation verb through ``DawProjectService``. The transport
hooks remain unbound (Set 7 wires them to the engine via DawDeviceManager).

Usage from ``app/main.py`` lifespan:

    from app.services.daw_project_hooks import build_project_service_hooks
    from app.services.daw_handlers import register_daw_handlers
    from app.services.daw_dispatch_seam import set_dispatcher
    from app.services.engine_command_dispatcher import EngineCommandDispatcher

    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher, hooks=build_project_service_hooks())
    set_dispatcher(dispatcher)

The "active project" model in this set is intentionally simple: there is one
slot at a time. ``daw.project.new`` and ``daw.project.load`` populate it;
every track/clip/plugin/automation verb mutates that slot. Multi-project
support is deferred per the architecture doc §11.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Optional

from app.services.daw_handlers import DawHandlerHooks
from app.services.daw_project_service import (
    DawProject,
    DawProjectError,
    DawProjectService,
    get_daw_project_service,
)

logger = logging.getLogger(__name__)


class ActiveProjectSlot:
    """Holds the currently-loaded project, threadsafe.

    Mutations from FastAPI + engine_command paths run on different threads
    in production; the slot serializes access. Reads return the current
    DawProject reference (callers must be aware that another thread may
    concurrently mutate the document — for now we trust the dispatcher's
    sequential-message model).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._project: Optional[DawProject] = None

    def get(self) -> Optional[DawProject]:
        with self._lock:
            return self._project

    def set(self, project: Optional[DawProject]) -> None:
        with self._lock:
            self._project = project

    def require(self) -> DawProject:
        proj = self.get()
        if proj is None:
            raise DawProjectError("no active project; call daw.project.new or daw.project.load first")
        return proj


def build_project_service_hooks(
    *,
    service: Optional[DawProjectService] = None,
    active: Optional[ActiveProjectSlot] = None,
    save_after_each_mutation: bool = True,
) -> DawHandlerHooks:
    """Build a hook bundle that routes verbs through the project service.

    By default each mutation triggers a save so a crash mid-session never
    loses state. Set ``save_after_each_mutation=False`` to defer saves to
    the explicit ``daw.project.save`` verb (faster on bulk imports).
    """
    svc = service if service is not None else get_daw_project_service()
    slot = active if active is not None else ActiveProjectSlot()

    def _maybe_save() -> None:
        if save_after_each_mutation:
            project = slot.get()
            if project is not None:
                svc.save_project(project)

    # --- transport hooks left unbound; Set 7 wires them ---

    # --- project hooks ---
    def project_new(name: str) -> None:
        proj = svc.create_project(name)
        slot.set(proj)
        # create_project already saves; nothing more to do.

    def project_load(path_or_name: str) -> None:
        # Caller may pass either a project name or an absolute path.
        # Strip the trailing /project.json or trailing slash for ergonomics.
        candidate = path_or_name
        if candidate.endswith("/project.json"):
            candidate = candidate[: -len("/project.json")]
        candidate = candidate.rstrip("/")
        # If candidate looks like a path, derive the name from the leaf.
        leaf = Path(candidate).name if "/" in candidate else candidate
        proj = svc.load_project(leaf)
        slot.set(proj)

    def project_save() -> None:
        proj = slot.require()
        svc.save_project(proj)

    # --- track hooks ---
    def track_create(track_type: str, *, name: Optional[str] = None) -> int:
        proj = slot.require()
        new_id = svc.add_track(proj, track_type, name=name)
        _maybe_save()
        return new_id

    def track_delete(track_id: int) -> None:
        proj = slot.require()
        svc.remove_track(proj, track_id)
        _maybe_save()

    def track_set_arm(track_id: int, armed: bool) -> None:
        proj = slot.require()
        svc.set_track_arm(proj, track_id, armed)
        _maybe_save()

    # --- clip hooks ---
    def clip_add(track_id: int, start: int, length: int, source: str) -> int:
        proj = slot.require()
        new_id = svc.add_clip(proj, track_id, start, length, source)
        _maybe_save()
        return new_id

    def clip_remove(clip_id: int) -> None:
        proj = slot.require()
        svc.remove_clip(proj, clip_id)
        _maybe_save()

    def clip_move(clip_id: int, new_start: int) -> None:
        proj = slot.require()
        svc.move_clip(proj, clip_id, new_start)
        _maybe_save()

    # --- plugin hooks ---
    def plugin_add_to_track(track_id: int, plugin_uri: str) -> int:
        proj = slot.require()
        slot_index = svc.add_plugin(proj, track_id, plugin_uri)
        _maybe_save()
        return slot_index

    def plugin_remove_from_track(track_id: int, slot_index: int) -> None:
        proj = slot.require()
        svc.remove_plugin(proj, track_id, slot_index)
        _maybe_save()

    def plugin_set_param(track_id: int, slot_index: int, param_id: str, value: float) -> None:
        proj = slot.require()
        svc.set_plugin_param(proj, track_id, slot_index, param_id, value)
        _maybe_save()

    # --- automation hooks ---
    def automation_set_point(lane_id: int, position: float, value: float) -> None:
        proj = slot.require()
        svc.set_automation_point(proj, lane_id, position, value)
        _maybe_save()

    return DawHandlerHooks(
        # transport_* deliberately None — wired in Set 7
        project_new=project_new,
        project_load=project_load,
        project_save=project_save,
        track_create=track_create,
        track_delete=track_delete,
        track_set_arm=track_set_arm,
        clip_add=clip_add,
        clip_remove=clip_remove,
        clip_move=clip_move,
        plugin_add_to_track=plugin_add_to_track,
        plugin_remove_from_track=plugin_remove_from_track,
        plugin_set_param=plugin_set_param,
        automation_set_point=automation_set_point,
    )


# ---- Default-singleton slot for the production wiring ----

_DEFAULT_SLOT: Optional[ActiveProjectSlot] = None


def get_default_active_slot() -> ActiveProjectSlot:
    global _DEFAULT_SLOT
    if _DEFAULT_SLOT is None:
        _DEFAULT_SLOT = ActiveProjectSlot()
    return _DEFAULT_SLOT


def reset_default_active_slot() -> None:
    global _DEFAULT_SLOT
    _DEFAULT_SLOT = None
