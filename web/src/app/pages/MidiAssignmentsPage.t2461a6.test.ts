/** T2461-A6 — Brain capture waveform + MIDI source pairing on shared timeline. */
import {
  buildBrainCaptureWaveformPath,
  buildMidiSourceSample,
  buildMidiSourceWaveformPath,
} from './MidiAssignmentsPage'
import type { MidiMessage } from './midiAssignments/LiveMidiStrip'

const STARTED_AT = 1000
const DURATION = 10

test('buildBrainCaptureWaveformPath: returns empty string for no frames', () => {
  expect(buildBrainCaptureWaveformPath([], STARTED_AT, DURATION, 100, 50)).toBe('')
})

test('buildBrainCaptureWaveformPath: zero-duration returns empty string', () => {
  const frames = [{ peak_db: 0, ts: 1000 }, { peak_db: 0, ts: 1001 }]
  expect(buildBrainCaptureWaveformPath(frames, STARTED_AT, 0, 100, 50)).toBe('')
})

test('buildBrainCaptureWaveformPath: single frame at start renders one point', () => {
  const path = buildBrainCaptureWaveformPath(
    [{ peak_db: 0, ts: STARTED_AT }],
    STARTED_AT, DURATION, 100, 50,
  )
  // 0 dB → top of chart (y=0). t=0 → x=0.
  expect(path).toBe('M 0.0,0.0')
})

test('buildBrainCaptureWaveformPath: floor-db frame renders at chart bottom', () => {
  // -60 dB is the floor; t=0; expect x=0, y=height.
  const path = buildBrainCaptureWaveformPath(
    [{ peak_db: -60, ts: STARTED_AT }],
    STARTED_AT, DURATION, 100, 50,
  )
  expect(path).toBe('M 0.0,50.0')
})

test('buildBrainCaptureWaveformPath: clamps frames outside the time window to edges', () => {
  // First frame is before startedAt → t clamped to 0.
  // Last frame is way after duration → t clamped to 1.
  const frames = [
    { peak_db: 0, ts: STARTED_AT - 100 },
    { peak_db: 0, ts: STARTED_AT + DURATION + 100 },
  ]
  const path = buildBrainCaptureWaveformPath(frames, STARTED_AT, DURATION, 100, 50)
  expect(path).toBe('M 0.0,0.0 L 100.0,0.0')
})

test('buildBrainCaptureWaveformPath: clamps peak_db above ceiling to 0 dB', () => {
  const path = buildBrainCaptureWaveformPath(
    [{ peak_db: 12.0, ts: STARTED_AT }],
    STARTED_AT, DURATION, 100, 50,
  )
  // Above ceiling clamped → still y=0.
  expect(path).toBe('M 0.0,0.0')
})

test('buildBrainCaptureWaveformPath: midpoint frame at -30 dB → mid x, mid y', () => {
  // Midway through the window with a midway dB value.
  const path = buildBrainCaptureWaveformPath(
    [{ peak_db: -30, ts: STARTED_AT + DURATION / 2 }],
    STARTED_AT, DURATION, 100, 50,
  )
  // t=0.5 → x=50; -30dB normalised to (-30 - -60) / 60 = 0.5; y = 50 - 25 = 25.
  expect(path).toBe('M 50.0,25.0')
})

test('buildBrainCaptureWaveformPath: multi-frame path joins points with L', () => {
  const frames = [
    { peak_db: 0, ts: STARTED_AT },
    { peak_db: -60, ts: STARTED_AT + DURATION },
  ]
  const path = buildBrainCaptureWaveformPath(frames, STARTED_AT, DURATION, 100, 50)
  expect(path).toBe('M 0.0,0.0 L 100.0,50.0')
})

// ─── T2461-A6 MIDI source pairing ─────────────────────────────────────────

function ccMessage(value: number): MidiMessage {
  return { type: 'cc', cc: 7, ch: 1, v: value, ts: '00:00.000', source: 'ua-1000' }
}

test('buildMidiSourceSample: CC value 64 normalises to ~0.504 (just past midpoint)', () => {
  const s = buildMidiSourceSample(ccMessage(64), STARTED_AT, STARTED_AT + 1.5)
  expect(s.value).toBeCloseTo(64 / 127, 3)
  expect(s.relativeMs).toBe(1500)
  expect(s.cc).toBe(7)
  expect(s.ch).toBe(1)
})

test('buildMidiSourceSample: clamps relativeMs to >= 0 when message arrives before start', () => {
  const s = buildMidiSourceSample(ccMessage(127), STARTED_AT, STARTED_AT - 0.5)
  // -0.5s wall clock relative → clamped to 0.
  expect(s.relativeMs).toBe(0)
  expect(s.value).toBe(1)
})

test('buildMidiSourceSample: PC type emits centre value (1) since PC has no payload', () => {
  const m: MidiMessage = { type: 'pc', pc: 4, ch: 1, ts: '00:00.000' }
  const s = buildMidiSourceSample(m, STARTED_AT, STARTED_AT)
  expect(s.value).toBe(1)
  expect(s.pc).toBe(4)
})

test('buildMidiSourceSample: missing v defaults to 0 (silent message)', () => {
  const m: MidiMessage = { type: 'cc', cc: 11, ch: 1, ts: '00:00.000' }
  const s = buildMidiSourceSample(m, STARTED_AT, STARTED_AT)
  expect(s.value).toBe(0)
})

test('buildMidiSourceWaveformPath: empty samples → empty path', () => {
  expect(buildMidiSourceWaveformPath([], 5, 100, 50)).toBe('')
})

test('buildMidiSourceWaveformPath: zero-duration → empty path', () => {
  const samples = [
    { relativeMs: 0, value: 1, type: 'cc' as const, ch: 1 },
  ]
  expect(buildMidiSourceWaveformPath(samples, 0, 100, 50)).toBe('')
})

test('buildMidiSourceWaveformPath: single sample at midpoint at value 0.5 → centre of canvas', () => {
  const samples = [
    { relativeMs: 2500, value: 0.5, type: 'cc' as const, ch: 1 },
  ]
  // duration 5s, width 100 → x = 50; height 50 → y = 50 - 0.5*50 = 25.
  expect(buildMidiSourceWaveformPath(samples, 5, 100, 50)).toBe('M 50.0,25.0')
})

test('buildMidiSourceWaveformPath: multi-sample path joins with L on shared timeline', () => {
  const samples = [
    { relativeMs: 0, value: 0, type: 'cc' as const, ch: 1 },
    { relativeMs: 5000, value: 1, type: 'cc' as const, ch: 1 },
  ]
  // 0,0 → M 0.0,50.0  then 5000ms / 5s = end → L 100.0,0.0
  expect(buildMidiSourceWaveformPath(samples, 5, 100, 50)).toBe('M 0.0,50.0 L 100.0,0.0')
})

test('buildMidiSourceWaveformPath: clamps samples outside the window to edges', () => {
  const samples = [
    { relativeMs: -100, value: 0, type: 'cc' as const, ch: 1 },
    { relativeMs: 10_000, value: 1, type: 'cc' as const, ch: 1 },
  ]
  // duration 5s; first sample's relativeMs<0 → t=0; second>>duration → t=1.
  expect(buildMidiSourceWaveformPath(samples, 5, 100, 50)).toBe('M 0.0,50.0 L 100.0,0.0')
})

test('Brain + MIDI samples share the same timeline (alignment math)', () => {
  // Brain frame at 50% of window + MIDI sample at 50% of window
  // should produce paths that touch the same x coordinate.
  const brainFrames = [
    { peak_db: -30, ts: STARTED_AT + DURATION / 2 },
  ]
  const midiSamples = [
    { relativeMs: (DURATION / 2) * 1000, value: 0.5, type: 'cc' as const, ch: 1 },
  ]
  const brain = buildBrainCaptureWaveformPath(brainFrames, STARTED_AT, DURATION, 100, 50)
  const midi = buildMidiSourceWaveformPath(midiSamples, DURATION, 100, 50)
  // Both paths land at x=50.0 on a 100-wide canvas — proves the
  // shared-timeline contract the alignment cursor relies on.
  expect(brain).toContain('M 50.0,')
  expect(midi).toContain('M 50.0,')
})
