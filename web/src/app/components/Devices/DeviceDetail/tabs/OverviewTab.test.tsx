import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen } from '@testing-library/react'

import { OverviewTab } from './OverviewTab'
import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'

function makeProfile(overrides?: Partial<DeviceProfileDetail['document']>): DeviceProfileDetail {
  return {
    pack_id: 'edirol-ua',
    model: 'ua-1000',
    kind: 'audio',
    path: '/repo/device-packs/edirol-ua/profiles/ua-1000.audio.yaml',
    hardware_id: 'usb:0582:00ed',
    document: {
      description: 'Edirol UA-1000 USB audio interface, 10×10 channels.',
      identity: {
        hardware_id: 'usb:0582:00ed',
        alsa_card_regex: 'EDIROL.*UA-?1000',
      },
      capabilities: ['10x10', 'monitor-mixer', 'spdif-coax'],
      sample_rates: [44100, 48000, 96000],
      inputs: [
        { name: 'AUX0', kind: '1/4 TRS', description: 'Analog input 1' },
      ],
      outputs: [
        { name: 'OUT0', kind: '1/4 TRS', description: 'Analog output 1' },
      ],
      ...overrides,
    } as Record<string, unknown>,
  }
}

test('OverviewTab: renders description + identity rows', () => {
  render(<OverviewTab profile={makeProfile()} />)
  expect(screen.getByText(/Edirol UA-1000 USB audio interface/)).toBeInTheDocument()
  expect(screen.getByText('usb:0582:00ed')).toBeInTheDocument()
  expect(screen.getByText('EDIROL.*UA-?1000')).toBeInTheDocument()
})

test('OverviewTab: capabilities + sample rates render as Carbon Tags', () => {
  render(<OverviewTab profile={makeProfile()} />)
  expect(screen.getByText('10x10')).toBeInTheDocument()
  expect(screen.getByText('44,100 Hz')).toBeInTheDocument()
  expect(screen.getByText('96,000 Hz')).toBeInTheDocument()
})

test('OverviewTab: inputs and outputs sections render labels + counts', () => {
  render(<OverviewTab profile={makeProfile()} />)
  expect(screen.getByText('Inputs (1)')).toBeInTheDocument()
  expect(screen.getByText('Outputs (1)')).toBeInTheDocument()
  expect(screen.getByText('AUX0')).toBeInTheDocument()
  expect(screen.getByText('OUT0')).toBeInTheDocument()
})

test('OverviewTab: handles empty arrays without crashing', () => {
  render(<OverviewTab profile={makeProfile({ inputs: [], outputs: [], capabilities: [] })} />)
  // Identity is always present so the tab still renders content.
  expect(screen.getByText('usb:0582:00ed')).toBeInTheDocument()
  // Inputs / Outputs sections shouldn't render when empty.
  expect(screen.queryByText(/Inputs \(/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Outputs \(/)).not.toBeInTheDocument()
})
