/**
 * Central registry of frontend Configurator pack descriptors.
 *
 * Phase 1 of the T2499 mega-epic (2026-05-09) replaced the ad-hoc
 * `LOCAL_PACK_REGISTRY` literal in `MidiServicesConfiguratorPage`
 * with this shared module. Backend pack-discovery
 * (`/api/midi/configurator/packs`) returns the canonical pack list;
 * the frontend looks each entry up here by its backend `pack_id`.
 *
 * Adding a new pack: implement a `ConfiguratorPackDescriptor`,
 * import it below, and register it under its backend pack_id key.
 * Every pack registered in `app/routes/configurator_packs.py` must
 * have a corresponding descriptor here — the picker hides packs
 * that lack a descriptor (silent filter, never a toast).
 */
import type { ConfiguratorPackDescriptor } from '../types'
import { maschineMk1Pack } from './maschineMk1'
import { meloaudioCommanderPack } from './meloaudioCommander'

/**
 * Map of `backend pack_id` → frontend `ConfiguratorPackDescriptor`.
 *
 * The backend `pack_id` is authoritative; the frontend descriptor's
 * `packId` field can be a simpler alias (e.g. backend
 * `meloaudio_commander` → frontend `meloaudio`).
 */
export const FRONTEND_PACK_REGISTRY: Readonly<
  Record<string, ConfiguratorPackDescriptor>
> = Object.freeze({
  meloaudio_commander: meloaudioCommanderPack,
  maschine_mk1: maschineMk1Pack,
})

/**
 * Look up a frontend descriptor by its backend pack_id. Returns
 * undefined when no descriptor is registered yet — the picker
 * filters such entries out so the operator never sees an
 * unactionable tile.
 */
export function lookupPackDescriptor(
  backendPackId: string,
): ConfiguratorPackDescriptor | undefined {
  return FRONTEND_PACK_REGISTRY[backendPackId]
}

/**
 * Every registered descriptor as a flat list (deterministic order
 * by insertion). Used as the offline fallback when the backend
 * pack-discovery endpoint hasn't resolved (or fails).
 */
export function listLocalPacks(): ConfiguratorPackDescriptor[] {
  return Object.values(FRONTEND_PACK_REGISTRY)
}
