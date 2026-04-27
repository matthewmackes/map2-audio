// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MidiLearnWizard Jest coverage — T2459-D4.

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// jsdom polyfills for Carbon TextInput / TextArea components.
class ResizeObserverPolyfill { observe() {} unobserve() {} disconnect() {} }
;(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverPolyfill

import { MidiLearnWizard } from './MidiLearnWizard'

const mockStart = jest.fn()
const mockCapture = jest.fn()
const mockAssign = jest.fn()
const mockCancel = jest.fn()
jest.mock('../../../../map2/clients/devices', () => ({
  learnStart: (...a) => mockStart(...a),
  learnCapture: (...a) => mockCapture(...a),
  learnAssign: (...a) => mockAssign(...a),
  learnCancel: (...a) => mockCancel(...a),
}))

beforeEach(() => {
  mockStart.mockReset()
  mockCapture.mockReset()
  mockAssign.mockReset()
  mockCancel.mockReset()
  // Default cancel to a resolved Promise so unmount cleanup paths
  // don't trip on `.catch of undefined`.
  mockCancel.mockResolvedValue({ session_id: 'noop', cancelled: false })
})

const PROPS = {
  packId: 'edirol-ua',
  model: 'ua-1000',
  controllerKey: 'alsa-seq:UA-1000 MIDI:0',
}

describe('MidiLearnWizard — T2459-D4', () => {
  it('shows the Start button initially', () => {
    render(<MidiLearnWizard {...PROPS} />)
    expect(screen.getByText('Start learn session')).toBeInTheDocument()
  })

  it('clicking Start opens a session and reveals Cancel/Assign buttons', async () => {
    mockStart.mockResolvedValue({ session_id: 'abc123' })
    render(<MidiLearnWizard {...PROPS} />)
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
    expect(screen.getByText('Assign binding')).toBeInTheDocument()
    expect(mockStart).toHaveBeenCalledWith({
      pack_id: 'edirol-ua', model: 'ua-1000',
      controller_key: 'alsa-seq:UA-1000 MIDI:0',
    })
  })

  it('a captured CC sweep is classified live as knob_absolute', async () => {
    mockStart.mockResolvedValue({ session_id: 'abc123' })
    mockCapture.mockResolvedValueOnce({
      session_id: 'abc123', kind: 'knob_absolute', confidence: 0.85,
      status: 0xB0, midino: 7, channel: 1, notes: 'absolute range 0-127',
    })

    const burst = [[0xB0, 7, 64]]
    render(
      <MidiLearnWizard
        {...PROPS}
        testCaptureSource={() => burst}
      />,
    )
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByTestId('learn-classification')).toBeInTheDocument()
    })
    expect(screen.getByText('knob_absolute')).toBeInTheDocument()
    expect(screen.getByText('85% confidence')).toBeInTheDocument()
    expect(screen.getByText(/midino 7/)).toBeInTheDocument()
  })

  it('Cancel clears the session and calls learnCancel', async () => {
    mockStart.mockResolvedValue({ session_id: 'abc123' })
    mockCancel.mockResolvedValue({ session_id: 'abc123', cancelled: true })
    render(<MidiLearnWizard {...PROPS} />)
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.getByText('Start learn session')).toBeInTheDocument()
    })
    expect(mockCancel).toHaveBeenCalledWith('abc123')
  })

  it('Assign posts the chosen target + action and shows the YAML row', async () => {
    mockStart.mockResolvedValue({ session_id: 'abc123' })
    mockCapture.mockResolvedValue({
      session_id: 'abc123', kind: 'knob_absolute', confidence: 0.85,
      status: 0xB0, midino: 7, channel: 1, notes: '',
    })
    mockAssign.mockResolvedValue({
      session_id: 'abc123',
      row: {
        status: 0xB0, midino: 7, channel: 1,
        target: 'audio.master.volume', action: 'set',
        description: 'Learned knob_absolute (confidence 0.85)',
      },
    })

    render(
      <MidiLearnWizard
        {...PROPS}
        testCaptureSource={() => [[0xB0, 7, 64]]}
      />,
    )
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByTestId('learn-classification')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText(/Engine target/), {
      target: { value: 'audio.master.volume' },
    })
    fireEvent.click(screen.getByText('Assign binding'))
    await waitFor(() => {
      expect(screen.getByTestId('learn-assigned-row')).toBeInTheDocument()
    })
    expect(mockAssign).toHaveBeenCalled()
    const callArgs = mockAssign.mock.calls[0][0]
    expect(callArgs.target).toBe('audio.master.volume')
  })

  it('shows an error notification when start fails', async () => {
    mockStart.mockRejectedValue(new Error('boom'))
    render(<MidiLearnWizard {...PROPS} />)
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByText('Learn wizard error')).toBeInTheDocument()
    })
  })

  it('the fast_path checkbox is wired into the assign payload', async () => {
    mockStart.mockResolvedValue({ session_id: 'abc' })
    mockCapture.mockResolvedValue({
      session_id: 'abc', kind: 'button', confidence: 0.7,
      status: 0xB0, midino: 64, channel: 1, notes: '',
    })
    mockAssign.mockResolvedValue({
      session_id: 'abc',
      row: { status: 0xB0, midino: 64, channel: 1, target: 'audio.chain.1.bypass', fast_path: true },
    })

    render(
      <MidiLearnWizard
        {...PROPS}
        testCaptureSource={() => [[0xB0, 64, 127]]}
      />,
    )
    fireEvent.click(screen.getByText('Start learn session'))
    await waitFor(() => {
      expect(screen.getByTestId('learn-classification')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText(/Engine target/), {
      target: { value: 'audio.chain.1.bypass' },
    })
    fireEvent.click(screen.getByLabelText(/Fast-path C\+\+ binding/))
    fireEvent.click(screen.getByText('Assign binding'))
    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalled()
    })
    const callArgs = mockAssign.mock.calls[0][0]
    expect(callArgs.fast_path).toBe(true)
  })
})
