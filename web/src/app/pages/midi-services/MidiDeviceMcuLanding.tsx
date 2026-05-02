/**
 * T2485-7a — /midi/devices/mackie-mcu-pro landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { mcuDeviceManifest } from '../../components/Devices/Mcu/deviceManifest'

export function MidiDeviceMcuLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={mcuDeviceManifest}
      consoleRoute="/mcu"
      consoleLabel="Open MCU Pro console"
    />
  )
}

export default MidiDeviceMcuLanding
