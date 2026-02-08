export type Topology = 'fet' | 'opto' | 'vca' | 'varimu' | 'limiter'

export type EraGroup = 'pioneers' | '1970s' | '1980s' | '1990s' | '2000s'

export interface CelestialPresetParams {
  threshold: number
  ratio: number
  attack: number
  release: number
  knee: number
  makeupGain: number
  autoMakeup: boolean
}

export interface CelestialPreset {
  id: string
  name: string
  era: string
  eraGroup: EraGroup
  year: number
  topology: Topology
  description: string
  confidence: 'A' | 'B' | 'C'
  referenceAlbums: string[]
  params: CelestialPresetParams
}

export interface GearImageProps {
  topology: Topology
  params: CelestialPresetParams
  gainReduction: number
  inputLevel: number
  outputLevel: number
  width?: number
  height?: number
}

export const TOPOLOGY_LABELS: Record<Topology, string> = {
  fet: 'FET',
  opto: 'OPTO',
  vca: 'VCA',
  varimu: 'VARI-MU',
  limiter: 'LIMITER',
}

export const TOPOLOGY_COLORS: Record<Topology, string> = {
  fet: '#e8913a',
  opto: '#4a9eff',
  vca: '#22c55e',
  varimu: '#a855f7',
  limiter: '#ef4444',
}

export const TOPOLOGY_GEAR_NAMES: Record<Topology, string> = {
  fet: 'Universal Audio 1176LN',
  opto: 'Teletronix LA-2A',
  vca: 'dbx 160',
  varimu: 'Fairchild 670',
  limiter: 'Brickwall Limiter',
}

export const ERA_LABELS: Record<EraGroup, string> = {
  pioneers: 'Pre-1970',
  '1970s': '1970s',
  '1980s': '1980s',
  '1990s': '1990s',
  '2000s': '2000s+',
}

export const ERA_ORDER: EraGroup[] = ['pioneers', '1970s', '1980s', '1990s', '2000s']
