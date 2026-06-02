"""T2510-2 — Recorder arm/disarm propagation across the Raft cluster.

Mirrors :mod:`app.services.special_settings_raft`: a state-machine apply
hook (NOT a PlatformEventBus subscription) consumes Raft-replicated
``recording.armed`` mutations and arms/disarms each node's local
``RecorderService`` for *only the chains that node owns*.

Ownership
---------
A chain is owned by this node when its resolved
``cluster_owner_node_id`` equals this node's id. The compiler
(:mod:`app.services.audio_state_snapshot_compiler`) already resolves a
null/omitted ``channel.cluster_owner_node_id`` to
``deployment.primary_node_id`` and surfaces it on each compiled path as
``paths[].cluster_owner_node_id`` (keyed by the channel/path id, with
``snapshot_chain_id`` linking back to the snapshot chain that the
``tap_matrix`` is keyed on).

Because a follower's *local* snapshot copy can lag the leader's, we do
NOT re-resolve ownership on the follower from a possibly-stale snapshot.
Instead the **leader computes the resolved per-chain owner map and
carries it inside the Raft entry** (``owner_map``: ``chain_id -> resolved
owner node id``). Followers consume that map verbatim — no DB fetch, no
re-resolution, no follower-stale-snapshot race.

session_id
----------
Followers REUSE the leader's ``session_id`` carried in the entry. They
never allocate a local id — :meth:`RecorderService.arm_session` accepts an
explicit ``session_id=`` for exactly this path.

Idempotency
-----------
The apply hook tracks the last-seen ``armed`` flag per ``snapshot_id`` and
acts only on a *flip* (False→True arms, True→False disarms). Re-applying
the same committed state is a no-op. ``arm_session`` is itself idempotent
on a known session id, giving a second layer of protection.

The hook never raises into the Raft apply loop — it mirrors
``RaftConsensus._apply_special_settings_to_db``'s try/except-log shape.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _coerce_owner_map(raw: Any) -> dict[str, str]:
    """Normalize the entry-carried ``owner_map`` (chain_id -> owner id).

    Drops blank chain keys and blank/non-string owners; an owner that
    resolves to a falsy value simply leaves that chain unowned by every
    node (it inherits no deployment primary), which is the safe default.
    """
    if not isinstance(raw, dict):
        return {}
    normalized: dict[str, str] = {}
    for chain_id, owner in raw.items():
        chain_key = str(chain_id or "").strip()
        owner_id = str(owner or "").strip()
        if not chain_key or not owner_id:
            continue
        normalized[chain_key] = owner_id
    return normalized


def _filter_owned_tap_matrix(
    tap_matrix: Any,
    owner_map: dict[str, str],
    local_node_id: str,
) -> dict[str, dict[str, bool]]:
    """Return only the tap_matrix chains this node owns.

    A chain is owned when ``owner_map[chain_id] == local_node_id``. Chains
    with no resolved owner (absent from ``owner_map``) are never owned by
    anyone, so they are excluded everywhere.
    """
    if not isinstance(tap_matrix, dict):
        return {}
    owned: dict[str, dict[str, bool]] = {}
    for chain_id, taps in tap_matrix.items():
        chain_key = str(chain_id or "").strip()
        if not chain_key or not isinstance(taps, dict):
            continue
        if owner_map.get(chain_key) != local_node_id:
            continue
        owned[chain_key] = {
            "pre_fx": bool(taps.get("pre_fx", False)),
            "post_fx": bool(taps.get("post_fx", False)),
        }
    return owned


class RecordingStateManager:
    """State-machine apply hook for replicated recording mutations.

    Mirrors :class:`SpecialSettingsStateManager`: one instance per
    backend process (see :func:`get_recording_state_manager`). Holds the
    per-snapshot last-seen armed flag + the locally-armed session id so it
    only acts on a flip and can disarm the right session later.
    """

    def __init__(self) -> None:
        self.logger = logging.getLogger("RecordingStateManager")
        # snapshot_id -> last-seen armed flag (only act on a flip)
        self._last_armed: dict[int, bool] = {}
        # snapshot_id -> session_id we armed locally (so we can disarm it)
        self._armed_local_sessions: dict[int, str] = {}

    async def apply_entry(self, data: dict, local_node_id: str) -> bool:
        """Apply one replicated recording mutation.

        ``data`` shape::

            {
                "snapshot_id": int,
                "recording": {
                    "session_id": str | None,
                    "armed": bool,
                    "rolling": bool,
                    "started_at": str | None,
                    "participating_nodes": [str, ...],
                    "tap_matrix": {chain_id: {"pre_fx": bool, "post_fx": bool}},
                },
                "owner_map": {chain_id: resolved_owner_node_id},
            }

        Returns ``True`` on success (including intentional no-ops). Never
        raises into the Raft apply loop — catches and logs instead, then
        returns ``False`` so the caller knows the side effect failed.
        """
        try:
            if not isinstance(data, dict):
                self.logger.warning("recording entry data is not a dict: %r", type(data))
                return False

            snapshot_id = data.get("snapshot_id")
            if not isinstance(snapshot_id, int):
                self.logger.warning(
                    "recording entry missing/invalid snapshot_id: %r", snapshot_id
                )
                return False

            recording = data.get("recording")
            if not isinstance(recording, dict):
                self.logger.warning(
                    "recording entry for snapshot %s missing recording block", snapshot_id
                )
                return False

            armed = bool(recording.get("armed", False))
            session_id = recording.get("session_id")
            owner_map = _coerce_owner_map(data.get("owner_map"))

            prev_armed = self._last_armed.get(snapshot_id, False)
            # Record the new observed state up front so a re-apply of the
            # same committed state is a true no-op.
            self._last_armed[snapshot_id] = armed

            if armed == prev_armed:
                # No flip — nothing to do. (Covers the idempotent re-apply
                # of an already-armed or already-disarmed snapshot.)
                return True

            if armed:
                await self._on_arm_flip(
                    snapshot_id=snapshot_id,
                    session_id=session_id,
                    recording=recording,
                    owner_map=owner_map,
                    local_node_id=local_node_id,
                )
            else:
                await self._on_disarm_flip(snapshot_id=snapshot_id)

            return True

        except Exception as exc:  # noqa: BLE001 — never raise into the apply loop
            self.logger.error(
                "Failed to apply recording entry for snapshot %r: %s",
                data.get("snapshot_id") if isinstance(data, dict) else data,
                exc,
            )
            return False

    async def _on_arm_flip(
        self,
        *,
        snapshot_id: int,
        session_id: Any,
        recording: dict,
        owner_map: dict[str, str],
        local_node_id: str,
    ) -> None:
        """Arm the local writer for the chains THIS node owns."""
        if not isinstance(session_id, str) or not session_id.strip():
            self.logger.warning(
                "recording arm flip for snapshot %s has no session_id; skipping",
                snapshot_id,
            )
            return
        session_id = session_id.strip()

        owned_matrix = _filter_owned_tap_matrix(
            recording.get("tap_matrix"), owner_map, local_node_id
        )
        if not owned_matrix:
            self.logger.info(
                "Recording armed for snapshot %s but node %s owns 0 chains; no-op",
                snapshot_id,
                local_node_id,
            )
            return

        from app.services.recorder_service import get_recorder_service

        # Reuse the LEADER's session_id (do not allocate a local one).
        await get_recorder_service().arm_session(
            snapshot_id=snapshot_id,
            tap_matrix=owned_matrix,
            session_id=session_id,
        )
        self._armed_local_sessions[snapshot_id] = session_id
        self.logger.info(
            "Armed local writer for snapshot %s session %s (%d owned chain taps)",
            snapshot_id,
            session_id,
            len(owned_matrix),
        )

    async def _on_disarm_flip(self, *, snapshot_id: int) -> None:
        """Disarm the local writer if we previously armed one."""
        session_id = self._armed_local_sessions.pop(snapshot_id, None)
        if not session_id:
            # We never armed locally for this snapshot — nothing to tear down.
            self.logger.info(
                "Recording disarmed for snapshot %s but node never armed locally; no-op",
                snapshot_id,
            )
            return

        from app.services.recorder_service import get_recorder_service

        await get_recorder_service().disarm_session(session_id=session_id)
        self.logger.info(
            "Disarmed local writer for snapshot %s session %s",
            snapshot_id,
            session_id,
        )


async def replicate_recording_to_raft(
    raft_consensus,
    snapshot_id: int,
    recording_block: dict,
    owner_map: dict,
) -> bool:
    """Replicate a recording mutation across the cluster (leader only).

    Mirrors the ``replicate_command('update_special_settings', ...)`` call
    site. The leader computes the resolved per-chain ``owner_map``
    (chain_id -> owner node id) *before* calling this — see the module
    docstring on why ownership is carried in the entry rather than
    re-resolved on followers.

    Returns the result of ``raft_consensus.replicate_command`` (``True``
    when the command committed). Only the leader can replicate; a
    follower call returns ``False`` from ``replicate_command``.
    """
    entry_data = {
        "snapshot_id": int(snapshot_id),
        "recording": recording_block,
        "owner_map": _coerce_owner_map(owner_map),
    }
    return await raft_consensus.replicate_command(
        command="update_snapshot_recording",
        data=entry_data,
    )


# ---------------------------------------------------------------------------
# Singleton accessor (mirrors the special_settings / recorder pattern)
# ---------------------------------------------------------------------------


_state_manager: Optional[RecordingStateManager] = None


def get_recording_state_manager() -> RecordingStateManager:
    """Return the process-wide RecordingStateManager.

    The Raft apply loop calls this so the per-snapshot last-armed flag +
    locally-armed session map survive across committed entries within a
    process. Tests can override the singleton via
    :func:`set_recording_state_manager`.
    """
    global _state_manager
    if _state_manager is None:
        _state_manager = RecordingStateManager()
    return _state_manager


def set_recording_state_manager(manager: Optional[RecordingStateManager]) -> None:
    """Test seam — override (or clear with ``None``) the singleton."""
    global _state_manager
    _state_manager = manager
