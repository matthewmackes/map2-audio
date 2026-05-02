/**
 * T2486-4 — MidiClusterEnableSection integration tests.
 *
 * Mocks the underlying useMidiClusterSettings hook so we can drive
 * arbitrary states + mutations without standing up a real backend.
 * Tests assert the wiring contract:
 *   - status Tags reflect the settings state
 *   - Off→On opens the modal
 *   - Modal confirm triggers the update mutation with the right payload
 *   - On→Off does NOT open the modal — writes directly
 *   - Advisory inline notification appears in the asymmetric state
 *     (enabled ∧ ¬auto_connect) and dismisses to sessionStorage
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MidiClusterEnableSection } from './MidiClusterEnableSection'

const mockUpdate = jest.fn()
let mockSettings: { enabled: boolean; auto_connect: boolean } | null = null

jest.mock('../../hooks/useMidiClusterSettings', () => ({
  useMidiClusterSettings: () => ({
    settings: mockSettings,
    isLoading: false,
    isError: false,
    update: mockUpdate,
    isUpdating: false,
  }),
}))

beforeEach(() => {
  mockUpdate.mockReset()
  mockUpdate.mockResolvedValue({ enabled: true, auto_connect: true })
  mockSettings = { enabled: false, auto_connect: false }
  if (typeof window !== 'undefined') {
    window.sessionStorage.clear()
  }
})

describe('MidiClusterEnableSection', () => {
  it('renders the Disabled tag when both flags are false', () => {
    mockSettings = { enabled: false, auto_connect: false }
    render(<MidiClusterEnableSection />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.queryByText(/Auto-connect/)).not.toBeInTheDocument()
  })

  it('renders Enabled + Auto-connect on tags when both flags are true', () => {
    mockSettings = { enabled: true, auto_connect: true }
    render(<MidiClusterEnableSection />)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Auto-connect on')).toBeInTheDocument()
  })

  it('renders the asymmetric "Auto-connect off" state and the advisory', () => {
    mockSettings = { enabled: true, auto_connect: false }
    render(<MidiClusterEnableSection />)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('Auto-connect off')).toBeInTheDocument()
    expect(screen.getByTestId('midi-cluster-advisory')).toBeInTheDocument()
  })

  it('opens the modal when toggling Off → On', () => {
    mockSettings = { enabled: false, auto_connect: false }
    render(<MidiClusterEnableSection />)
    // Toggle is keyed on the Carbon Toggle id.
    const toggle = document.querySelector('#midi-cluster-enabled') as HTMLInputElement
    fireEvent.click(toggle)
    // Modal heading appears.
    expect(screen.getByText('Enable cluster MIDI?')).toBeInTheDocument()
    // Update has not been called yet (waiting on modal confirm).
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('writes both flags when modal confirms with auto-connect checked', async () => {
    mockSettings = { enabled: false, auto_connect: false }
    render(<MidiClusterEnableSection />)
    const toggle = document.querySelector('#midi-cluster-enabled') as HTMLInputElement
    fireEvent.click(toggle)
    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        enabled: true,
        auto_connect: true,
      })
    })
  })

  it('writes only enabled when operator unchecks the auto-connect box', async () => {
    mockSettings = { enabled: false, auto_connect: false }
    render(<MidiClusterEnableSection />)
    const toggle = document.querySelector('#midi-cluster-enabled') as HTMLInputElement
    fireEvent.click(toggle)
    fireEvent.click(screen.getByLabelText(/Also enable auto-connect/i))
    fireEvent.click(screen.getByText('Enable'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        enabled: true,
        auto_connect: false,
      })
    })
  })

  it('writes enabled=false directly on On → Off without opening the modal', async () => {
    mockSettings = { enabled: true, auto_connect: true }
    render(<MidiClusterEnableSection />)
    const toggle = document.querySelector('#midi-cluster-enabled') as HTMLInputElement
    fireEvent.click(toggle)

    // Modal mounts in the DOM but should not be in the visible state.
    const modal = document.querySelector('[data-testid="midi-cluster-enable-modal"]')
    expect(modal?.className ?? '').not.toContain('is-visible')
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ enabled: false })
    })
  })

  it('dismisses the advisory and persists the dismissal in sessionStorage', () => {
    mockSettings = { enabled: true, auto_connect: false }
    render(<MidiClusterEnableSection />)
    expect(screen.getByTestId('midi-cluster-advisory')).toBeInTheDocument()

    // Carbon's InlineNotification close button is the [aria-label="close notification"] element.
    const closeButton = document.querySelector(
      '[data-testid="midi-cluster-advisory"] button[aria-label="close notification"], [data-testid="midi-cluster-advisory"] [aria-label="close notification"]',
    ) as HTMLElement | null
    if (closeButton) {
      fireEvent.click(closeButton)
    }
    expect(window.sessionStorage.getItem('midi-cluster-auto-connect-off-advisory-dismissed')).toBe('1')
  })
})
