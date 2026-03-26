export const oledPalette = {
  accent: '#36f4ff',
  focus: '#8cf8ff',
  text: '#f4fff7',
  muted: '#91a89f',
  idle: '#5f746d',
  success: '#7dff72',
  warning: '#ffc857',
  danger: '#ff6b6b',
  border: '#0aa7b8',
} as const

export function statusTone(status: 'ok' | 'warn' | 'error' | 'idle'): string {
  if (status === 'ok') {
    return oledPalette.success
  }
  if (status === 'warn') {
    return oledPalette.warning
  }
  if (status === 'error') {
    return oledPalette.danger
  }
  return oledPalette.idle
}

export function toastTone(tone: 'info' | 'warn' | 'error'): string {
  if (tone === 'warn') {
    return oledPalette.warning
  }
  if (tone === 'error') {
    return oledPalette.danger
  }
  return oledPalette.accent
}
