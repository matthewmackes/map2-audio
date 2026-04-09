export const oledPalette = {
  accent: '#0f62fe',
  focus: '#78a9ff',
  text: '#f4f4f4',
  muted: '#c6c6c6',
  idle: '#6f6f6f',
  success: '#24a148',
  warning: '#f1c21b',
  danger: '#fa4d56',
  border: '#525252',
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
