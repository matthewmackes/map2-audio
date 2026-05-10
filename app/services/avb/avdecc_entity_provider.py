"""
T2499-C Slice 2 — runtime resolver for the AVDECC controller entity.

The AVB route handlers historically reach for `router.avdecc_entity`
via `app.services.avb.avb_router.get_avb_router().avdecc_entity`.
That works when la_avdecc is bound, but it doesn't compose with:

- the wizard simulator path (T2499-C, no hardware)
- per-test injection (we want to drive route handlers off a fixture
  controller without spinning up libpcap-backed la_avdecc)

This module adds a **single optional override** that the route
handlers consult before reaching for the live router. The override is
process-local and is set either by:

1. The startup probe (when `MAP2_AVDECC_SIMULATOR=<bench-name>` is in
   env), or
2. A test fixture calling `set_avdecc_entity_override()`.

Behaviour matrix:

    override set    →ALWAYS use override
    override unset  → fall back to `router.avdecc_entity` (live)

The override is intentionally a single slot, not a stack — wizard
simulation is a process-wide posture, not a per-request decoration.
The live router still owns its lifecycle; nothing in this module
touches the live controller.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Override slot
# ---------------------------------------------------------------------------


_OVERRIDE_LOCK = threading.Lock()
_OVERRIDE_VALUE: Optional[Any] = None
_OVERRIDE_ORIGIN: Optional[str] = None  # "env:<bench>", "test:<reason>", "wizard"


def set_avdecc_entity_override(
    entity: Optional[Any],
    *,
    origin: str,
) -> None:
    """Install (or clear) a process-local AVDECC controller override.

    Pass ``entity=None`` to clear. ``origin`` is a free-form string
    that surfaces in logs / capability responses so an operator can
    see why traffic is on the simulator path.
    """
    global _OVERRIDE_VALUE, _OVERRIDE_ORIGIN
    with _OVERRIDE_LOCK:
        if entity is None:
            if _OVERRIDE_VALUE is not None:
                logger.info(
                    "T2499-C: AVDECC entity override cleared (was origin=%s)",
                    _OVERRIDE_ORIGIN,
                )
            _OVERRIDE_VALUE = None
            _OVERRIDE_ORIGIN = None
            return
        _OVERRIDE_VALUE = entity
        _OVERRIDE_ORIGIN = origin
        logger.info("T2499-C: AVDECC entity override installed (origin=%s)", origin)


def clear_avdecc_entity_override() -> None:
    set_avdecc_entity_override(None, origin="(cleared)")


def get_avdecc_entity_override() -> Optional[Any]:
    """Return the current override (or None)."""
    with _OVERRIDE_LOCK:
        return _OVERRIDE_VALUE


def get_avdecc_entity_override_origin() -> Optional[str]:
    with _OVERRIDE_LOCK:
        return _OVERRIDE_ORIGIN


# ---------------------------------------------------------------------------
# Resolver — the single function route handlers should call
# ---------------------------------------------------------------------------


def resolve_avdecc_entity(
    *,
    live_lookup: Callable[[], Optional[Any]],
) -> Optional[Any]:
    """Return the override if set, otherwise call the live lookup.

    The route handlers inject ``live_lookup`` as a thunk (typically
    ``lambda: get_avb_router().avdecc_entity``) so this module never
    imports the router and the override path stays import-cheap for
    tests that don't need libremidi/la_avdecc.
    """
    override = get_avdecc_entity_override()
    if override is not None:
        return override
    try:
        return live_lookup()
    except Exception:
        logger.exception("resolve_avdecc_entity: live lookup raised")
        return None


# ---------------------------------------------------------------------------
# Startup probe
# ---------------------------------------------------------------------------


_SIMULATOR_ENV_VAR = "MAP2_AVDECC_SIMULATOR"

_BENCH_FACTORIES = {
    "single": "single_entity_bench",
    "small": "small_bench",
    "large": "large_bench",
    "empty": "empty_bench",
    "offline": "offline_bench",
}


def install_simulator_from_env() -> Optional[str]:
    """Read ``MAP2_AVDECC_SIMULATOR`` from env. If set to a known bench
    name, install the corresponding simulator preset as the override
    and return the bench name. Returns ``None`` when the env var is
    absent or unrecognized.

    Recognized bench names: ``single``, ``small``, ``large``, ``empty``,
    ``offline``. Anything else logs a warning and is ignored (live path
    stays in effect).
    """
    raw = os.environ.get(_SIMULATOR_ENV_VAR)
    if not raw:
        return None
    bench = raw.strip().lower()
    factory_name = _BENCH_FACTORIES.get(bench)
    if not factory_name:
        logger.warning(
            "T2499-C: %s=%r unrecognized (expected one of %s); ignoring.",
            _SIMULATOR_ENV_VAR,
            raw,
            sorted(_BENCH_FACTORIES.keys()),
        )
        return None
    # Lazy import — only spin up the simulator module when actually requested.
    from app.services.avb import avdecc_simulator

    factory = getattr(avdecc_simulator, factory_name)
    set_avdecc_entity_override(factory(), origin=f"env:{bench}")
    return bench
