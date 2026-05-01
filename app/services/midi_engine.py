"""
MIDI Engine Service - Full Implementation

Features:
- Real MIDI device discovery via rtmidi
- CC/Note/Pitchbend routing to plugin parameters
- MIDI Learn mode with timeout and auto-mapping
- Persistent mappings stored in database
- CC14 (14-bit CC) support for high-resolution control
- Expression pedal calibration with custom curves
- MIDI clock sync
"""

import logging
import asyncio
import time
from typing import List, Dict, Any, Optional, Callable, Awaitable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timezone

from app.midi.curves import CurveType
# T2482 loop 9 / iter 83: rtmidi import removed; rtmidi_utils
# dispose helper still imported for transitional consumers but
# the file itself no longer needs rtmidi.
# (Iter 87 will drop rtmidi_utils too once the broader removal lands.)

logger = logging.getLogger(__name__)
MIDI_ENGINE_EVENT_QUEUE_MAXSIZE = 1024
MIDI_ENGINE_POLL_FALLBACK_INTERVAL_S = 0.005

try:
    from app.services.midi_hub.hub import MidiHub, get_midi_hub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
except Exception:  # pragma: no cover - optional integration path
    MidiHub = None  # type: ignore[assignment]
    get_midi_hub = None  # type: ignore[assignment]
    MidiMessage = None  # type: ignore[assignment]
    VirtualMidiPort = None  # type: ignore[assignment]

# T2482 loop 9 / iter 83: rtmidi import removed. RTMIDI_AVAILABLE
# kept as a False-only constant so the iter-49/57/58/78 fallback
# branches that referenced it remain syntactically valid (they're
# now unreachable, but a future cleanup can delete the references
# entirely).
RTMIDI_AVAILABLE = False


# T2482-P1.1 Gap D.5 (iter 49) + Gap E phase 8 (iter 58) — controller-host
# routing is now MANDATORY for the rtmidi-direct fallback inside
# _discover_devices(). The MidiHub-based discovery path already inherits
# host routing transparently from midi_hub/ports.py (Gap D.4 / iter 49
# first half + Gap E phase 7 / iter 57), so the env-gate helper from
# iters 49/51 was dropped in iter 58 — host is unconditionally preferred,
# rtmidi remains a lenient-mode fallback until iter 59 strips it.


class MIDIMessageType(Enum):
    """MIDI message types."""
    NOTE_OFF = 0x80
    NOTE_ON = 0x90
    POLYPHONIC_AFTERTOUCH = 0xA0
    CONTROL_CHANGE = 0xB0
    PROGRAM_CHANGE = 0xC0
    CHANNEL_AFTERTOUCH = 0xD0
    PITCH_BEND = 0xE0
    SYSTEM = 0xF0


@dataclass
class MIDIDevice:
    """MIDI device information."""
    index: int
    name: str
    port_type: str  # "input" or "output"
    is_virtual: bool = False
    is_connected: bool = True


@dataclass
class MIDIMapping:
    """MIDI to parameter mapping configuration."""
    id: int
    channel: int  # 1-16, 0 = omni (all channels)
    message_type: str  # "cc", "note", "pitchbend", "aftertouch", "cc14"
    cc_number: int  # For CC messages (0-127), or note number for note messages
    cc_msb: Optional[int] = None  # For CC14: MSB controller number
    target_plugin_uri: str = ""
    target_plugin_position: Optional[int] = None
    target_param_index: int = 0
    target_param_name: str = ""
    min_value: float = 0.0
    max_value: float = 1.0
    curve: CurveType = CurveType.LINEAR
    is_learned: bool = False
    is_enabled: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class MIDILearnSession:
    """Active MIDI learn session state."""
    target_plugin_uri: str
    target_plugin_position: Optional[int]
    target_param_index: int
    target_param_name: str
    started_at: float
    timeout_seconds: float
    callback: Optional[Callable[[int, int, int], Awaitable[None]]] = None


class MIDIEngineService:
    """
    Full MIDI routing and device management.

    Provides real MIDI device discovery, CC routing, learn mode,
    and persistent mapping storage.
    """

    _instance: Optional["MIDIEngineService"] = None

    @classmethod
    def get_instance(cls) -> "MIDIEngineService":
        """Return the orchestrator-owned MIDI engine instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the shared MIDI engine instance for tests."""
        cls._instance = None

    def __init__(self):
        self.input_devices: List[MIDIDevice] = []
        self.output_devices: List[MIDIDevice] = []
        self.mappings: Dict[int, MIDIMapping] = {}  # id -> mapping
        self._mapping_lookup: Dict[Tuple[int, int, int], int] = {}  # (channel, type, number) -> mapping_id
        self._next_mapping_id = 1
        self._running = False
        self._midi_in: Optional[Any] = None
        self._midi_out: Optional[Any] = None
        self._process_task: Optional[asyncio.Task] = None
        self._learn_session: Optional[MIDILearnSession] = None
        self._learn_lock = asyncio.Lock()
        self._parameter_callback: Optional[Callable[..., Awaitable[None]]] = None
        self._cc14_state: Dict[int, int] = {}  # Store MSB values for CC14
        self._message_queue: asyncio.Queue[List[int]] = asyncio.Queue(maxsize=MIDI_ENGINE_EVENT_QUEUE_MAXSIZE)
        self._rtmidi_callback_enabled = False

        # Expression pedal calibration
        self._expression_calibration: Dict[int, Tuple[int, int]] = {}  # cc -> (min_raw, max_raw)
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # MidiHub bridge (hub-first path with direct-rtmidi fallback)
        self._hub: Optional[MidiHub] = None
        self._hub_enabled = False
        self._hub_subscriber_id = f"midi_engine_service:{id(self)}"
        self._hub_input_port_id = "consumer:juce_engine_in"
        self._hub_output_port_id = "consumer:juce_engine_out"

        self._discover_devices()
        self._init_midi_hub_bridge()

    def _init_midi_hub_bridge(self) -> None:
        """Initialize optional MidiHub consumer ports."""
        if get_midi_hub is None or VirtualMidiPort is None:
            return
        try:
            hub = get_midi_hub()
            if hub.resolve_port(self._hub_input_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self._hub_input_port_id,
                        name="JUCE Engine Input",
                        direction="input",
                    ),
                    open_now=False,
                )
            if hub.resolve_port(self._hub_output_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self._hub_output_port_id,
                        name="JUCE Engine Output",
                        direction="output",
                    ),
                    open_now=False,
                )
            self._hub = hub
            self._hub_enabled = True
        except Exception as exc:
            self._hub_enabled = False
            logger.debug("MidiHub bridge unavailable for MIDIEngineService: %s", exc)

    def _on_hub_message(self, message: MidiMessage) -> None:
        """Receive MIDI messages routed to the JUCE-engine consumer port."""
        if not self._running:
            return
        if message.source_port == self._hub_output_port_id:
            return
        destination = message.destination_port
        if destination not in (None, self._hub_input_port_id):
            return
        if not message.data:
            return
        if self._loop is None:
            return
        payload = [int(byte) & 0xFF for byte in message.data]
        try:
            asyncio.run_coroutine_threadsafe(self._handle_midi_message(payload), self._loop)
        except Exception as exc:  # pragma: no cover - thread scheduling path
            logger.debug("Failed scheduling hub MIDI message: %s", exc)

    def _queue_rtmidi_message(self, payload: List[int]) -> None:
        """Push RTMidi callback data into the asyncio consumer queue."""
        if not self._running or not payload:
            return
        if self._message_queue.full():
            try:
                self._message_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            self._message_queue.put_nowait(payload)
        except asyncio.QueueFull:
            logger.debug("Dropping RTMidi callback message because the consumer queue is full")

    def _on_rtmidi_message(self, event: Any, _data: Any = None) -> None:
        """Bridge RTMidi callbacks into the event loop without a spin poll."""
        if not self._running or self._loop is None:
            return
        try:
            message, _delta_time = event
        except Exception:
            return
        payload = [int(byte) & 0xFF for byte in message]
        if not payload:
            return
        try:
            self._loop.call_soon_threadsafe(self._queue_rtmidi_message, payload)
        except RuntimeError:
            logger.debug("Discarding RTMidi callback because the loop is closed")

    def _read_polled_midi_message(self) -> Optional[List[int]]:
        """Fallback path for RTMidi implementations without callback support."""
        if self._midi_in is None:
            return None
        msg = self._midi_in.get_message()
        if not msg:
            return None
        message, _delta_time = msg
        if not message:
            return None
        return [int(byte) & 0xFF for byte in message]

    def _discover_devices(self) -> None:
        """Discover MIDI devices using rtmidi."""
        self.input_devices = []
        self.output_devices = []

        if self._hub_enabled and self._hub is not None:
            try:
                ports = self._hub.list_ports()
                for index, port in enumerate(ports):
                    if port.direction in ("input", "duplex"):
                        self.input_devices.append(
                            MIDIDevice(
                                index=index,
                                name=port.name,
                                port_type="input",
                                is_virtual=(port.kind != "alsa"),
                            )
                        )
                    if port.direction in ("output", "duplex"):
                        self.output_devices.append(
                            MIDIDevice(
                                index=index,
                                name=port.name,
                                port_type="output",
                                is_virtual=(port.kind != "alsa"),
                            )
                        )
                if self.input_devices or self.output_devices:
                    logger.info(
                        "Discovered %s MidiHub inputs, %s outputs",
                        len(self.input_devices),
                        len(self.output_devices),
                    )
                    return
            except Exception as exc:
                logger.debug("MidiHub device discovery failed, falling back to rtmidi: %s", exc)

        # Iter 58 / Gap E phase 8: when the MidiHub path didn't
        # populate devices, prefer controller-host unconditionally.
        # rtmidi falls through only in lenient mode + daemon down.
        from app.services.midi_host_client import (
            MidiHostClient, MidiHostClientError, midi_host_required,
        )
        client = MidiHostClient()
        if client.is_daemon_available():
            _, ports = client.list_ports()
            in_idx = 0
            out_idx = 0
            for p in ports:
                if p.is_input:
                    self.input_devices.append(
                        MIDIDevice(
                            index=in_idx, name=p.name,
                            port_type="input", is_virtual=p.is_virtual,
                        )
                    )
                    in_idx += 1
                else:
                    self.output_devices.append(
                        MIDIDevice(
                            index=out_idx, name=p.name,
                            port_type="output", is_virtual=p.is_virtual,
                        )
                    )
                    out_idx += 1
            if self.input_devices or self.output_devices:
                logger.info(
                    "Discovered %s host inputs, %s outputs via controller-host",
                    len(self.input_devices), len(self.output_devices),
                )
                return
        else:
            # Daemon down. T2482 loop 9 / iter 83 update: in strict
            # mode (MAP2_REQUIRE_MIDI_HOST=1), raise so operators see
            # the failure explicitly. In lenient mode, fall through to
            # the virtual-placeholder path below — the constructor is
            # called from many paths that shouldn't crash on
            # daemon-down (test fixtures, ad-hoc diagnostic shells).
            if midi_host_required():
                raise MidiHostClientError(
                    "MAP2_REQUIRE_MIDI_HOST set but controller-host "
                    "daemon is unreachable; cannot discover MIDI "
                    "devices for midi_engine."
                )
            logger.warning(
                "midi_engine: controller-host daemon unreachable; "
                "MIDI discovery falling to virtual placeholder. Set "
                "MAP2_REQUIRE_MIDI_HOST=1 to make this a hard error."
            )

        # T2482 loop 9 / iter 83: the iter-78-unreachable rtmidi-direct
        # discovery branch + the per-call rtmidi probe were removed.
        # The MidiHub-first tier (above) + the controller-host tier
        # (also above) are the only production discovery paths. When
        # both miss, the engine falls to the virtual placeholder.
        self.input_devices = [
            MIDIDevice(index=0, name="Virtual Input 1", port_type="input", is_virtual=True)
        ]
        self.output_devices = [
            MIDIDevice(index=0, name="Virtual Output 1", port_type="output", is_virtual=True)
        ]
        logger.info(
            "Using virtual MIDI devices (MidiHub + controller-host both "
            "missed; iter-83 removed the rtmidi-direct discovery)."
        )

    async def discover_devices(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get available MIDI devices."""
        self._discover_devices()
        return {
            "inputs": [
                {
                    "index": d.index,
                    "name": d.name,
                    "type": d.port_type,
                    "is_virtual": d.is_virtual,
                    "is_connected": d.is_connected,
                }
                for d in self.input_devices
            ],
            "outputs": [
                {
                    "index": d.index,
                    "name": d.name,
                    "type": d.port_type,
                    "is_virtual": d.is_virtual,
                    "is_connected": d.is_connected,
                }
                for d in self.output_devices
            ],
        }

    async def _dispatch_parameter_callback(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        plugin_position: Optional[int] = None,
        instance_id: Optional[int] = None,
    ) -> None:
        """Call the configured parameter callback with duplicate-safe identity when supported."""
        if not self._parameter_callback:
            return
        try:
            await self._parameter_callback(
                plugin_uri,
                param_index,
                value,
                plugin_position,
                instance_id,
            )
        except TypeError:
            await self._parameter_callback(plugin_uri, param_index, value)

    def set_parameter_callback(self, callback: Callable[..., Awaitable[None]]) -> None:
        """Set callback for parameter changes from MIDI.

        Args:
            callback: Async function(plugin_uri, param_index, value) called on MIDI input
        """
        self._parameter_callback = callback

    async def start(self, input_port: int = 0) -> bool:
        """Start MIDI monitoring on specified input port.

        Args:
            input_port: Index of input port to monitor

        Returns:
            True if started successfully
        """
        if self._running:
            logger.warning("MIDI engine already running")
            return True

        self._loop = asyncio.get_running_loop()
        self._message_queue = asyncio.Queue(maxsize=MIDI_ENGINE_EVENT_QUEUE_MAXSIZE)
        self._rtmidi_callback_enabled = False

        if self._hub_enabled and self._hub is not None:
            try:
                if not self._hub.running:
                    self._hub.start()
                self._hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
                self._running = True
                logger.info("MIDI engine started in MidiHub consumer mode")
                return True
            except Exception as exc:
                logger.warning("Failed to start MIDI engine in MidiHub mode: %s", exc)

        # T2482 loop 9 / iter 83: rtmidi-direct fallback removed.
        # The MidiHub-first path above (host-routed via iter-78 hub
        # discover_alsa_ports) is now the only production path. When
        # the MidiHub isn't enabled (test/simulation mode), the
        # engine starts in simulation mode.
        logger.warning(
            "MIDI engine started in simulation mode (MidiHub unavailable; "
            "iter-83 removed the rtmidi-direct fallback). input_port=%d ignored.",
            input_port,
        )
        self._running = True
        return True

    async def stop(self) -> None:
        """Stop MIDI monitoring."""
        self._running = False

        if self._hub_enabled and self._hub is not None:
            try:
                self._hub.unsubscribe(self._hub_subscriber_id)
            except Exception:
                pass

        if self._process_task:
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass
            self._process_task = None

        # T2482 loop 9 / iter 83: rtmidi cleanup paths removed —
        # _midi_in/_midi_out are never set in the new MidiHub-only
        # start() path. Field assignments are no-ops; keep for any
        # consumer that introspects them.
        self._midi_in = None
        self._midi_out = None
        self._rtmidi_callback_enabled = False

        logger.info("MIDI engine stopped")

    async def _process_loop(self) -> None:
        """Main MIDI processing loop."""
        while self._running:
            try:
                if self._rtmidi_callback_enabled:
                    message = await self._message_queue.get()
                else:
                    message = self._read_polled_midi_message()
                    if message is None:
                        await asyncio.sleep(MIDI_ENGINE_POLL_FALLBACK_INTERVAL_S)
                        continue

                await self._handle_midi_message(message)

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Error in MIDI processing loop: {e}")
                await asyncio.sleep(0.1)

    async def _handle_midi_message(self, message: List[int]) -> None:
        """Handle incoming MIDI message.

        Args:
            message: Raw MIDI message bytes
        """
        if len(message) < 1:
            return

        status = message[0]
        msg_type = status & 0xF0
        channel = (status & 0x0F) + 1  # Convert to 1-16

        # Check if in learn mode first
        if self._learn_session:
            await self._handle_learn_message(message, channel, msg_type)
            return

        # Route based on message type
        if msg_type == MIDIMessageType.CONTROL_CHANGE.value and len(message) >= 3:
            cc_number = message[1]
            cc_value = message[2]
            await self._handle_cc(channel, cc_number, cc_value)

        elif msg_type == MIDIMessageType.NOTE_ON.value and len(message) >= 3:
            note = message[1]
            velocity = message[2]
            await self._handle_note(channel, note, velocity, True)

        elif msg_type == MIDIMessageType.NOTE_OFF.value and len(message) >= 3:
            note = message[1]
            velocity = message[2]
            await self._handle_note(channel, note, velocity, False)

        elif msg_type == MIDIMessageType.PITCH_BEND.value and len(message) >= 3:
            lsb = message[1]
            msb = message[2]
            value = (msb << 7) | lsb  # 14-bit value 0-16383
            await self._handle_pitchbend(channel, value)

        elif msg_type == MIDIMessageType.CHANNEL_AFTERTOUCH.value and len(message) >= 2:
            pressure = message[1]
            await self._handle_aftertouch(channel, pressure)

    async def _handle_cc(self, channel: int, cc_number: int, value: int) -> None:
        """Handle Control Change message."""
        # Check for CC14 (high-resolution) - MSB controllers 0-31
        if cc_number < 32:
            # This is an MSB, store it
            self._cc14_state[cc_number] = value
            # Check if there's a CC14 mapping waiting for this
            key = (channel, "cc14", cc_number)
            if key in self._mapping_lookup:
                mapping_id = self._mapping_lookup[key]
                mapping = self.mappings.get(mapping_id)
                if mapping and mapping.is_enabled:
                    # Wait for LSB
                    return

        elif 32 <= cc_number < 64:
            # This is an LSB for CC14
            msb_cc = cc_number - 32
            if msb_cc in self._cc14_state:
                msb = self._cc14_state[msb_cc]
                value_14bit = (msb << 7) | value  # 0-16383
                # Check for CC14 mapping
                key = (channel, "cc14", msb_cc)
                if key in self._mapping_lookup:
                    await self._apply_mapping(key, value_14bit / 16383.0)
                    return

        # Standard 7-bit CC
        key = (channel, "cc", cc_number)
        if key in self._mapping_lookup:
            await self._apply_mapping(key, value / 127.0)
        else:
            # Try omni channel (0)
            key = (0, "cc", cc_number)
            if key in self._mapping_lookup:
                await self._apply_mapping(key, value / 127.0)

    async def _handle_note(self, channel: int, note: int, velocity: int, is_on: bool) -> None:
        """Handle Note On/Off message for note-to-parameter mapping."""
        if not is_on or velocity == 0:
            return  # Only handle note on with velocity > 0

        key = (channel, "note", note)
        if key in self._mapping_lookup:
            await self._apply_mapping(key, velocity / 127.0)
        else:
            key = (0, "note", note)
            if key in self._mapping_lookup:
                await self._apply_mapping(key, velocity / 127.0)

    async def _handle_pitchbend(self, channel: int, value: int) -> None:
        """Handle Pitch Bend message."""
        key = (channel, "pitchbend", 0)
        if key in self._mapping_lookup:
            # Pitchbend is 14-bit, center at 8192
            normalized = value / 16383.0
            await self._apply_mapping(key, normalized)
        else:
            key = (0, "pitchbend", 0)
            if key in self._mapping_lookup:
                await self._apply_mapping(key, value / 16383.0)

    async def _handle_aftertouch(self, channel: int, pressure: int) -> None:
        """Handle Channel Aftertouch message."""
        key = (channel, "aftertouch", 0)
        if key in self._mapping_lookup:
            await self._apply_mapping(key, pressure / 127.0)
        else:
            key = (0, "aftertouch", 0)
            if key in self._mapping_lookup:
                await self._apply_mapping(key, pressure / 127.0)

    async def _apply_mapping(self, key: Tuple[int, int, int], normalized_value: float) -> None:
        """Apply a mapping to set parameter value.

        Args:
            key: (channel, type, number) lookup key
            normalized_value: Value normalized to 0.0-1.0
        """
        mapping_id = self._mapping_lookup.get(key)
        if not mapping_id:
            return

        mapping = self.mappings.get(mapping_id)
        if not mapping or not mapping.is_enabled:
            return

        # Apply curve
        curved_value = self._apply_curve(normalized_value, mapping.curve)

        # Scale to parameter range
        param_value = mapping.min_value + curved_value * (mapping.max_value - mapping.min_value)

        # Call parameter callback
        if self._parameter_callback:
            try:
                await self._dispatch_parameter_callback(
                    mapping.target_plugin_uri,
                    mapping.target_param_index,
                    param_value,
                    plugin_position=mapping.target_plugin_position,
                )
            except Exception as e:
                logger.error(f"Error applying MIDI mapping: {e}")

    def _apply_curve(self, value: float, curve: CurveType) -> float:
        """Apply response curve to normalized value."""
        import math

        if curve == CurveType.LINEAR:
            return value
        elif curve == CurveType.LOGARITHMIC:
            # Logarithmic curve for audio controls
            if value <= 0:
                return 0.0
            return math.log10(1 + 9 * value) / math.log10(10)
        elif curve == CurveType.EXPONENTIAL:
            return value ** 2
        elif curve == CurveType.S_CURVE:
            # Smooth S-curve using sine
            return (math.sin((value - 0.5) * math.pi) + 1) / 2
        elif curve == CurveType.REVERSE:
            return 1.0 - value
        return value

    async def _handle_learn_message(self, message: List[int], channel: int, msg_type: int) -> None:
        """Handle MIDI message during learn mode."""
        if not self._learn_session:
            return

        async with self._learn_lock:
            session = self._learn_session

            # Check timeout
            if time.time() - session.started_at > session.timeout_seconds:
                logger.info("MIDI learn timed out")
                self._learn_session = None
                return

            # Determine message type and number
            midi_type = None
            number = 0

            if msg_type == MIDIMessageType.CONTROL_CHANGE.value and len(message) >= 3:
                midi_type = "cc"
                number = message[1]
            elif msg_type == MIDIMessageType.NOTE_ON.value and len(message) >= 3:
                if message[2] > 0:  # Only note on with velocity
                    midi_type = "note"
                    number = message[1]
            elif msg_type == MIDIMessageType.PITCH_BEND.value:
                midi_type = "pitchbend"
                number = 0

            if midi_type:
                # Create mapping
                await self.add_mapping(
                    channel=channel,
                    message_type=midi_type,
                    cc_number=number,
                    target_plugin_uri=session.target_plugin_uri,
                    target_plugin_position=session.target_plugin_position,
                    target_param_index=session.target_param_index,
                    target_param_name=session.target_param_name,
                    is_learned=True,
                )

                logger.info(
                    f"MIDI learned: CH{channel} {midi_type.upper()} {number} -> "
                    f"{session.target_param_name}"
                )

                # Call completion callback
                if session.callback:
                    await session.callback(channel, number, msg_type)

                # Persist learn state to database
                await self._persist_learn_completion(channel, number, session)

                # End learn session
                self._learn_session = None

    async def _persist_learn_completion(self, channel: int, cc: int, session: MIDILearnSession) -> None:
        """Persist MIDI learn completion to database."""
        from app.database import get_session, MIDILearnState
        from sqlalchemy import select, delete

        try:
            async with get_session() as db_session:
                # Update existing learn state record
                result = await db_session.execute(
                    select(MIDILearnState).where(
                        MIDILearnState.target_plugin_uri == session.target_plugin_uri,
                        MIDILearnState.target_plugin_position == session.target_plugin_position,
                        MIDILearnState.target_param_index == session.target_param_index,
                        MIDILearnState.completed == False,
                    )
                )
                learn_state = result.scalar_one_or_none()

                if learn_state:
                    learn_state.completed = True
                    learn_state.learned_channel = channel
                    learn_state.learned_cc = cc
                    learn_state.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.error(f"Error persisting MIDI learn state: {e}")

    async def start_learn(
        self,
        target_plugin_uri: str,
        target_param_index: int,
        target_plugin_position: Optional[int] = None,
        target_param_name: str = "",
        timeout: float = 30.0,
        callback: Optional[Callable[[int, int, int], Awaitable[None]]] = None,
    ) -> bool:
        """Start MIDI learn mode for a parameter.

        Args:
            target_plugin_uri: Plugin URI to map to
            target_param_index: Parameter index to map to
            target_param_name: Human-readable parameter name
            timeout: Seconds to wait for MIDI input
            callback: Optional async callback(channel, cc, msg_type) on completion

        Returns:
            True if learn mode started
        """
        async with self._learn_lock:
            if self._learn_session:
                logger.warning("MIDI learn already in progress")
                return False

            self._learn_session = MIDILearnSession(
                target_plugin_uri=target_plugin_uri,
                target_plugin_position=target_plugin_position,
                target_param_index=target_param_index,
                target_param_name=target_param_name or f"Param {target_param_index}",
                started_at=time.time(),
                timeout_seconds=timeout,
                callback=callback,
            )

            # Persist to database for recovery
            await self._persist_learn_start()

            logger.info(
                f"MIDI learn started: {target_param_name} "
                f"(timeout: {timeout}s)"
            )
            return True

    async def _persist_learn_start(self) -> None:
        """Persist MIDI learn start to database for recovery."""
        from app.database import get_session, MIDILearnState

        if not self._learn_session:
            return

        try:
            async with get_session() as db_session:
                learn_state = MIDILearnState(
                    target_plugin_uri=self._learn_session.target_plugin_uri,
                    target_plugin_position=self._learn_session.target_plugin_position,
                    target_param_index=self._learn_session.target_param_index,
                    target_param_name=self._learn_session.target_param_name,
                    timeout_seconds=self._learn_session.timeout_seconds,
                    completed=False,
                )
                db_session.add(learn_state)

        except Exception as e:
            logger.error(f"Error persisting MIDI learn start: {e}")

    async def cancel_learn(self) -> bool:
        """Cancel active MIDI learn session.

        Returns:
            True if session was cancelled
        """
        async with self._learn_lock:
            if self._learn_session:
                logger.info("MIDI learn cancelled")
                self._learn_session = None
                return True
            return False

    def is_learning(self) -> bool:
        """Check if MIDI learn is active."""
        return self._learn_session is not None

    def get_learn_target(self) -> Optional[Dict[str, Any]]:
        """Get current learn target info."""
        if self._learn_session:
            elapsed = time.time() - self._learn_session.started_at
            remaining = max(0, self._learn_session.timeout_seconds - elapsed)
            return {
                "plugin_uri": self._learn_session.target_plugin_uri,
                "plugin_position": self._learn_session.target_plugin_position,
                "param_index": self._learn_session.target_param_index,
                "param_name": self._learn_session.target_param_name,
                "elapsed_seconds": elapsed,
                "remaining_seconds": remaining,
            }
        return None

    async def add_mapping(
        self,
        channel: int,
        message_type: str,
        cc_number: int,
        target_plugin_uri: str,
        target_param_index: int,
        target_plugin_position: Optional[int] = None,
        target_param_name: str = "",
        min_value: float = 0.0,
        max_value: float = 1.0,
        curve: str = "linear",
        is_learned: bool = False,
        cc_msb: Optional[int] = None,
        persist: bool = True,
    ) -> int:
        """Add MIDI to parameter mapping.

        Args:
            channel: MIDI channel 1-16, or 0 for omni
            message_type: "cc", "note", "pitchbend", "aftertouch", "cc14"
            cc_number: CC number (0-127) or note number
            target_plugin_uri: Plugin URI
            target_param_index: Parameter index
            target_param_name: Parameter name for display
            min_value: Minimum parameter value
            max_value: Maximum parameter value
            curve: Response curve type
            is_learned: Whether created via learn mode
            cc_msb: For CC14, the MSB controller number

        Returns:
            Mapping ID
        """
        # Validate
        if channel < 0 or channel > 16:
            raise ValueError(f"Invalid channel {channel}, must be 0-16")
        if cc_number < 0 or cc_number > 127:
            raise ValueError(f"Invalid CC/note number {cc_number}")

        mapping_id = self._next_mapping_id
        self._next_mapping_id += 1

        try:
            curve_type = CurveType(curve)
        except ValueError:
            curve_type = CurveType.LINEAR

        mapping = MIDIMapping(
            id=mapping_id,
            channel=channel,
            message_type=message_type,
            cc_number=cc_number,
            cc_msb=cc_msb,
            target_plugin_uri=target_plugin_uri,
            target_plugin_position=target_plugin_position,
            target_param_index=target_param_index,
            target_param_name=target_param_name,
            min_value=min_value,
            max_value=max_value,
            curve=curve_type,
            is_learned=is_learned,
        )

        self.mappings[mapping_id] = mapping

        # Update lookup table
        key = (channel, message_type, cc_number)
        self._mapping_lookup[key] = mapping_id

        # Persist to database unless we are rehydrating from storage.
        if persist:
            await self._persist_mapping(mapping)

        logger.info(
            f"Added MIDI mapping {mapping_id}: CH{channel} {message_type.upper()} {cc_number} "
            f"-> {target_param_name}"
        )

        return mapping_id

    async def _persist_mapping(self, mapping: MIDIMapping) -> None:
        """Persist mapping to database."""
        from app.database import get_session, MIDIMapping as MIDIMappingModel

        try:
            async with get_session() as session:
                db_mapping = MIDIMappingModel(
                    channel=mapping.channel,
                    cc=mapping.cc_number,
                    target_plugin_uri=mapping.target_plugin_uri,
                    target_plugin_position=mapping.target_plugin_position,
                    target_param_index=mapping.target_param_index,
                    min_val=mapping.min_value,
                    max_val=mapping.max_value,
                    is_learned=mapping.is_learned,
                )
                session.add(db_mapping)

        except Exception as e:
            logger.error(f"Error persisting MIDI mapping: {e}")

    async def remove_mapping(self, mapping_id: int) -> bool:
        """Remove a MIDI mapping by ID.

        Returns:
            True if mapping was removed
        """
        if mapping_id not in self.mappings:
            return False

        mapping = self.mappings[mapping_id]
        key = (mapping.channel, mapping.message_type, mapping.cc_number)

        del self.mappings[mapping_id]
        if key in self._mapping_lookup:
            del self._mapping_lookup[key]

        # Remove from database
        await self._remove_mapping_from_db(mapping)

        logger.info(f"Removed MIDI mapping {mapping_id}")
        return True

    async def _remove_mapping_from_db(self, mapping: MIDIMapping) -> None:
        """Remove mapping from database."""
        from app.database import get_session, MIDIMapping as MIDIMappingModel
        from sqlalchemy import delete

        try:
            async with get_session() as session:
                await session.execute(
                    delete(MIDIMappingModel).where(
                        MIDIMappingModel.channel == mapping.channel,
                        MIDIMappingModel.cc == mapping.cc_number,
                        MIDIMappingModel.target_plugin_uri == mapping.target_plugin_uri,
                        MIDIMappingModel.target_plugin_position == mapping.target_plugin_position,
                        MIDIMappingModel.target_param_index == mapping.target_param_index,
                    )
                )
        except Exception as e:
            logger.error(f"Error removing MIDI mapping from database: {e}")

    async def get_mappings(self) -> List[Dict[str, Any]]:
        """Get all MIDI mappings."""
        return [
            {
                "id": m.id,
                "channel": m.channel,
                "message_type": m.message_type,
                "cc_number": m.cc_number,
                "target_plugin_uri": m.target_plugin_uri,
                "target_plugin_position": m.target_plugin_position,
                "target_param_index": m.target_param_index,
                "target_param_name": m.target_param_name,
                "min_value": m.min_value,
                "max_value": m.max_value,
                "curve": m.curve.value,
                "is_learned": m.is_learned,
                "is_enabled": m.is_enabled,
            }
            for m in self.mappings.values()
        ]

    async def load_mappings_from_db(self) -> int:
        """Load mappings from database.

        Returns:
            Number of mappings loaded
        """
        from app.database import get_session, MIDIMapping as MIDIMappingModel
        from sqlalchemy import select

        try:
            async with get_session() as session:
                result = await session.execute(select(MIDIMappingModel))
                db_mappings = result.scalars().all()

                for db_m in db_mappings:
                    await self.add_mapping(
                        channel=db_m.channel,
                        message_type="cc",  # Default to CC
                        cc_number=db_m.cc,
                        target_plugin_uri=db_m.target_plugin_uri,
                        target_plugin_position=db_m.target_plugin_position,
                        target_param_index=db_m.target_param_index,
                        min_value=db_m.min_val,
                        max_value=db_m.max_val,
                        is_learned=db_m.is_learned,
                        persist=False,
                    )

                logger.info(f"Loaded {len(db_mappings)} MIDI mappings from database")
                return len(db_mappings)

        except Exception as e:
            logger.error(f"Error loading MIDI mappings: {e}")
            return 0

    def calibrate_expression(self, cc_number: int, min_raw: int, max_raw: int) -> None:
        """Calibrate expression pedal range.

        Args:
            cc_number: CC number for expression pedal
            min_raw: Minimum raw value (pedal at heel)
            max_raw: Maximum raw value (pedal at toe)
        """
        self._expression_calibration[cc_number] = (min_raw, max_raw)
        logger.info(f"Calibrated CC{cc_number} expression: {min_raw}-{max_raw}")

    async def get_status(self) -> Dict[str, Any]:
        """Get MIDI engine status."""
        return {
            "running": self._running,
            "rtmidi_available": RTMIDI_AVAILABLE,
            "input_devices": len(self.input_devices),
            "output_devices": len(self.output_devices),
            "mappings_count": len(self.mappings),
            "is_learning": self.is_learning(),
            "learn_target": self.get_learn_target(),
        }
