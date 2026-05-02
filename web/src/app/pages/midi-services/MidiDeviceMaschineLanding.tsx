/**
 * T2485-6 — /midi/devices/native-instruments-maschine-mk1 landing.
 * Uses the generic MidiDeviceConsoleLanding (T2485-7a).
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { maschineMk1DeviceManifest } from '../../components/Devices/Maschine/deviceManifest'

export function MidiDeviceMaschineLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={maschineMk1DeviceManifest}
      consoleRoute="/maschine"
      consoleLabel="Open Maschine console"
    />
  )
}

export default MidiDeviceMaschineLanding
