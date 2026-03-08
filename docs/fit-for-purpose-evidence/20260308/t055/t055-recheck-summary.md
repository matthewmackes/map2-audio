# T055 Analog Loopback Recheck (2026-03-08)

- checked_at_utc: `2026-03-08T15:27:29Z`
- active interface context: `Jogg USB Audio`
- auto-probe status: `failed` (playback `Jogg USB Audio Analog Stereo:playback_FL` -> capture `Built-in Audio Analog Stereo:capture_FL`)
- explicit FL->MONO status: `measured`
- explicit FL->MONO round_trip_ms: `23.823`
- explicit FR->MONO status: `failed`

## Repeatability (FL->MONO, 3 trials)
- round_trip_ms values: `[23.845, 23.951, 24.072]`
- mean: `23.956 ms`
- p95: `24.060 ms`
- range: `23.845 .. 24.072 ms`

## Conclusion
- UA-1000 acceptance criteria remain unmet on this host session because UA-1000 ports are not present in current JACK graph.
- The active Jogg path is measurable and repeatable on `playback_FL -> capture_MONO`, which confirms measurement tooling/path is functioning.