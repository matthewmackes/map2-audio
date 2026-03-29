import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import type { JuceGridLiveChainProjection } from '../SnapshotEditor/snapshotEditorLiveChains'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverMock,
  writable: true,
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
    writable: true,
  })
}

const { LiveRuntimePathsModal } = require('./LiveRuntimePathsModal') as typeof import('./LiveRuntimePathsModal')

const buildProjection = (overrides: Partial<JuceGridLiveChainProjection> = {}): JuceGridLiveChainProjection => ({
  chainId: 1,
  chainName: 'Main Runtime',
  status: 'live',
  runtimeStatus: 'active',
  flowLabels: ['A'],
  primaryFlowLabel: 'A',
  syntheticFlow: false,
  warningText: null,
  representativeItems: [
    {
      id: 'plugin-1',
      kind: 'plugin',
      label: 'Reverb',
      iconHint: 'reverb',
      dimmed: false,
    },
  ],
  ...overrides,
})

describe('LiveRuntimePathsModal', () => {
  it('renders the live path inventory and mismatch actions', async () => {
    const onClose = jest.fn()
    const onUpdateLive = jest.fn()
    const onRevertToLive = jest.fn()

    render(
      <LiveRuntimePathsModal
        open
        onClose={onClose}
        projections={[buildProjection()]}
        mismatch
        onUpdateLive={onUpdateLive}
        onRevertToLive={onRevertToLive}
      />,
    )

    expect(await screen.findByRole('dialog', { name: 'Backend truth' })).toBeInTheDocument()
    expect(screen.getByText('Main Runtime')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Update Live' }))
    expect(onUpdateLive).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Revert Workspace' }))
    expect(onRevertToLive).toHaveBeenCalled()
  })

  it('renders the empty backend-truth state', async () => {
    render(
      <LiveRuntimePathsModal
        open
        onClose={jest.fn()}
        projections={[]}
      />,
    )

    expect(await screen.findByText('No backend-live paths currently reported.')).toBeInTheDocument()
  })
})
