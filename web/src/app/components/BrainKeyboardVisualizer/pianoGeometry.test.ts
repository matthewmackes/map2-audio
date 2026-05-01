// T2480-3 hardening: pure-function tests for the SVG piano geometry.

import {
  FIRST_NOTE,
  LAST_NOTE,
  TOTAL_NOTES,
  buildPianoLayout,
  isBlackKey,
  isWhiteKey,
  midiToNoteName,
  velocityToTint,
} from './pianoGeometry'

describe('pianoGeometry — note constants', () => {
  it('spans C2 to C6 (49 notes)', () => {
    expect(FIRST_NOTE).toBe(36)
    expect(LAST_NOTE).toBe(84)
    expect(TOTAL_NOTES).toBe(49)
  })
})

describe('pianoGeometry — isWhiteKey / isBlackKey', () => {
  it('classifies the canonical octave correctly', () => {
    // C, D, E, F, G, A, B = white
    expect(isWhiteKey(60)).toBe(true) // C4
    expect(isWhiteKey(62)).toBe(true) // D4
    expect(isWhiteKey(64)).toBe(true) // E4
    expect(isWhiteKey(65)).toBe(true) // F4
    expect(isWhiteKey(67)).toBe(true) // G4
    expect(isWhiteKey(69)).toBe(true) // A4
    expect(isWhiteKey(71)).toBe(true) // B4
    // C#, D#, F#, G#, A# = black
    expect(isWhiteKey(61)).toBe(false) // C#4
    expect(isWhiteKey(63)).toBe(false) // D#4
    expect(isWhiteKey(66)).toBe(false) // F#4
    expect(isWhiteKey(68)).toBe(false) // G#4
    expect(isWhiteKey(70)).toBe(false) // A#4
  })

  it('isBlackKey is the inverse of isWhiteKey', () => {
    for (let n = 0; n < 128; n += 1) {
      expect(isBlackKey(n)).toBe(!isWhiteKey(n))
    }
  })
})

describe('pianoGeometry — buildPianoLayout', () => {
  it('default layout has the expected white/black-key counts for C2..C6', () => {
    const layout = buildPianoLayout()
    // 49 keys total; 7 octaves of pattern from C2..C6 = 4 full octaves +
    // C6 itself. White-key count: 7*4 + 1 = 29.
    expect(layout.whiteKeys).toHaveLength(29)
    // Black-key count: 5*4 = 20 (C6 has no black-key partner above it).
    expect(layout.blackKeys).toHaveLength(20)
  })

  it('viewBoxWidth equals whiteKeys.length × whiteKeyWidth', () => {
    const layout = buildPianoLayout({ whiteKeyWidth: 10 })
    expect(layout.viewBoxWidth).toBe(layout.whiteKeys.length * 10)
  })

  it('viewBoxHeight equals whiteKeyHeight', () => {
    const layout = buildPianoLayout({ whiteKeyHeight: 50 })
    expect(layout.viewBoxHeight).toBe(50)
  })

  it('white keys are positioned at successive integer multiples of whiteKeyWidth', () => {
    const layout = buildPianoLayout({ whiteKeyWidth: 14 })
    layout.whiteKeys.forEach((key, idx) => {
      expect(key.x).toBe(idx * 14)
      expect(key.width).toBe(14)
      expect(key.isWhite).toBe(true)
    })
  })

  it('black keys are sized as a fraction of white keys per the ratio options', () => {
    const layout = buildPianoLayout({
      whiteKeyWidth: 20,
      whiteKeyHeight: 100,
      blackKeyWidthRatio: 0.5,
      blackKeyHeightRatio: 0.6,
    })
    expect(layout.blackKeyWidth).toBe(10)
    expect(layout.blackKeyHeight).toBe(60)
    layout.blackKeys.forEach((key) => {
      expect(key.width).toBe(10)
      expect(key.height).toBe(60)
      expect(key.isWhite).toBe(false)
    })
  })

  it('every key in the layout is in the requested midi range', () => {
    const layout = buildPianoLayout({ firstNote: 48, lastNote: 72 })
    const allKeys = [...layout.whiteKeys, ...layout.blackKeys]
    allKeys.forEach((key) => {
      expect(key.midi).toBeGreaterThanOrEqual(48)
      expect(key.midi).toBeLessThanOrEqual(72)
    })
  })

  it('is empty when firstNote > lastNote', () => {
    const layout = buildPianoLayout({ firstNote: 100, lastNote: 50 })
    expect(layout.whiteKeys).toEqual([])
    expect(layout.blackKeys).toEqual([])
    expect(layout.viewBoxWidth).toBe(0)
  })
})

describe('pianoGeometry — midiToNoteName', () => {
  it('maps middle C correctly', () => {
    expect(midiToNoteName(60)).toBe('C4')
  })

  it('maps the chromatic scale of octave 4 in order', () => {
    expect(midiToNoteName(60)).toBe('C4')
    expect(midiToNoteName(61)).toBe('C#4')
    expect(midiToNoteName(62)).toBe('D4')
    expect(midiToNoteName(63)).toBe('D#4')
    expect(midiToNoteName(64)).toBe('E4')
    expect(midiToNoteName(65)).toBe('F4')
    expect(midiToNoteName(66)).toBe('F#4')
    expect(midiToNoteName(67)).toBe('G4')
    expect(midiToNoteName(68)).toBe('G#4')
    expect(midiToNoteName(69)).toBe('A4')
    expect(midiToNoteName(70)).toBe('A#4')
    expect(midiToNoteName(71)).toBe('B4')
  })

  it('octave boundary at midi 72 = C5', () => {
    expect(midiToNoteName(71)).toBe('B4')
    expect(midiToNoteName(72)).toBe('C5')
  })

  it('low notes use negative octaves where appropriate', () => {
    expect(midiToNoteName(0)).toBe('C-1')
    expect(midiToNoteName(11)).toBe('B-1')
    expect(midiToNoteName(12)).toBe('C0')
  })
})

describe('pianoGeometry — velocityToTint', () => {
  it('returns 0 for velocity 0 (note off)', () => {
    expect(velocityToTint(0)).toBe(0)
  })

  it('returns 0 for negative velocity (defensive)', () => {
    expect(velocityToTint(-1)).toBe(0)
  })

  it('returns ~0.25 floor for the lightest note-on (velocity 1)', () => {
    expect(velocityToTint(1)).toBeCloseTo(0.25, 2)
  })

  it('returns 1.0 for max velocity 127', () => {
    expect(velocityToTint(127)).toBeCloseTo(1.0, 2)
  })

  it('clamps overflow above 127 to 1.0', () => {
    expect(velocityToTint(200)).toBeCloseTo(1.0, 2)
  })

  it('produces monotonically increasing tints', () => {
    let prev = velocityToTint(1)
    for (let v = 2; v <= 127; v += 1) {
      const t = velocityToTint(v)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })
})
