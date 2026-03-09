# MAP2 Native MIDI Hub Architecture (T066-subA)

## Scope

This document defines the core MIDI Hub engine and port abstraction layer delivered in `app/services/midi_hub/`.

## Core Components

- `ring_buffer.py`
  - `MidiRingBuffer`: bounded FIFO queue for hot-path MIDI message passing.
  - Supports drop-on-full or overwrite-on-full behavior.
  - Provides queue stats for diagnostics.

- `ports.py`
  - `MidiPort` abstract base class.
  - Concrete ports:
    - `AlsaMidiPort` (python-rtmidi-backed ALSA)
    - `JackMidiPort` (JACK bridge placeholder, in-process buffer)
    - `VirtualMidiPort` (internal software routing)
    - `NetworkMidiPort` (RTP-MIDI placeholder, in-process buffer)
  - Shared `MidiMessage` envelope with timestamp + source/destination metadata.

- `hub.py`
  - `MidiHub` singleton (`get_midi_hub()`) as central owner of all ports.
  - Dedicated MIDI I/O worker thread:
    - drains outbound queue
    - polls inbound data from registered ports
    - dispatches messages to subscribers via central message bus
  - Dedicated hot-plug polling thread:
    - ALSA snapshot polling
    - auto-rebuild of ALSA port inventory
  - Best-effort RT scheduling via `SCHED_FIFO` when privileges permit.

## Thread Model

- `midi_hub_io` thread
  - High-frequency poll loop (`poll_interval_s`, default 2 ms)
  - Runs message collection, queue drain, subscriber dispatch.

- `midi_hub_hotplug` thread
  - Lower-frequency port monitor (`hotplug_interval_s`, default 1.5 s)
  - Reconciles ALSA port changes.

## Message Flow

1. Producer calls `hub.send(...)` -> outbound ring buffer.
2. I/O thread drains outbound queue -> `port.send(data)`.
3. I/O thread polls `port.receive()` for inbound data.
4. Inbound messages pushed to inbound ring buffer.
5. I/O thread dispatches messages to registered subscribers.

## Port Abstraction Contract

Each `MidiPort` implementation must provide:

- `open() -> bool`
- `close() -> None`
- `send(data: bytes) -> bool`
- `receive(max_messages: int) -> list[MidiMessage]`

## Current Limitations (Planned Follow-on)

- JACK bridge currently implemented as a placeholder virtual transport; JUCE/JACK bridge work belongs to `T066-subF`.
- Network MIDI is a placeholder (`NetworkMidiPort`) until `T066-subN` RTP-MIDI implementation.
- Ring buffer is lock-minimized but not formally lock-free under all Python runtime semantics.

## Delivered Files

- `app/services/midi_hub/__init__.py`
- `app/services/midi_hub/ring_buffer.py`
- `app/services/midi_hub/ports.py`
- `app/services/midi_hub/hub.py`
- `tests/midi_hub/*`
