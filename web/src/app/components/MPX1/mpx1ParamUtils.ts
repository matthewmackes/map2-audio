import type { MPX1RegistryParam } from '../../../map2/mpx1Api'

export interface MPX1ParamPageGroup {
  page: string
  params: MPX1RegistryParam[]
}

export function clampMpx1Value(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function mpx1AlgorithmKey(index: number): string {
  return `alg_${Math.max(0, index).toString().padStart(2, '0')}`
}

export function getMpx1ParamValue(param: MPX1RegistryParam, shadow: Record<string, number>): number {
  const raw = shadow[param.id]
  if (Number.isFinite(raw)) return Number(raw)
  if (Number.isFinite(param.default)) return Number(param.default)
  return Number(param.range?.min ?? 0)
}

export function formatMpx1ParamValue(param: MPX1RegistryParam, value: number): string {
  const units = (param.units ?? '').toLowerCase()

  if (units.includes('hz')) {
    return Math.abs(value) >= 1000
      ? `${(value / 1000).toFixed(2)} kHz`
      : `${Math.round(value)} Hz`
  }

  if (units === 's' || units === 'sec' || units === 'seconds') {
    return Math.abs(value) < 1
      ? `${Math.round(value * 1000)} ms`
      : `${value.toFixed(2)} s`
  }

  if (units.includes('ms')) {
    return value >= 1000
      ? `${(value / 1000).toFixed(2)} s`
      : `${Math.round(value)} ms`
  }

  if (units.includes('db')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  }

  if (units.includes('note') || units.includes('division') || units.includes('beat')) {
    if (value === 1) return '1/1'
    if (value === 0.5) return '1/2'
    if (value === 0.25) return '1/4'
    if (value === 0.125) return '1/8'
    return `${value.toFixed(3)} ${param.units}`
  }

  if (units && units !== 'index' && units !== 'none') {
    return `${Math.round(value * 100) / 100} ${param.units}`
  }

  return `${Math.round(value * 100) / 100}`
}

export function groupMpx1ParamsByPage(params: MPX1RegistryParam[]): MPX1ParamPageGroup[] {
  const pages = new Map<string, MPX1RegistryParam[]>()
  for (const param of params) {
    const page = param.page || 'Parameters'
    const existing = pages.get(page) ?? []
    existing.push(param)
    pages.set(page, existing)
  }

  return Array.from(pages.entries()).map(([page, grouped]) => ({
    page,
    params: grouped.sort((a, b) => a.display_name.localeCompare(b.display_name)),
  }))
}

export function buildMpx1EnumValues(param: MPX1RegistryParam): number[] {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 0)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return [0]
  }
  const count = max - min + 1
  if (count > 64) {
    return [Math.round(min), Math.round(max)]
  }
  return Array.from({ length: count }, (_, index) => Math.round(min + index))
}
