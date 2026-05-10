"""MIDI Connections Visualization — producer wiring.

T2500-MV-B2 + T2500-MV-B-RAW-TAP.

Owns the two producer subscriptions that feed the visualization
:class:`MidiTrafficBuffer`:

  - **Dispatched layer** — observer on
    :class:`EngineCommandDispatcher`. Fires on every dispatch (success
    or error) and writes a ``kind="dispatched"`` event keyed on
    ``(mapping:<controller_key>, target:<target>)`` so the canvas can
    animate the mapping → target leg of the graph.

  - **Raw layer** — subscriber on :class:`MidiHub`. Mirrors the
    pattern already used by ``inbound_traffic_bridge`` (which feeds the
    ``midi:traffic`` WS topic) but writes into the visualization buffer
    keyed on ``(device:<port_id>, mapping:<controller_key>)`` so the
    canvas can animate the device → mapping leg.

Why a separate bridge module
============================

We could have wired the dispatcher observer inside
:mod:`engine_command_bridge` and the MidiHub subscription inside
:mod:`midi_hub.inbound_traffic_bridge` — but those modules already own
distinct production responsibilities (lifecycle of the
``engine_command`` IPC subscription; the ``midi:traffic`` WS topic).
The visualization buffer is observability-only and should not be a
load-bearing dependency of either. Keeping the wiring in its own
module means a regression here (e.g. a buggy buffer observer) cannot
break the dispatcher path.

Lifecycle: ``install()`` is idempotent and called from
``app/main.py`` lifespan startup. ``uninstall()`` clears subscriptions
on shutdown. Both are safe to call without the buffer ever being
populated (no subscribers → buffer just keeps appending in-process and
the WS endpoint replays whatever is there on first connect).
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from app.services.midi_visualization_buffer import (
    MidiTrafficBuffer,
    get_midi_visualization_buffer,
)


logger = logging.getLogger(__name__)


VISUALIZATION_HUB_SUBSCRIBER_ID = "midi_visualization_bridge.raw"


class MidiVisualizationProducerBridge:
    """Owns the dispatched + raw producer subscriptions for the
    visualization buffer.

    Lifecycle is independent of the engine-command bridge and the
    inbound traffic bridge — both can run with or without us.
    """

    def __init__(self, buffer: Optional[MidiTrafficBuffer] = None) -> None:
        self._buffer = buffer or get_midi_visualization_buffer()
        self._lock = threading.Lock()
        self._installed = False
        self._dispatcher_unsubscribe: Optional[Any] = None
        self._hub_unsubscribed = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def install(self) -> None:
        with self._lock:
            if self._installed:
                return
            self._install_dispatcher_observer()
            self._install_hub_subscription()
            self._installed = True
        logger.info("MidiVisualizationProducerBridge installed")

    def uninstall(self) -> None:
        with self._lock:
            if not self._installed:
                return
            self._uninstall_dispatcher_observer()
            self._uninstall_hub_subscription()
            self._installed = False
        logger.info("MidiVisualizationProducerBridge uninstalled")

    # ------------------------------------------------------------------
    # Dispatched layer — engine_command_dispatcher observer
    # ------------------------------------------------------------------

    def _install_dispatcher_observer(self) -> None:
        try:
            from app.services.engine_command_bridge import get_engine_command_bridge

            bridge = get_engine_command_bridge()
            if bridge is None:
                # Engine-command bridge not initialized yet — skip;
                # caller can re-install() once the bridge is up.
                return
            self._dispatcher_unsubscribe = bridge.dispatcher.subscribe(
                self._on_dispatched
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "MidiVisualizationProducerBridge: dispatcher observer install failed: %s",
                exc,
            )

    def _uninstall_dispatcher_observer(self) -> None:
        if self._dispatcher_unsubscribe is None:
            return
        try:
            self._dispatcher_unsubscribe()
        except Exception:  # noqa: BLE001
            pass
        self._dispatcher_unsubscribe = None

    def _on_dispatched(self, ctx: Any, target: str) -> None:
        """Observer callback: convert dispatch ctx → buffer event.

        ``target`` may be the resolved exact key OR the original frame
        target for pattern-routed/unmatched cases. We use the
        registered topology key (the dispatcher pattern, e.g.
        ``audio.chain.*.bypass``) where possible so the edge resolves
        to the operator-visible target node.
        """
        controller_key = getattr(ctx, "controller_key", "") or "unknown"
        # Match the topology assembler's mapping → target edge logic:
        # the visualization graph's target node id is the registered
        # pattern OR the exact key. The dispatcher's _invoke() passes
        # ``target`` = the resolved key for pattern matches too (so
        # this is already correct).
        self._buffer.append(
            {
                "kind": "dispatched",
                "source_node_id": f"mapping:{controller_key}",
                "target_node_id": f"target:{target}",
                "controller_key": controller_key,
                "target": target,
                "action": getattr(ctx, "action", ""),
                "value": getattr(ctx, "value", None),
            }
        )

    # ------------------------------------------------------------------
    # Raw layer — MidiHub subscriber
    # ------------------------------------------------------------------

    def _install_hub_subscription(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            hub = get_midi_hub()
            hub.subscribe(VISUALIZATION_HUB_SUBSCRIBER_ID, self._on_raw_message)
            self._hub_unsubscribed = False
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "MidiVisualizationProducerBridge: hub subscribe failed: %s", exc
            )

    def _uninstall_hub_subscription(self) -> None:
        if self._hub_unsubscribed:
            return
        try:
            from app.services.midi_hub.hub import get_midi_hub

            hub = get_midi_hub()
            hub.unsubscribe(VISUALIZATION_HUB_SUBSCRIBER_ID)
        except Exception:  # noqa: BLE001
            pass
        self._hub_unsubscribed = True

    def _on_raw_message(self, message: Any) -> None:
        """Subscriber callback for raw inbound MIDI.

        Skips router-originated round-trip noise (matches
        ``inbound_traffic_bridge`` semantics). Resolves the destination
        by checking the active mapping registry — without a controller
        key match, we drop the event because no edge exists in the
        topology to animate.
        """
        try:
            metadata = getattr(message, "metadata", None) or {}
            if bool(metadata.get("router_dispatch")):
                return
            source_port = str(getattr(message, "source_port", "") or "")
            if not source_port:
                return
            data: bytes = bytes(getattr(message, "data", b"") or b"")

            # Resolve the destination mapping. The visualization edge
            # exists only when there's an active mapping for this port;
            # otherwise the event has nowhere to flow on the canvas.
            mapping_controller_key = self._resolve_mapping_for_port(source_port)
            if mapping_controller_key is None:
                return

            event: dict[str, Any] = {
                "kind": "raw",
                "source_node_id": f"device:{source_port}",
                "target_node_id": f"mapping:{mapping_controller_key}",
                "raw_hex": data.hex(),
            }
            if data:
                event["status_byte"] = data[0]
            self._buffer.append(event)
        except Exception:  # noqa: BLE001 - never propagate into MidiHub
            logger.exception(
                "MidiVisualizationProducerBridge._on_raw_message failed"
            )

    @staticmethod
    def _resolve_mapping_for_port(source_port: str) -> Optional[str]:
        """Return the controller_key of the active mapping bound to
        ``source_port``, or ``None`` if no mapping is active for it.
        """
        try:
            from app.services.controllers import get_controller_service

            svc = get_controller_service()
            for active in svc._mappings.all():  # type: ignore[attr-defined]
                if active.controller_key == source_port:
                    return active.controller_key
        except Exception:
            return None
        return None


# ----------------------------------------------------------------------
# Process-wide singleton accessor
# ----------------------------------------------------------------------

_bridge: Optional[MidiVisualizationProducerBridge] = None
_bridge_lock = threading.Lock()


def get_midi_visualization_bridge() -> MidiVisualizationProducerBridge:
    global _bridge
    if _bridge is None:
        with _bridge_lock:
            if _bridge is None:
                _bridge = MidiVisualizationProducerBridge()
    return _bridge


def install_midi_visualization_bridge() -> MidiVisualizationProducerBridge:
    """Install the producer bridge. Idempotent — safe to call from lifespan startup."""
    bridge = get_midi_visualization_bridge()
    bridge.install()
    return bridge


def reset_midi_visualization_bridge_for_tests() -> None:
    global _bridge
    with _bridge_lock:
        if _bridge is not None:
            try:
                _bridge.uninstall()
            except Exception:
                pass
        _bridge = None
