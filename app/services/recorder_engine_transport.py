"""T2507-5b — Engine-backed RecorderTransport.

Bridges the Python ``RecorderService`` (cycle 5 of the parent T2504
autonomous Continue run, ``app/services/recorder_service.py``) to
the live JUCE engine's ``RecorderService`` (cycle T2507-5,
``juce-engine/Source/Recorder/RecorderService.{h,cpp}``).

The Python service emits operator-side lifecycle verbs through a
``RecorderTransport`` callable; this module supplies one that, when
called, dispatches into the engine's pybind11 bindings:

    RecorderVerb.ARM     → engine.recorder_arm_session(...)
    RecorderVerb.ROLL    → no-op (v1 folds ARM + ROLL into one
                            engine state — see notes below).
    RecorderVerb.STOP    → engine.recorder_stop_session()
    RecorderVerb.DISARM  → engine.recorder_stop_session() (engine
                            doesn't distinguish; disarm is a stop).
    RecorderVerb.STATUS  → engine.recorder_get_status() (Python
                            service doesn't currently consume the
                            return value but the call confirms
                            engine reachability).

v1 ARM/ROLL folding
-------------------
The Python service's state machine has two states (ARMED, ROLLING)
before STOPPED. The engine's v1 has one (running). When the Python
service emits ROLL after ARM, the engine has already been armed
(audio callback is already pushing into the rings) — so ROLL is a
no-op on the engine side. v2's punch-in (T2511) introduces real
sample-accurate ARM-vs-ROLL distinction.

RT-safety profile
-----------------
All transport methods run on the Python asyncio loop and call into
the engine via pybind11. The engine bindings acquire the C++
RecorderService mutex; they never block the audio thread.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select

from app import database as database_module
from app.paths import Map2Paths
from app.services.recorder_service import (
    RecorderTransport,
    RecorderVerb,
)
from app.services.upload_service import AssetType


logger = logging.getLogger(__name__)


async def _register_recording_asset(
    *,
    file_path: str,
    asset_type: str = AssetType.RECORDING.value,
) -> None:
    """Insert a state_authority_assets row for a produced recording.

    Idempotent: when the same WAV is registered twice (e.g. after a
    backend restart that re-finalises the same session), the SHA-256
    hash collides and we update the existing row in place. Skips
    silently when the file doesn't exist on disk (defensive — the
    engine reports a path even when the writer thread fails to write).
    """
    path = Path(file_path).expanduser()
    if not path.exists() or not path.is_file():
        logger.warning(
            "recorder: registry insert skipped — file missing on disk: %s",
            file_path,
        )
        return

    try:
        with path.open("rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
    except OSError as exc:  # noqa: BLE001
        logger.warning(
            "recorder: registry insert skipped — sha256 read failed for %s: %s",
            file_path, exc,
        )
        return

    # Use the on-disk file size, not the engine's reported
    # bytes_written — the engine counts data bytes only, the WAV
    # header (44 bytes) is invisible to that counter.
    on_disk_size = path.stat().st_size
    asset_hash = f"sha256:{digest}"
    async with database_module.get_session() as session:
        result = await session.execute(
            select(database_module.StateAuthorityAsset).where(
                database_module.StateAuthorityAsset.asset_hash == asset_hash,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(
                database_module.StateAuthorityAsset(
                    asset_hash=asset_hash,
                    source_path=str(path.resolve()),
                    file_name=path.name,
                    size_bytes=on_disk_size,
                    asset_type=asset_type,
                )
            )
        else:
            existing.source_path = str(path.resolve())
            existing.file_name   = path.name
            existing.size_bytes  = on_disk_size
            existing.asset_type  = asset_type


def make_engine_recorder_transport(
    engine: Any,
    *,
    sample_rate: float = 48000.0,
    num_channels: int = 2,
) -> RecorderTransport:
    """Build a RecorderTransport bound to the live engine.

    ``engine`` is a ``map2_audio_engine.AudioEngine`` instance
    (typically the value returned by
    ``get_audio_engine()._engine`` or equivalent — the caller is
    responsible for handing in the actual binding object that
    exposes ``recorder_arm_session``/``recorder_stop_session``/
    ``recorder_get_status``).
    """
    parent_dir = str(Map2Paths.recordings_library_dir())

    # Verify the bindings landed. If the engine SO predates T2507-5b
    # the recorder verbs degrade to clear log lines and stay
    # side-effect-free — matching the Python service's "no-transport
    # silent no-op" pattern (cycle 5).
    has_arm   = hasattr(engine, "recorder_arm_session")
    has_stop  = hasattr(engine, "recorder_stop_session")
    has_status = hasattr(engine, "recorder_get_status")
    if not (has_arm and has_stop and has_status):
        logger.warning(
            "Engine SO is missing recorder bindings (arm=%s stop=%s status=%s) "
            "— recorder verbs will be logged but not executed. Rebuild "
            "juce-engine to pick up T2507-5b.",
            has_arm, has_stop, has_status,
        )

    async def transport(verb: RecorderVerb, session_id: str) -> None:
        if verb is RecorderVerb.ARM:
            if not has_arm:
                logger.info("recorder.arm (no engine binding): session=%s", session_id)
                return
            ok = engine.recorder_arm_session(
                session_id, parent_dir, sample_rate, num_channels
            )
            if ok:
                logger.info(
                    "recorder.arm: engine armed session %s under %s",
                    session_id, parent_dir,
                )
            else:
                logger.warning(
                    "recorder.arm: engine.recorder_arm_session(%s) returned False",
                    session_id,
                )
            return

        if verb is RecorderVerb.ROLL:
            # v1 folds ARM + ROLL on the engine side.
            logger.debug(
                "recorder.roll: v1 no-op on engine (audio path armed at "
                "arm_session time). session=%s", session_id,
            )
            return

        if verb is RecorderVerb.STOP or verb is RecorderVerb.DISARM:
            if not has_stop:
                logger.info("recorder.%s (no engine binding): session=%s",
                            verb.value, session_id)
                return
            stop_status = engine.recorder_stop_session()
            logger.info(
                "recorder.%s: engine stopped session %s; "
                "pre_frames=%s post_frames=%s total_samples=%s",
                verb.value, session_id,
                stop_status.get("pre", {}).get("frames_written"),
                stop_status.get("post", {}).get("frames_written"),
                stop_status.get("total_samples"),
            )
            # Register both WAV files in state_authority_assets so
            # they appear in `/api/recordings` and the
            # AudioArtifactsPage recordings tab. Idempotent + hash-
            # addressed; identical files (same SHA-256) collapse to
            # one registry row.
            for tap_key in ("pre", "post"):
                tap = stop_status.get(tap_key, {}) or {}
                path = tap.get("path")
                if path:
                    try:
                        await _register_recording_asset(file_path=path)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception(
                            "recorder: registry insert failed for %s: %s",
                            path, exc,
                        )
            return

        if verb is RecorderVerb.STATUS:
            if not has_status:
                logger.info("recorder.status (no engine binding): session=%s",
                            session_id)
                return
            status = engine.recorder_get_status()
            logger.debug(
                "recorder.status: engine session=%s active=%s",
                status.get("session_id"), status.get("active"),
            )
            return

        logger.warning("recorder transport: unknown verb %r", verb)

    return transport


def install_recorder_engine_transport(engine: Any) -> Optional[RecorderTransport]:
    """Install the engine-backed transport on the singleton
    ``RecorderService`` (cycle 5). Returns the transport for
    inspection / tests. Idempotent: replacing the transport on the
    service is safe at any time.
    """
    from app.services.recorder_service import get_recorder_service

    if engine is None:
        logger.warning(
            "install_recorder_engine_transport: engine is None; transport "
            "not installed (Python service will continue to log verbs).",
        )
        return None

    transport = make_engine_recorder_transport(engine)
    svc = get_recorder_service()
    svc.replace_transport(transport)
    logger.info(
        "Recorder engine transport installed (RecorderService → live engine).",
    )
    return transport
