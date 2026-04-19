import type { EnrichedPhysicalSurfaceUnit, EnrichedPhysicalSurfacesSummary } from '../../map2/types'

const STANDALONE_SURFACE_ROUTE_BY_UNIT_ID: Record<string, string> = {
  'maschine-mk1': '/maschine',
  'ableton-push': '/labs/push-surface',
  'mackie-mcu-pro': '/mcu',
  'novation-launch-control': '/launch-control',
  'meloaudio-midi-commander': '/midi-commander',
}

export function resolvePhysicalSurfaceStandaloneRoute(
  unitId: string,
  specializedRoute?: string | null,
): string | null {
  if (specializedRoute && specializedRoute.trim()) {
    return specializedRoute
  }
  return STANDALONE_SURFACE_ROUTE_BY_UNIT_ID[unitId] ?? null
}

export const FALLBACK_PHYSICAL_SURFACE_UNITS: Array<Pick<EnrichedPhysicalSurfaceUnit, 'unit_id' | 'display_name'> & { status: string }> = [
  { unit_id: 'maschine-mk1', display_name: 'Native Instruments Maschine MK1', status: 'planned' },
  { unit_id: 'ableton-push', display_name: 'Ableton Push', status: 'planned' },
  { unit_id: 'ground-control-pro', display_name: 'Voodoo Lab Ground Control Pro', status: 'planned' },
  { unit_id: 'meloaudio-midi-commander', display_name: 'MeloAudio MIDI Commander', status: 'planned' },
  { unit_id: 'novation-launch-control', display_name: 'Novation Launch Control Family', status: 'planned' },
  { unit_id: 'mackie-mcu-pro', display_name: 'Mackie MCU Pro', status: 'planned' },
]

export interface PhysicalSurfacesShellContextValue {
  summary: EnrichedPhysicalSurfacesSummary | null
  isLoading: boolean
  isError: boolean
}
