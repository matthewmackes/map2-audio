/**
 * T2485-6 — /midi/devices/native-instruments-maschine-mk1 landing page.
 *
 * Per the locked T2485 decision, /maschine remains the primary
 * hardware-console surface (T700). This landing renders the manifest
 * intro + a prominent cross-link to the console rather than
 * re-implementing the operator workflow under /midi/devices/.
 */

import { Button, Section } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { useNavigate } from 'react-router-dom'

import { DeviceLandingHeader } from '../../components/Devices/Shared/DeviceLandingHeader'
import { maschineMk1DeviceManifest } from '../../components/Devices/Maschine/deviceManifest'

export function MidiDeviceMaschineLanding() {
  const navigate = useNavigate()
  return (
    <Section className="midi-device-maschine-landing">
      <DeviceLandingHeader manifest={maschineMk1DeviceManifest} />
      <div style={{ paddingBlockStart: 'var(--cds-spacing-05, 1rem)' }}>
        <Button
          kind="primary"
          renderIcon={() => <ArrowRight aria-hidden />}
          iconDescription="Open Maschine console"
          onClick={() => navigate('/maschine')}
        >
          Open Maschine console
        </Button>
      </div>
    </Section>
  )
}

export default MidiDeviceMaschineLanding
