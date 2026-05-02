/**
 * T2485-7a — /midi/devices/novation-launch-control-xl landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { launchControlDeviceManifest } from '../../components/Devices/LaunchControl/deviceManifest'

export function MidiDeviceLaunchControlLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={launchControlDeviceManifest}
      consoleRoute="/launch-control"
      consoleLabel="Open Launch Control console"
    />
  )
}

export default MidiDeviceLaunchControlLanding
