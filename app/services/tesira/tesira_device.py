"""
TesiraDevice — typed wrapper around TTPClient for one Biamp Tesira Forte AVB unit.

Provides high-level accessors for:
  - Device identity (hostname, serial, version, faultList)
  - Channel gain / mute (LevelControl DSP blocks)
  - Matrix crosspoint routing (Mixer / Router blocks)
  - Parametric EQ
  - Preset recall
  - AVB stream enumeration
  - PTP clock status
  - Metering subscriptions
  - Fault list
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from app.services.tesira.ttp_client import TTPClient, TTPResponse

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Data classes
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class TesiraStreamInfo:
    """One AVB send or receive stream on a Tesira unit."""
    stream_index: int
    direction: str          # 'talker' | 'listener'
    name: str
    channels: int
    entity_id: str          # Derived from MAC + stream_index for AvbRouter registration


@dataclass
class TesiraPresetInfo:
    """A stored preset slot on a Tesira unit."""
    index: int
    name: str


@dataclass
class TesiraDeviceInfo:
    """Identity information returned from 'device get *' queries."""
    hostname: str
    serial_number: str
    firmware_version: str
    mac_address: str
    model: str
    ip_address: str


@dataclass
class TesiraMeterValue:
    """A single metered level reading."""
    instance_tag: str
    channel_index: int
    level_dbu: float
    timestamp: str          # ISO-8601


# ──────────────────────────────────────────────────────────────────────────────
# TesiraDevice
# ──────────────────────────────────────────────────────────────────────────────

class TesiraDevice:
    """
    Represents one physical Biamp Tesira Forte AVB unit.

    device_id is constructed as 'tesira_<serial_number>' after connection.
    Before connection it uses the host string as a provisional ID.
    """

    def __init__(
        self,
        host: str,
        port: int = 23,
        name: str = '',
        connect_timeout: float = 5.0,
        read_timeout: float = 2.0,
    ) -> None:
        self.host = host
        self.port = port
        self.name = name or host
        self._client = TTPClient(
            host=host,
            port=port,
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
        )
        # Populated after successful connect + identity fetch
        self.device_id: str = f"tesira_{host.replace('.', '_')}"
        self.info: Optional[TesiraDeviceInfo] = None
        self._connected = False

        # Push-notification callbacks registered by TesiraFleet
        self._push_callbacks: list[Callable[[str, str, str, Any], None]] = []

        # Wire the TTPClient push dispatcher to include device_id
        self._client.on_push(self._on_client_push)

    # ──────────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────────────────

    @property
    def connected(self) -> bool:
        return self._client.connected

    async def connect(self) -> None:
        """Open TCP connection and fetch device identity."""
        await self._client.connect()
        try:
            self.info = await self._fetch_identity()
            if self.info.serial_number:
                self.device_id = f"tesira_{self.info.serial_number}"
            if not self.name or self.name == self.host:
                self.name = self.info.hostname or self.host
            logger.info(
                "TesiraDevice[%s] connected: %s SN=%s FW=%s",
                self.host, self.info.hostname, self.info.serial_number, self.info.firmware_version,
            )
        except Exception as exc:
            logger.warning("TesiraDevice[%s] identity fetch failed: %s", self.host, exc)

    async def disconnect(self) -> None:
        """Close the TCP connection."""
        await self._client.disconnect()
        logger.info("TesiraDevice[%s] disconnected", self.host)

    # ──────────────────────────────────────────────────────────────────────────
    # Identity
    # ──────────────────────────────────────────────────────────────────────────

    async def _fetch_identity(self) -> TesiraDeviceInfo:
        """Query key device attributes and return a TesiraDeviceInfo."""
        async def _get(attribute: str) -> str:
            resp = await self._client.send('device', 'get', attribute)
            return str(resp.value) if resp.ok and resp.value is not None else ''

        hostname = await _get('hostname')
        serial   = await _get('serialNumber')
        firmware = await _get('version')
        mac      = await _get('macAddress')
        model    = await _get('model')

        return TesiraDeviceInfo(
            hostname=hostname,
            serial_number=serial,
            firmware_version=firmware,
            mac_address=mac,
            model=model,
            ip_address=self.host,
        )

    async def get_info(self) -> Dict[str, Any]:
        """Return device identity as a plain dict (for API serialisation)."""
        if self.info is None:
            try:
                self.info = await self._fetch_identity()
            except Exception as exc:
                logger.warning("get_info failed: %s", exc)
                return {'device_id': self.device_id, 'host': self.host, 'error': str(exc)}
        return {
            'device_id': self.device_id,
            'host': self.host,
            'port': self.port,
            'name': self.name,
            'hostname': self.info.hostname,
            'serial_number': self.info.serial_number,
            'firmware_version': self.info.firmware_version,
            'mac_address': self.info.mac_address,
            'model': self.info.model,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Gain / Mute
    # ──────────────────────────────────────────────────────────────────────────

    async def set_level(self, instance_tag: str, channel: int, level_db: float) -> None:
        """Set channel gain on a LevelControl DSP block (dB)."""
        resp = await self._client.send(instance_tag, 'set', 'level', channel, f"{level_db:.2f}")
        if not resp.ok:
            raise RuntimeError(
                f"set_level {instance_tag}[{channel}]={level_db:.2f} failed: "
                f"{resp.error_code} {resp.error_detail}"
            )

    async def get_level(self, instance_tag: str, channel: int) -> float:
        """Read channel gain from a LevelControl DSP block (dB)."""
        resp = await self._client.send(instance_tag, 'get', 'level', channel)
        if not resp.ok:
            raise RuntimeError(f"get_level {instance_tag}[{channel}] failed: {resp.error_code}")
        return float(resp.value)

    async def set_mute(self, instance_tag: str, channel: int, muted: bool) -> None:
        """Set mute state on a LevelControl DSP block."""
        value = 'true' if muted else 'false'
        resp = await self._client.send(instance_tag, 'set', 'mute', channel, value)
        if not resp.ok:
            raise RuntimeError(
                f"set_mute {instance_tag}[{channel}]={muted} failed: {resp.error_code}"
            )

    async def get_mute(self, instance_tag: str, channel: int) -> bool:
        """Read mute state from a LevelControl DSP block."""
        resp = await self._client.send(instance_tag, 'get', 'mute', channel)
        if not resp.ok:
            raise RuntimeError(f"get_mute {instance_tag}[{channel}] failed: {resp.error_code}")
        return bool(resp.value)

    # ──────────────────────────────────────────────────────────────────────────
    # Crosspoint matrix
    # ──────────────────────────────────────────────────────────────────────────

    async def set_crosspoint(
        self, instance_tag: str, row: int, col: int, gain_db: float
    ) -> None:
        """Set a crosspoint gain on a Mixer or Router DSP block."""
        resp = await self._client.send(
            instance_tag, 'set', 'crosspointLevelOut', row, col, f"{gain_db:.2f}"
        )
        if not resp.ok:
            raise RuntimeError(
                f"set_crosspoint {instance_tag}[{row},{col}]={gain_db:.2f} failed: {resp.error_code}"
            )

    async def get_crosspoint(self, instance_tag: str, row: int, col: int) -> float:
        """Read crosspoint gain from a Mixer or Router DSP block."""
        resp = await self._client.send(instance_tag, 'get', 'crosspointLevelOut', row, col)
        if not resp.ok:
            raise RuntimeError(
                f"get_crosspoint {instance_tag}[{row},{col}] failed: {resp.error_code}"
            )
        return float(resp.value)

    async def set_crosspoint_mute(
        self, instance_tag: str, row: int, col: int, muted: bool
    ) -> None:
        """Set crosspoint mute state on a Mixer DSP block."""
        value = 'true' if muted else 'false'
        resp = await self._client.send(instance_tag, 'set', 'crosspointMute', row, col, value)
        if not resp.ok:
            raise RuntimeError(
                f"set_crosspoint_mute {instance_tag}[{row},{col}]={muted} failed: {resp.error_code}"
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Parametric EQ
    # ──────────────────────────────────────────────────────────────────────────

    async def set_eq_band_freq(
        self, instance_tag: str, band: int, freq_hz: float
    ) -> None:
        """Set a parametric EQ band centre frequency."""
        resp = await self._client.send(
            instance_tag, 'set', 'eqBandFrequency', band, f"{freq_hz:.1f}"
        )
        if not resp.ok:
            raise RuntimeError(
                f"set_eq_band_freq {instance_tag}[{band}]={freq_hz:.1f}Hz failed: {resp.error_code}"
            )

    async def set_eq_band_gain(
        self, instance_tag: str, band: int, gain_db: float
    ) -> None:
        """Set a parametric EQ band gain."""
        resp = await self._client.send(
            instance_tag, 'set', 'eqBandGain', band, f"{gain_db:.2f}"
        )
        if not resp.ok:
            raise RuntimeError(
                f"set_eq_band_gain {instance_tag}[{band}]={gain_db:.2f}dB failed: {resp.error_code}"
            )

    async def set_eq_band_q(
        self, instance_tag: str, band: int, q: float
    ) -> None:
        """Set a parametric EQ band Q factor."""
        resp = await self._client.send(
            instance_tag, 'set', 'eqBandQ', band, f"{q:.3f}"
        )
        if not resp.ok:
            raise RuntimeError(
                f"set_eq_band_q {instance_tag}[{band}]={q:.3f} failed: {resp.error_code}"
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Presets
    # ──────────────────────────────────────────────────────────────────────────

    async def list_presets(self) -> List[TesiraPresetInfo]:
        """
        Return available presets.

        TTP: 'device get presetList'
        Response value is a list of quoted preset names.
        Index corresponds to position in the list (1-based on device).
        """
        resp = await self._client.send('device', 'get', 'presetList')
        if not resp.ok:
            logger.warning("list_presets failed: %s", resp.error_code)
            return []
        names = resp.value if isinstance(resp.value, list) else [resp.value]
        return [
            TesiraPresetInfo(index=i + 1, name=str(n))
            for i, n in enumerate(names)
        ]

    async def recall_preset(self, preset_index: int) -> None:
        """
        Recall a preset by index (1-based as displayed on device).

        TTP: 'device recallPreset <index>'
        """
        resp = await self._client.send('device', 'recallPreset', '', preset_index)
        if not resp.ok:
            raise RuntimeError(
                f"recall_preset {preset_index} failed: {resp.error_code} {resp.error_detail}"
            )
        logger.info("TesiraDevice[%s] preset %d recalled", self.host, preset_index)

    # ──────────────────────────────────────────────────────────────────────────
    # AVB streams
    # ──────────────────────────────────────────────────────────────────────────

    async def get_avb_streams(self) -> List[TesiraStreamInfo]:
        """
        Enumerate AVB send and receive streams.

        Queries 'ExplicitAVBIOCard1' and similar instance tags.
        Falls back to a generic approach if specific tags are unavailable.
        """
        streams: list[TesiraStreamInfo] = []
        # Try up to 64 send streams
        for i in range(1, 65):
            tag = f"ExplicitAVBOutStream{i}"
            resp = await self._client.send(tag, 'get', 'numChannels')
            if not resp.ok:
                break
            ch = int(resp.value) if resp.ok and resp.value else 2
            name_resp = await self._client.send(tag, 'get', 'streamName')
            name = str(name_resp.value) if name_resp.ok else f"TX Stream {i}"
            streams.append(TesiraStreamInfo(
                stream_index=i,
                direction='talker',
                name=name,
                channels=ch,
                entity_id=self._make_entity_id('tx', i),
            ))

        # Try up to 64 receive streams
        for i in range(1, 65):
            tag = f"ExplicitAVBInStream{i}"
            resp = await self._client.send(tag, 'get', 'numChannels')
            if not resp.ok:
                break
            ch = int(resp.value) if resp.ok and resp.value else 2
            name_resp = await self._client.send(tag, 'get', 'streamName')
            name = str(name_resp.value) if name_resp.ok else f"RX Stream {i}"
            streams.append(TesiraStreamInfo(
                stream_index=i + 64,
                direction='listener',
                name=name,
                channels=ch,
                entity_id=self._make_entity_id('rx', i),
            ))

        return streams

    def _make_entity_id(self, direction: str, index: int) -> str:
        """Construct a pseudo entity_id for AvbRouter registration."""
        mac = self.info.mac_address.replace(':', '') if self.info else 'tesira000000000000'
        return f"{mac}{direction}{index:04x}"

    # ──────────────────────────────────────────────────────────────────────────
    # PTP status
    # ──────────────────────────────────────────────────────────────────────────

    async def get_ptp_status(self) -> Dict[str, Any]:
        """Query PTP synchronisation status from 'AVBInterface1'."""
        resp = await self._client.send('AVBInterface1', 'get', 'ptpStatus')
        if not resp.ok:
            return {'state': 'UNKNOWN', 'offset_ns': None, 'grandmaster_id': None}
        # Value is typically a string like "MASTER" or "SLAVE"
        state = str(resp.value).upper() if resp.value else 'UNKNOWN'
        # Try to get offset
        offset_resp = await self._client.send('AVBInterface1', 'get', 'ptpOffset')
        offset_ns = int(offset_resp.value) if offset_resp.ok and offset_resp.value else None
        gm_resp = await self._client.send('AVBInterface1', 'get', 'ptpGrandmasterID')
        gm_id = str(gm_resp.value) if gm_resp.ok and gm_resp.value else None
        return {
            'state': state,
            'offset_ns': offset_ns,
            'grandmaster_id': gm_id,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Metering subscriptions
    # ──────────────────────────────────────────────────────────────────────────

    async def start_metering(self, instance_tag: str, interval_ms: int = 100) -> None:
        """
        Subscribe to push-based level metering for a DSP block.

        The Tesira will push:
          '! <instance_tag> level [v1 v2 ... vN]'
        at the specified interval.
        """
        await self._client.subscribe(instance_tag, 'level', interval_ms)
        logger.debug("TesiraDevice[%s] metering started: %s @ %dms", self.host, instance_tag, interval_ms)

    async def stop_metering(self, instance_tag: str) -> None:
        """Unsubscribe from push-based level metering."""
        await self._client.unsubscribe(instance_tag, 'level')

    # ──────────────────────────────────────────────────────────────────────────
    # Fault list
    # ──────────────────────────────────────────────────────────────────────────

    async def get_fault_list(self) -> List[str]:
        """Return the device fault list as a list of strings."""
        resp = await self._client.send('device', 'get', 'faultList')
        if not resp.ok:
            return []
        if isinstance(resp.value, list):
            return [str(f) for f in resp.value]
        if resp.value:
            return [str(resp.value)]
        return []

    # ──────────────────────────────────────────────────────────────────────────
    # Push callback wiring
    # ──────────────────────────────────────────────────────────────────────────

    def on_push(self, callback: Callable[[str, str, str, Any], None]) -> None:
        """
        Register a fleet-level push callback.
        callback(device_id, instance_tag, attribute, value)
        """
        self._push_callbacks.append(callback)

    def _on_client_push(self, instance_tag: str, attribute: str, value: Any) -> None:
        """Receive a push from TTPClient and forward with device_id prepended."""
        for cb in self._push_callbacks:
            try:
                cb(self.device_id, instance_tag, attribute, value)
            except Exception as exc:
                logger.error("TesiraDevice push callback error: %s", exc)
