import { oledPalette, statusTone, toastTone } from './palette'

describe('oledPalette', () => {
  it('uses Carbon-aligned shared color tokens', () => {
    expect(oledPalette).toEqual({
      accent: '#0f62fe',
      focus: '#78a9ff',
      text: '#f4f4f4',
      muted: '#c6c6c6',
      idle: '#6f6f6f',
      success: '#24a148',
      warning: '#f1c21b',
      danger: '#fa4d56',
      border: '#525252',
    })
  })

  it('maps status helpers to the shared palette contract', () => {
    expect(statusTone('ok')).toBe(oledPalette.success)
    expect(statusTone('warn')).toBe(oledPalette.warning)
    expect(statusTone('error')).toBe(oledPalette.danger)
    expect(statusTone('idle')).toBe(oledPalette.idle)

    expect(toastTone('info')).toBe(oledPalette.accent)
    expect(toastTone('warn')).toBe(oledPalette.warning)
    expect(toastTone('error')).toBe(oledPalette.danger)
  })
})
