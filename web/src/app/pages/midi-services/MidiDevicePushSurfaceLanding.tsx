/**
 * T2485-7d — /midi/devices/ableton-push-3 landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { pushSurfaceDeviceManifest } from '../../components/Devices/PushSurface/deviceManifest'

export function MidiDevicePushSurfaceLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={pushSurfaceDeviceManifest}
      consoleRoute="/labs/push-surface"
      consoleLabel="Open Push 3 console"
    />
  )
}

export default MidiDevicePushSurfaceLanding
