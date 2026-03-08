function normalizeProgram(program: number): number {
  if (!Number.isFinite(program)) return 0
  return Math.max(0, Math.floor(program))
}

const DEFAULT_PROGRAM_NAME_PATTERN = /^Program\s+(\d{1,3})$/i

export function formatMpx1ProgramNumber(program: number): string {
  const displayProgram = normalizeProgram(program) + 1
  return displayProgram.toString().padStart(3, '0')
}

export function formatMpx1ProgramLabel(program: number, prefix = ''): string {
  return `${prefix}${formatMpx1ProgramNumber(program)}`
}

export function formatMpx1ProgramName(program: number, fallback?: string | null): string {
  const trimmed = typeof fallback === 'string' ? fallback.trim() : ''
  if (!trimmed) {
    return `Program ${formatMpx1ProgramNumber(program)}`
  }

  const defaultNameMatch = trimmed.match(DEFAULT_PROGRAM_NAME_PATTERN)
  if (!defaultNameMatch) {
    return trimmed
  }

  const fallbackProgram = Number.parseInt(defaultNameMatch[1] ?? '', 10)
  if (Number.isFinite(fallbackProgram) && fallbackProgram === normalizeProgram(program)) {
    return `Program ${formatMpx1ProgramNumber(program)}`
  }

  return trimmed
}
