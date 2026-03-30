from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

from .constants import (
    CONFIG_NUM_BYTES,
    CONFIG_OFFSET,
    NUM_PRESETS,
    PREAMBLE,
    PRESET_NUM_BYTES,
    PRESET_OFFSET,
    SYSEX_NUM_BYTES,
    TERMINATOR,
    TERMINATOR_OFFSET,
)


@dataclass(frozen=True)
class GroundControlSysexContainer:
    raw_bytes: bytes
    preamble: bytes
    config_block: bytes
    preset_blocks: Tuple[bytes, ...]
    terminator: bytes

    @classmethod
    def from_bytes(cls, data: bytes) -> "GroundControlSysexContainer":
        if len(data) != SYSEX_NUM_BYTES:
            raise ValueError(f"Expected {SYSEX_NUM_BYTES} bytes, received {len(data)}")
        if data[:CONFIG_OFFSET] != PREAMBLE:
            raise ValueError("Invalid Ground Control Pro preamble")
        if data[TERMINATOR_OFFSET:] != TERMINATOR:
            raise ValueError("Invalid Ground Control Pro terminator")

        config_block = data[CONFIG_OFFSET:CONFIG_OFFSET + CONFIG_NUM_BYTES]
        presets = []
        for index in range(NUM_PRESETS):
            begin = PRESET_OFFSET + (index * PRESET_NUM_BYTES)
            end = begin + PRESET_NUM_BYTES
            presets.append(data[begin:end])
        return cls(
            raw_bytes=bytes(data),
            preamble=bytes(data[:CONFIG_OFFSET]),
            config_block=bytes(config_block),
            preset_blocks=tuple(bytes(block) for block in presets),
            terminator=bytes(data[TERMINATOR_OFFSET:]),
        )

    def to_bytes(self) -> bytes:
        payload = bytearray(SYSEX_NUM_BYTES)
        payload[:CONFIG_OFFSET] = self.preamble
        payload[CONFIG_OFFSET:CONFIG_OFFSET + CONFIG_NUM_BYTES] = self.config_block
        for index, block in enumerate(self.preset_blocks):
            begin = PRESET_OFFSET + (index * PRESET_NUM_BYTES)
            payload[begin:begin + PRESET_NUM_BYTES] = block
        payload[TERMINATOR_OFFSET:] = self.terminator
        return bytes(payload)
