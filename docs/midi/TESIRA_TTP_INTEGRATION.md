# Tesira TTP Integration

Date: 2026-03-19  
Canonical task: `T203-subG`

## Overview

MAP2 exposes a Tesira Text Protocol integration surface in the MIDI Hub Network area for bidirectional control-style workflows.

Primary shipped elements:

- Connection manager
- Alias browser
- Free-text command console
- Subscription list
- Level/mute controls
- Preset recall/save
- Matrix status view

Implementation files:

- Backend: `app/services/midi_hub/tesira_client.py`
- Routes: `app/routes/midi_hub.py`
- Frontend: `web/src/app/components/MidiHub/TesiraPanel.tsx`

## Connection Model

Configurable fields:

- Hostname or IP
- Port
  - Default: `23`
- Username
- Password
- Secured Telnet toggle
- Auto reconnect toggle

Current implementation note:

- The shipped client is an in-memory protocol facade designed to preserve the API contract, operator workflow, and testability of the Tesira surface.
- Real hardware validation is intentionally deferred to `T203-subK`.

## Supported command patterns

Examples accepted by the client facade:

- `SESSION get aliases`
- `DEVICE get deviceInfo`
- `DEVICE recallPreset 1001`
- `DEVICE savePreset 1001`
- `DEVICE reboot`
- `DEVICE sleep`
- `DEVICE wake`
- `DEVICE startAudio`
- `DEVICE stopAudio`
- `Level1 get level`
- `Level1 set level -6.5`
- `Level1 get mute`
- `Level1 set mute true`
- `Level1 subscribe level`
- `MatrixMixer1 get crosspointLevel 1`

## Response model

The facade mirrors Tesira-style conventions:

- `+OK`
- `+OK "value":...`
- `+OK "publishToken":"..."`
- `-ERR ...`

The frontend also stores command history with timestamps for operator review.

## Prebuilt controls

The shipped UI exposes these operator shortcuts:

- Set level by instance tag
- Set mute by instance tag
- Recall preset by id
- Add subscription by instance tag + attribute
- Browse discovered aliases

## Alias and matrix support

The alias browser currently exposes representative block types:

- `Level`
- `MatrixMixer`
- `SourceSelector`
- `Meter`

Matrix status is returned as crosspoint rows containing:

- Input
- Output
- Level
- Mute

## Validation

- `pytest tests/test_tesira_client.py`
- `npm --prefix web run typecheck`
- `npm --prefix web run build`
