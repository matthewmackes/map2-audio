# MAP2 API Event Catalog

This catalog describes the initial WebSocket/event contract for the most important realtime topics.

## Topic: midi_activity

Representative message:

```json
{
  "type": "midi_message",
  "data": {
    "message_type": "note_on",
    "raw_hex": "90 3C 64",
    "channel": 1,
    "source_port": "source:controller",
    "destination_port": "consumer:midi_broadcast",
    "metadata": {}
  },
  "timestamp": "2026-03-10T11:30:00"
}
```

## Topic: meters

Representative message:

```json
{
  "type": "meter_update",
  "data": {
    "channels": [
      {"index": 0, "peak_db": -6.5},
      {"index": 1, "peak_db": -6.2}
    ]
  },
  "timestamp": "2026-03-10T11:30:00"
}
```

## Topic: pipewire_metrics

Representative message:

```json
{
  "type": "pipewire_metrics",
  "data": {
    "sample_rate": 48000,
    "quantum": 64,
    "xrun_count": 0,
    "jitter_ms": 0.12
  },
  "timestamp": "2026-03-10T11:30:00"
}
```

## Topic: mpx1

Representative message:

```json
{
  "type": "mpx1:state",
  "data": {
    "connected": true,
    "program": 12,
    "preset_name": "Large Hall"
  },
  "timestamp": "2026-03-10T11:30:00"
}
```

## Topic: tesira:device_state

Representative message:

```json
{
  "type": "tesira:device_state",
  "data": {
    "device_id": "device-a",
    "state": "connected",
    "error": null
  },
  "timestamp": "2026-03-10T11:30:00"
}
```
