import {
  CANVAS_BAND_H,
  CANVAS_BAND_Y,
  LCD_HEIGHT,
  LCD_WIDTH,
  TOP_BAND_H,
  renderLcdSpec,
  renderProfileLcds,
} from './profileLcdRenderer'
import { STARTER_PROFILES } from './profileDsl'

// T2522-B cycle 13 — Profile LCD renderer unit tests. We use a
// canvas mock because jsdom doesn't ship a real 2D context; the
// goal is to verify dispatch + control-flow, not pixel output.

interface MockCtx {
  fillStyle: string
  globalAlpha: number
  font: string
  textBaseline: string
  textAlign: string
  strokeStyle: string
  fillRect: jest.Mock
  fillText: jest.Mock
  beginPath: jest.Mock
  moveTo: jest.Mock
  lineTo: jest.Mock
  stroke: jest.Mock
}

function makeMockCtx(): MockCtx {
  return {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    textAlign: '',
    strokeStyle: '',
    fillRect: jest.fn(),
    fillText: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  }
}

describe('profileLcdRenderer', () => {
  it('exports the canonical 255×64 dimensions with a 12/40/12 band layout', () => {
    expect(LCD_WIDTH).toBe(255)
    expect(LCD_HEIGHT).toBe(64)
    expect(TOP_BAND_H).toBe(12)
    expect(CANVAS_BAND_Y).toBe(12)
    expect(CANVAS_BAND_H).toBe(40)
  })

  it('clears the canvas + paints top + bottom band on every render', () => {
    const ctx = makeMockCtx()
    renderLcdSpec(ctx as never, STARTER_PROFILES[0].lcd_left)
    // First fillRect = clear (255×64). Followed by the two bands.
    const calls = ctx.fillRect.mock.calls
    expect(calls[0]).toEqual([0, 0, LCD_WIDTH, LCD_HEIGHT])
    // The two bands paint at y=0 (top) and y=LCD_HEIGHT-12 (bottom).
    const yValues = calls.map((c) => c[1])
    expect(yValues).toContain(0)
    expect(yValues).toContain(LCD_HEIGHT - 12)
  })

  it('writes the top-band breadcrumb text via fillText', () => {
    const ctx = makeMockCtx()
    renderLcdSpec(ctx as never, STARTER_PROFILES[0].lcd_left)
    const written = ctx.fillText.mock.calls.map((c) => c[0])
    // T1 CTRL left LCD has top text 'CTRL · macros 1-4'.
    expect(written.some((t) => String(t).includes('CTRL'))).toBe(true)
  })

  it('renders the param-list template (T1 CTRL) without throwing', () => {
    const ctx = makeMockCtx()
    expect(() => renderLcdSpec(ctx as never, STARTER_PROFILES[0].lcd_left)).not.toThrow()
  })

  it('renders the kit-grid template (T5 SNAP) without throwing', () => {
    const snap = STARTER_PROFILES.find((p) => p.id === 'T5')!
    const ctx = makeMockCtx()
    expect(() => renderLcdSpec(ctx as never, snap.lcd_left)).not.toThrow()
  })

  it('renders the big-value template (T11 TUNER) without throwing', () => {
    const tuner = STARTER_PROFILES.find((p) => p.id === 'T11')!
    const ctx = makeMockCtx()
    expect(() => renderLcdSpec(ctx as never, tuner.lcd_left)).not.toThrow()
    expect(() => renderLcdSpec(ctx as never, tuner.lcd_right)).not.toThrow()
  })

  it('renderProfileLcds paints both sides into separate contexts', () => {
    const left = makeMockCtx()
    const right = makeMockCtx()
    renderProfileLcds(left as never, right as never, STARTER_PROFILES[0])
    expect(left.fillRect).toHaveBeenCalled()
    expect(right.fillRect).toHaveBeenCalled()
  })

  it('renderProfileLcds tolerates a null context', () => {
    const left = makeMockCtx()
    expect(() =>
      renderProfileLcds(left as never, null, STARTER_PROFILES[0]),
    ).not.toThrow()
  })
})
