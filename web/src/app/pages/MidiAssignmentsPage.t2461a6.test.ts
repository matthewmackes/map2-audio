/** T2461-A6 — Brain capture waveform path builder. */
import { buildBrainCaptureWaveformPath } from './MidiAssignmentsPage'

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
