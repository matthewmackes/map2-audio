/**
 * T2485-7b — /midi/devices/expression landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { expressionDeviceManifest } from '../../components/Devices/Expression/deviceManifest'

export function MidiDeviceExpressionLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={expressionDeviceManifest}
      consoleRoute="/expression"
      consoleLabel="Open Expression console"
    />
  )
}

export default MidiDeviceExpressionLanding
