"""Virtual GPIO matrix for contact-closure simulation."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class VirtualGpioChannel:
    channel_id: str
    channel_type: str
    index: int
    label: str
    state: bool = False
    last_changed_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "channel_id": self.channel_id,
            "channel_type": self.channel_type,
            "index": self.index,
            "label": self.label,
            "state": self.state,
            "last_changed_at": self.last_changed_at,
        }


class VirtualGpioService:
    def __init__(self, inputs: int = 12, outputs: int = 12) -> None:
        self._inputs = {
            f"in-{index:02d}": VirtualGpioChannel(
                channel_id=f"in-{index:02d}",
                channel_type="input",
                index=index,
                label=f"Input {index}",
            )
            for index in range(1, inputs + 1)
        }
        self._outputs = {
            f"out-{index:02d}": VirtualGpioChannel(
                channel_id=f"out-{index:02d}",
                channel_type="output",
                index=index,
                label=f"Relay {index}",
            )
            for index in range(1, outputs + 1)
        }
        self._events: List[Dict[str, Any]] = []

    def snapshot(self) -> Dict[str, Any]:
        inputs = [row.to_dict() for row in self._inputs.values()]
        outputs = [row.to_dict() for row in self._outputs.values()]
        return {
            "input_count": len(inputs),
            "output_count": len(outputs),
            "inputs": inputs,
            "outputs": outputs,
            "events": self._events[-32:],
        }

    def _lookup(self, channel_id: str) -> VirtualGpioChannel:
        channel = self._inputs.get(channel_id) or self._outputs.get(channel_id)
        if channel is None:
            raise KeyError("unknown_channel")
        return channel

    def set_label(self, channel_id: str, label: str) -> Dict[str, Any]:
        channel = self._lookup(channel_id)
        channel.label = str(label).strip() or channel.label
        return channel.to_dict()

    def set_state(self, channel_id: str, state: bool, source: str = "api") -> Dict[str, Any]:
        channel = self._lookup(channel_id)
        channel.state = bool(state)
        channel.last_changed_at = time.time()
        event = {
            "channel_id": channel_id,
            "channel_type": channel.channel_type,
            "state": channel.state,
            "source": source,
            "timestamp": channel.last_changed_at,
        }
        self._events.append(event)
        return {"ok": True, "channel": channel.to_dict(), "event": event}

    def toggle(self, channel_id: str, source: str = "api") -> Dict[str, Any]:
        channel = self._lookup(channel_id)
        return self.set_state(channel_id, not channel.state, source=source)


_virtual_gpio_singleton: Optional[VirtualGpioService] = None


def get_virtual_gpio_service() -> VirtualGpioService:
    global _virtual_gpio_singleton
    if _virtual_gpio_singleton is None:
        _virtual_gpio_singleton = VirtualGpioService()
    return _virtual_gpio_singleton
