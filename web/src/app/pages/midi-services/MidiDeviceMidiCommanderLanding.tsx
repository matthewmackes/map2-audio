/**
 * T2485-7a — /midi/devices/meloaudio-midi-commander landing.
 */

import { MidiDeviceConsoleLanding } from './MidiDeviceConsoleLanding'
import { midiCommanderDeviceManifest } from '../../components/Devices/MidiCommander/deviceManifest'

export function MidiDeviceMidiCommanderLanding() {
  return (
    <MidiDeviceConsoleLanding
      manifest={midiCommanderDeviceManifest}
      consoleRoute="/midi-commander"
      consoleLabel="Open MIDI Commander console"
    />
  )
}

export default MidiDeviceMidiCommanderLanding
