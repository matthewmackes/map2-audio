function normalizeHexColor(color: string): string | null {
  const trimmed = color.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return null
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex)
  if (!normalized) {
    return [148, 163, 184]
  }

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => clampChannel(value).toString(16).padStart(2, '0')).join('')}`
}

export function normalizePluginAppearanceColor(color: string | null | undefined): string | null {
  if (!color) {
    return null
  }

  return normalizeHexColor(color)
}

export function shiftPluginAppearanceColor(color: string | null | undefined, amount: number): string {
  const [r, g, b] = hexToRgb(color ?? '#94a3b8')
  return rgbToHex(r + amount, g + amount, b + amount)
}

export function resolvePluginAppearanceVariants(
  accentColor: string | null | undefined,
  darkVariant: string | null | undefined,
  lightVariant: string | null | undefined,
): { accent: string; dark: string; light: string } {
  const accent = normalizePluginAppearanceColor(accentColor) ?? '#94a3b8'
  return {
    accent,
    dark: normalizePluginAppearanceColor(darkVariant) ?? shiftPluginAppearanceColor(accent, -28),
    light: normalizePluginAppearanceColor(lightVariant) ?? shiftPluginAppearanceColor(accent, 28),
  }
}

export function rgbaFromPluginAppearanceColor(color: string | null | undefined, alpha: number): string {
  const [r, g, b] = hexToRgb(color ?? '#94a3b8')
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
