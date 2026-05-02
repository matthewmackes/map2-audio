/**
 * T2485-7c — /midi/devices/voodoo-lab-ground-control-pro landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { groundControlProDeviceManifest } from '../../components/Devices/GroundControlPro/deviceManifest'

export function MidiDeviceGroundControlProLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={groundControlProDeviceManifest}
      consoleRoute="/ground-control-pro"
      consoleLabel="Open Ground Control Pro console"
    />
  )
}

export default MidiDeviceGroundControlProLanding
