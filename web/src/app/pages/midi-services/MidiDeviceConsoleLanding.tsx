/**
 * T2485-7a — generic landing for MIDI devices whose primary operator
 * workflow lives on a dedicated console route (Maschine, MCU,
 * LaunchControl, MidiCommander, etc.).
 *
 * Renders the device's title + 3-line purpose block (DeviceLandingHeader)
 * and a Carbon Button cross-linking to the console route.
 */

import { Button, Section } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { useNavigate } from 'react-router-dom'

import { DeviceLandingHeader } from '../../components/Devices/Shared/DeviceLandingHeader'
import type { DeviceManifest } from '../../components/Devices/Shared/deviceManifest'

export interface MidiDeviceConsoleLandingProps {
  manifest: DeviceManifest
  consoleRoute: string
  consoleLabel: string
}

export function MidiDeviceConsoleLanding({
  manifest,
  consoleRoute,
  consoleLabel,
}: MidiDeviceConsoleLandingProps) {
  const navigate = useNavigate()
  return (
    <Section className="midi-device-console-landing">
      <DeviceLandingHeader manifest={manifest} />
      <div style={{ paddingBlockStart: 'var(--cds-spacing-05, 1rem)' }}>
        <Button
          kind="primary"
          renderIcon={() => <ArrowRight aria-hidden />}
          iconDescription={`Open ${consoleLabel}`}
          onClick={() => navigate(consoleRoute)}
        >
          {consoleLabel}
        </Button>
      </div>
    </Section>
  )
}

export default MidiDeviceConsoleLanding
