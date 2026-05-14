import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschineStepSequencer } from './MaschineStepSequencer'

// T2522-C cycle 7 — step sequencer + scenes unit tests.

jest.mock('../../../map2/clients/maschine', () => {
  const empty = {
    status: 'ok',
    usb_serial: 'default-mk1',
    performance_patterns: { active_pattern_id: null, patterns: [] },
  }
  return {
    __esModule: true,
    maschineApi: {
      getPerformancePatterns: jest.fn(async () => empty),
      updatePerformancePatterns: jest.fn(async (bank) => ({
        status: 'ok',
        usb_serial: 'default-mk1',
        performance_patterns: bank,
      })),
    },
  }
})

const { maschineApi } = jest.requireMock('../../../map2/clients/maschine') as {
  maschineApi: {
    getPerformancePatterns: jest.Mock
    updatePerformancePatterns: jest.Mock
  }
}

beforeEach(() => {
  maschineApi.getPerformancePatterns.mockClear()
  maschineApi.updatePerformancePatterns.mockClear()
})

function renderSeq() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MaschineStepSequencer />
    </QueryClientProvider>,
  )
}

describe('MaschineStepSequencer', () => {
  it('fetches the bank on mount and shows the empty-state copy', async () => {
    renderSeq()
    await waitFor(() => expect(maschineApi.getPerformancePatterns).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/No pattern selected/)).toBeInTheDocument()
  })

  it('lets the operator add a pattern, edit a step, and Save it', async () => {
    renderSeq()
    fireEvent.click(await screen.findByRole('button', { name: '+ New pattern' }))
    expect(await screen.findByText(/Pattern p/)).toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    // Click pad-1 step-1 — should toggle empty → on.
    const step = screen.getByRole('button', { name: /Pad 1 step 1: empty/ })
    fireEvent.click(step)
    expect(await screen.findByRole('button', { name: /Pad 1 step 1: on/ })).toBeInTheDocument()
    // Save → updatePerformancePatterns called with the working bank.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(maschineApi.updatePerformancePatterns).toHaveBeenCalledTimes(1))
    const sentBank = maschineApi.updatePerformancePatterns.mock.calls[0][0]
    expect(sentBank.patterns).toHaveLength(1)
    expect(sentBank.patterns[0].steps[0][0]).toBe(1)
  })

  it('cycles a step: empty → on → accent → empty', async () => {
    renderSeq()
    fireEvent.click(await screen.findByRole('button', { name: '+ New pattern' }))
    const step = await screen.findByRole('button', { name: /Pad 2 step 3: empty/ })
    fireEvent.click(step)
    expect(await screen.findByRole('button', { name: /Pad 2 step 3: on/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pad 2 step 3: on/ }))
    expect(await screen.findByRole('button', { name: /Pad 2 step 3: accent/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pad 2 step 3: accent/ }))
    expect(await screen.findByRole('button', { name: /Pad 2 step 3: empty/ })).toBeInTheDocument()
  })

  it('binds a pattern to a scene slot, then recalls it via the scene strip', async () => {
    renderSeq()
    // Add a pattern, bind to scene B (slot 1).
    fireEvent.click(await screen.findByRole('button', { name: '+ New pattern' }))
    const slotSelect = await screen.findByLabelText('Scene slot')
    fireEvent.change(slotSelect, { target: { value: '1' } })
    // Scene B button should now be bound + clickable (not "empty").
    const sceneB = await screen.findByRole('button', {
      name: /Scene B — recall pattern "Pattern p/,
    })
    expect(sceneB).not.toBeDisabled()
    // Recall: should mark this pattern as active.
    fireEvent.click(sceneB)
    // Pattern dropdown shows the star marker on the active pattern.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set active' })).toBeDisabled()
    })
  })
})
