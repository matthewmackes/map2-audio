// Pure geometry helpers for the SVG piano. White-key indices in a single
// octave: 0,2,4,5,7,9,11 (C,D,E,F,G,A,B). Black keys: 1,3,6,8,10
// (C#,D#,F#,G#,A#).

export const FIRST_NOTE = 36 // C2
export const LAST_NOTE = 84 // C6
export const TOTAL_NOTES = LAST_NOTE - FIRST_NOTE + 1 // 49

const WHITE_KEY_PCS = new Set([0, 2, 4, 5, 7, 9, 11])

export function isWhiteKey(midiNote: number): boolean {
  return WHITE_KEY_PCS.has(midiNote % 12)
}

export function isBlackKey(midiNote: number): boolean {
  return !isWhiteKey(midiNote)
}

export interface KeyLayout {
  midi: number
  isWhite: boolean
  // x position (left edge in viewBox units). 0 = far left.
  x: number
  width: number
  height: number
}

export interface PianoLayout {
  whiteKeys: KeyLayout[]
  blackKeys: KeyLayout[]
  viewBoxWidth: number
  viewBoxHeight: number
  whiteKeyWidth: number
  whiteKeyHeight: number
  blackKeyWidth: number
  blackKeyHeight: number
}

export interface BuildPianoLayoutOptions {
  firstNote?: number
  lastNote?: number
  whiteKeyWidth?: number
  whiteKeyHeight?: number
  /** Black key width as a fraction of white key width (default 0.62). */
  blackKeyWidthRatio?: number
  /** Black key height as a fraction of white key height (default 0.62). */
  blackKeyHeightRatio?: number
}

export function buildPianoLayout(options: BuildPianoLayoutOptions = {}): PianoLayout {
  const firstNote = options.firstNote ?? FIRST_NOTE
  const lastNote = options.lastNote ?? LAST_NOTE
  const whiteKeyWidth = options.whiteKeyWidth ?? 14
  const whiteKeyHeight = options.whiteKeyHeight ?? 80
  const blackKeyWidth = whiteKeyWidth * (options.blackKeyWidthRatio ?? 0.62)
  const blackKeyHeight = whiteKeyHeight * (options.blackKeyHeightRatio ?? 0.62)

  const whiteKeys: KeyLayout[] = []
  const blackKeys: KeyLayout[] = []
  let whiteIndex = 0
  for (let midi = firstNote; midi <= lastNote; midi += 1) {
    if (isWhiteKey(midi)) {
      whiteKeys.push({
        midi,
        isWhite: true,
        x: whiteIndex * whiteKeyWidth,
        width: whiteKeyWidth,
        height: whiteKeyHeight,
      })
      whiteIndex += 1
    }
  }
  // Place black keys *after* whites so we know widthsoffsets.
  for (let midi = firstNote; midi <= lastNote; midi += 1) {
    if (!isWhiteKey(midi)) {
      // Black key sits between this midi note's surrounding white keys.
      // Find the white-key x for the white key one semitone below.
      const whiteBelow = whiteKeys.find((k) => k.midi === midi - 1)
      if (!whiteBelow) continue
      blackKeys.push({
        midi,
        isWhite: false,
        x: whiteBelow.x + whiteKeyWidth - blackKeyWidth / 2,
        width: blackKeyWidth,
        height: blackKeyHeight,
      })
    }
  }

  return {
    whiteKeys,
    blackKeys,
    viewBoxWidth: whiteKeys.length * whiteKeyWidth,
    viewBoxHeight: whiteKeyHeight,
    whiteKeyWidth,
    whiteKeyHeight,
    blackKeyWidth,
    blackKeyHeight,
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  const name = NOTE_NAMES[midi % 12]!
  return `${name}${octave}`
}

/**
 * Velocity → tint percentage 0..1. Velocity 1 → ~25% tint, velocity 127 → 100% tint.
 * Velocity 0 = no tint (note is off).
 */
export function velocityToTint(velocity: number): number {
  if (velocity <= 0) return 0
  const clamped = Math.max(1, Math.min(127, velocity))
  return 0.25 + 0.75 * ((clamped - 1) / 126)
}
