/**
 * T2492-1 — DevicePackGeneratorModal smoke tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { DevicePackGeneratorModal } from './DevicePackGeneratorModal'

jest.mock('../../../map2/clients/devicePackAutoGen', () => ({
  devicePackAutoGenApi: {
    lookup: jest.fn(),
    synthesize: jest.fn(),
    commit: jest.fn(),
    diagnostics: jest.fn(),
  },
}))

const TEST_DEVICE = {
  vid: '0x17cc',
  pid: '0x0808',
  alsa_name: 'Maschine MK1',
  usb_manufacturer: 'Native Instruments',
  usb_product: 'Maschine',
}

describe('DevicePackGeneratorModal', () => {
  it('renders all 5 ProgressIndicator step labels when open', () => {
    render(
      <DevicePackGeneratorModal
        open={true}
        device={TEST_DEVICE}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByText('Detected')).toBeInTheDocument()
    expect(screen.getByText('Enrichment')).toBeInTheDocument()
    expect(screen.getByText('Manifest')).toBeInTheDocument()
    expect(screen.getByText('Scaffolding')).toBeInTheDocument()
    expect(screen.getByText('Commit')).toBeInTheDocument()
  })

  it('shows the detected device USB descriptor on step 1', () => {
    render(
      <DevicePackGeneratorModal
        open={true}
        device={TEST_DEVICE}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByText('0x17cc')).toBeInTheDocument()
    expect(screen.getByText('0x0808')).toBeInTheDocument()
    expect(screen.getByText('Native Instruments')).toBeInTheDocument()
    expect(screen.getByText('Maschine')).toBeInTheDocument()
    expect(screen.getByText('Maschine MK1')).toBeInTheDocument()
  })

  it('renders modal heading + step-1 primary button "Look up"', () => {
    render(
      <DevicePackGeneratorModal
        open={true}
        device={TEST_DEVICE}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByText('Generate device-pack')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Look up' })).toBeInTheDocument()
  })

  it('renders nothing visible when device is null', () => {
    render(
      <DevicePackGeneratorModal
        open={true}
        device={null}
        onClose={() => undefined}
      />,
    )
    // Modal still mounts (Carbon contract) but the step-1 device card
    // is gated on `device !== null`, so the USB descriptor block is absent.
    expect(screen.queryByText('USB VID')).not.toBeInTheDocument()
  })

  it('calls onClose when the Cancel/Back button on step 1 is clicked', () => {
    const onClose = jest.fn()
    render(
      <DevicePackGeneratorModal
        open={true}
        device={TEST_DEVICE}
        onClose={onClose}
      />,
    )
    // Step 1's secondary button is "Cancel" (not "Back" — there's no back).
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
