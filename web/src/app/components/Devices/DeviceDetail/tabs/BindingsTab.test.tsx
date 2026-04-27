import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

const mockPostBindings = jest.fn()
const mockUndoBindings = jest.fn()

jest.mock('../../../../../map2/clients/devices', () => ({
  __esModule: true,
  postBindings: (...args: unknown[]) => mockPostBindings(...args),
  undoBindings: (...args: unknown[]) => mockUndoBindings(...args),
}))

const mockPushToast = jest.fn(() => 'toast-id')
const mockDismissToast = jest.fn()

jest.mock('../../../Toasts', () => ({
  __esModule: true,
  useToasts: () => ({ pushToast: mockPushToast, dismissToast: mockDismissToast }),
  useNotifications: () => ({
    pushNotification: mockPushToast, dismissNotification: mockDismissToast,
  }),
}))

import { BindingsTab } from './BindingsTab'
import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'

function makeMidi(): DeviceProfileDetail {
  return {
    pack_id: 'edirol-ua', model: 'ua-1000', kind: 'midi',
    path: '/repo/x.yaml', hardware_id: 'usb:0582:00ed',
    document: {
      controls: [
        { status: 0xB0, midino: 7, channel: 1, target: 'audio.master.volume', action: 'set' },
      ],
      outputs: [],
    } as Record<string, unknown>,
  }
}

function renderTab(profile = makeMidi()) {
  return render(
    <MemoryRouter>
      <BindingsTab profile={profile} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  mockPostBindings.mockReset()
  mockUndoBindings.mockReset()
  mockPushToast.mockReset()
})

test('BindingsTab: audio profile renders the not-applicable banner', () => {
  renderTab({
    pack_id: 'edirol-ua', model: 'ua-1000', kind: 'audio',
    path: '/x', hardware_id: 'usb:0582:00ed',
    document: {} as Record<string, unknown>,
  })
  expect(screen.getByText('No bindings on audio profiles')).toBeInTheDocument()
})

test('BindingsTab: midi profile renders Open Learn Wizard + Save buttons + initial control row', () => {
  renderTab()
  expect(screen.getByRole('button', { name: 'Open Learn Wizard' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add row' })).toBeInTheDocument()
  // Save starts disabled (no dirty state) and shows the heading text.
  expect(screen.getByRole('button', { name: 'Save bindings' })).toBeDisabled()
  // The initial row's target value renders.
  expect(screen.getByDisplayValue('audio.master.volume')).toBeInTheDocument()
})

test('BindingsTab: editing a cell flips dirty + Save calls postBindings', async () => {
  mockPostBindings.mockResolvedValue({
    revision: 'rev-abcd1234', undo_token: 'tok-1',
    profile_key: 'edirol-ua/ua-1000', bytes_written: 256,
  })

  renderTab()
  const targetInput = screen.getByDisplayValue('audio.master.volume')
  fireEvent.change(targetInput, { target: { value: 'audio.chain.1.volume' } })

  await waitFor(() => {
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  const save = screen.getByRole('button', { name: 'Save bindings' })
  expect(save).not.toBeDisabled()
  fireEvent.click(save)

  await waitFor(() => {
    expect(mockPostBindings).toHaveBeenCalledTimes(1)
  })
  const args = mockPostBindings.mock.calls[0]
  expect(args[0]).toBe('edirol-ua')
  expect(args[1]).toBe('ua-1000')
  expect(args[2]).toBe('midi')
  expect(args[3].controls[0].target).toBe('audio.chain.1.volume')
})

test('BindingsTab: Save success shows the revision tag + dispatches Undo toast', async () => {
  mockPostBindings.mockResolvedValue({
    revision: 'rev-abcd1234', undo_token: 'tok-1',
    profile_key: 'edirol-ua/ua-1000', bytes_written: 128,
  })

  renderTab()
  // Make a change to enable Save.
  const targetInput = screen.getByDisplayValue('audio.master.volume')
  fireEvent.change(targetInput, { target: { value: 'audio.chain.1.volume' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save bindings' }))

  await waitFor(() => {
    expect(screen.getByText(/Revision rev-abcd/)).toBeInTheDocument()
  })
  // useUndoToast routes through pushToast with action.
  await waitFor(() => {
    const found = mockPushToast.mock.calls.some(
      (c) => typeof c[0] === 'string' && c[0].includes('Saved bindings'),
    )
    expect(found).toBe(true)
  })
})

test('BindingsTab: Save failure surfaces the InlineNotification', async () => {
  mockPostBindings.mockRejectedValue(new Error('schema validation failed'))

  renderTab()
  const targetInput = screen.getByDisplayValue('audio.master.volume')
  fireEvent.change(targetInput, { target: { value: 'audio.chain.1.volume' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save bindings' }))

  await waitFor(() => {
    expect(screen.getByText('Could not save bindings')).toBeInTheDocument()
  })
  expect(screen.getByText(/schema validation failed/)).toBeInTheDocument()
})

test('BindingsTab: Add row appends a blank row + Remove pops it', async () => {
  renderTab()
  // Initial: 1 row → status input has value "176" (0xB0).
  // After Add row: 2 rows.
  fireEvent.click(screen.getByRole('button', { name: 'Add row' }))
  await waitFor(() => {
    // Check the heading reflects the new count.
    expect(screen.getByText(/Controls \(2\)/)).toBeInTheDocument()
  })

  // Remove the first row.
  const removeButtons = screen.getAllByRole('button', { name: /Remove/ })
  fireEvent.click(removeButtons[0])
  await waitFor(() => {
    expect(screen.getByText(/Controls \(1\)/)).toBeInTheDocument()
  })
})
