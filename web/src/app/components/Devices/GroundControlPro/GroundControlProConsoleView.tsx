/**
 * T2488 — single-view console under
 * /midi/devices/voodoo-lab-ground-control-pro/console.
 *
 * Composes the DeviceLandingHeader (T2485-1, manifest-driven title +
 * 3-line purpose) above the existing GroundControlProPage body. Path
 * A: the page's 5 internal tabs (Overview / Configuration / Presets /
 * Validation & Transfer / Forensics) are kept inside the page since
 * they share extensive state; converting them to route children
 * would force a 25-prop pass-through per panel without operator-
 * visible benefit.
 */

import { DeviceLandingHeader } from '../Shared/DeviceLandingHeader'
import { groundControlProDeviceManifest } from './deviceManifest'
import { GroundControlProPage } from '../../../pages/GroundControlProPage'

export function GroundControlProConsoleView() {
  return (
    <>
      <DeviceLandingHeader manifest={groundControlProDeviceManifest} />
      <GroundControlProPage />
    </>
  )
}

export default GroundControlProConsoleView
