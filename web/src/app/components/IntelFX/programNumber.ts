export function formatIntelFXProgramNumber(program: number): string {
  const normalized = Math.max(0, Math.min(255, Math.floor(program)))
  // 0-127 = User (U001-U128), 128-255 = Factory (F001-F128)
  if (normalized < 128) {
    return `U${String(normalized + 1).padStart(3, '0')}`
  }
  return `F${String(normalized - 128 + 1).padStart(3, '0')}`
}

export function formatIntelFXProgramLabel(program: number, prefix = ''): string {
  return `${prefix}${formatIntelFXProgramNumber(program)}`
}

export function formatIntelFXProgramName(program: number, name?: string | null): string {
  if (!name || name.trim() === '' || name.toLowerCase() === `program ${program}`) {
    return formatIntelFXProgramNumber(program)
  }
  return name.trim()
}
