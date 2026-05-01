# Controller-host B5 golden-test fixtures

## What this is

T2482-P1.2 Gap D — the integration-proof gate for the Mixxx
ControllerEngine integration. Each fixture in this directory is
a deterministic record of what the controller-host daemon emits
in response to a known input sequence. The accompanying test
(`tests/test_controller_host_b5_golden_t2482p1_2.py`) replays the
input against a live daemon and compares the captured outbound
trace against the recorded ground-truth.

A failing B5 test = either a regression in the QuickJS engine OR
a divergence from the locked Mixxx ControllerEngine semantics.
Both are real bugs.

## Fixture format

Each `<name>.fixture.json` is a single JSON document with shape:

```json
{
  "name": "human-readable label",
  "controller_key": "stable identifier the host routes by",
  "descriptor": { /* MappingDescriptorPayload, see app/schemas/controller_host.py */ },
  "input_sequence": [
    { "type": "mapping_activate" },
    { "type": "controller_event", "bytes": [0xB0, 0x07, 0x40] },
    /* ... */
  ],
  "expected_outbound": [
    { "type": "log_event", "level": "info", "message_match": "mapping activated:" },
    /* ... */
  ]
}
```

`message_match` allows a substring match (input log lines may
include counts that vary across runs).

## Iter 65 status

The harness (`scripts/record_b5_baseline.py` — to be added in iter 66)
records a fresh fixture by replaying the `input_sequence` against the
binary and writing the captured outbound trace into
`expected_outbound`. Running it always produces a fresh ground truth.

This iter (65) ships the harness + ONE synthetic fixture
(`empty_descriptor_lifecycle.fixture.json`) that exercises the
mapping_activate → mapping_deactivate → mapping_reload lifecycle from
iter 64. Iter 67 adds a real Mixxx XML import as the second fixture.

## Provenance + license

Mixxx XML imports under `device-packs/_mixx-imports/` are
GPLv2-or-later. Fixtures derived from them retain that license; the
`expected_outbound` traces (host responses, not Mixxx code) are
under MAP2's AGPL-3.0-only.
