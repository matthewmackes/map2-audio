import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_TAGLINE,
  MAP2_PRIMARY_LABEL,
} from '../components/branding/map2Branding'

export type BrandPalette = {
  primary?: string
  primarySoft?: string
  onPrimary?: string
  background?: string
  surface?: string
  accent?: string
}

export type BrandCopy = {
  welcomeHeadline?: string
  welcomeSubline?: string
  loginBanner?: string
  systemdPrefix?: string
}

export type BrandManifest = {
  schemaVersion: number
  id: string
  productName: string
  shortName: string
  tagline: string
  vendor?: string
  homepage?: string
  assets?: Record<string, string>
  palette?: BrandPalette
  copy?: BrandCopy
}

/**
 * Default used until /api/branding resolves. Mirrors the on-disk manifest so
 * the first paint is correct even before the network round-trip completes.
 */
export const DEFAULT_BRAND: BrandManifest = {
  schemaVersion: 1,
  id: 'mackes-audio-platform',
  productName: MAP2_PLATFORM_NAME,
  shortName: MAP2_PRIMARY_LABEL,
  tagline: MAP2_PLATFORM_TAGLINE,
  vendor: 'Mackes',
  palette: {
    primary: '#4DA6FF',
    primarySoft: '#A6C8FF',
    onPrimary: '#000000',
    background: '#000000',
    surface: '#0E0E0E',
    accent: '#A6C8FF',
  },
  copy: {
    welcomeHeadline: 'Mackes Audio Platform',
    welcomeSubline: 'Professional real-time audio processing',
    loginBanner: 'Mackes Audio Platform — {hostname}',
    systemdPrefix: 'MAP — ',
  },
}

export async function fetchBrandManifest(): Promise<BrandManifest> {
  const res = await fetch('/api/branding', { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`branding fetch failed: ${res.status}`)
  }
  return (await res.json()) as BrandManifest
}

export async function patchBrandManifest(patch: Partial<BrandManifest>): Promise<BrandManifest> {
  const res = await fetch('/api/branding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(`branding patch failed: ${res.status}`)
  }
  return (await res.json()) as BrandManifest
}

export async function resetBrandManifest(): Promise<BrandManifest> {
  const res = await fetch('/api/branding/reset', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`branding reset failed: ${res.status}`)
  }
  return (await res.json()) as BrandManifest
}

export type BrandOsStatus = {
  plymouthInstalled: boolean
  loginBannerInstalled: boolean
  welcomeInstalled: boolean
  generatedEnvExists: boolean
  renderScript: string
  systemdScript: string
}

export async function fetchBrandOsStatus(): Promise<BrandOsStatus> {
  const res = await fetch('/api/branding/os-status', { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`os-status failed: ${res.status}`)
  }
  return (await res.json()) as BrandOsStatus
}

export type ApplyOsStep = {
  step: string
  returncode: number
  stdout: string
  stderr: string
}

export type ApplyOsResult = {
  dryRun: boolean
  steps: ApplyOsStep[]
}

export async function applyBrandOs(options: {
  dryRun: boolean
  applySystemd: boolean
  applyTemplates: boolean
}): Promise<ApplyOsResult> {
  const res = await fetch('/api/branding/apply-os', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(options),
  })
  if (!res.ok) {
    throw new Error(`apply-os failed: ${res.status}`)
  }
  return (await res.json()) as ApplyOsResult
}
