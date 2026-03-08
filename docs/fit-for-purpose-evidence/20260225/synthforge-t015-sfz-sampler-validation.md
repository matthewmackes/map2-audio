# SynthForge T015 SFZ Sampler Validation (2026-02-25T02:26:04+00:00)

## Goal
- Verify that loading an SFZ enables sampler mode and MIDI note playback transitions active voices as expected.

## Result
- Overall: `PASS`

## Checks
- initialize_ok: `PASS`
- start_audio_ok: `PASS`
- load_sfz_ok: `PASS`
- status_sampler_mode_true: `PASS`
- status_loaded_true: `PASS`
- note_on_accepted: `PASS`
- mid_active_voices_ge_1: `PASS`
- post_active_voices_zero: `PASS`

## Key Metrics
- status_after_load: `{'loaded': True, 'sampler_mode': True, 'part_index': 0, 'region_count': 1, 'loaded_sample_count': 1, 'sfz_path': '/home/mm/map2-audio/tmp/synthforge-sfz-validation/tone.sfz', 'last_error': '', 'warnings': []}`
- pre_voice_metrics: `{'active_voices': 0, 'peak_voices': 0, 'cpu_percent': 0.0, 'voices_per_part': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}`
- mid_voice_metrics: `{'active_voices': 1, 'peak_voices': 1, 'cpu_percent': 0.0, 'voices_per_part': [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}`
- post_voice_metrics: `{'active_voices': 0, 'peak_voices': 1, 'cpu_percent': 0.0, 'voices_per_part': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]}`

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/synthforge-t015-sfz-sampler-validation.json`
- Markdown: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/synthforge-t015-sfz-sampler-validation.md`
