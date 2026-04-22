import { render, screen, act, fireEvent } from '@testing-library/react'
import { GraphDocumentInspector } from './GraphDocumentInspector'
import type { StateAuthorityDocument } from '../../../map2/clients/stateAuthority'

jest.mock('../../../map2/clients/stateAuthority', () => ({
  stateAuthorityApi: {
    getLiveDocument: jest.fn(),
    getSnapshotDocument: jest.fn(),
  },
}))

const { stateAuthorityApi } = jest.requireMock('../../../map2/clients/stateAuthority') as {
  stateAuthorityApi: {
    getLiveDocument: jest.Mock
    getSnapshotDocument: jest.Mock
  }
}

const BASE_DOC: StateAuthorityDocument = {
  snapshot_id: 42,
  snapshot_name: 'Live Tone',
  is_live: true,
  document: {
    version: '2026.04',
    meta: { name: 'Live Tone', type: 'snapshot' },
    graph: {
      nodes: [
        { id: 'n1', uri: 'map2:fx:nam' },
        { id: 'n2', uri: 'map2:fx:reverb-ir' },
      ],
      edges: [{ from: 'n1:audio_out_0', to: 'n2:audio_in_0' }],
      morph: { mode: 'quad', position: { x: 0.5, y: 0.5 } },
      channels: [{ key: 'A' }],
    },
  },
}

describe('GraphDocumentInspector', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    stateAuthorityApi.getLiveDocument.mockResolvedValue(BASE_DOC)
    stateAuthorityApi.getSnapshotDocument.mockResolvedValue({
      ...BASE_DOC,
      snapshot_id: 101,
      snapshot_name: 'Archived',
      is_live: false,
    })
  })

  it('fetches the live document on mount when no snapshot id is provided', async () => {
    await act(async () => {
      render(<GraphDocumentInspector />)
    })
    expect(stateAuthorityApi.getLiveDocument).toHaveBeenCalledTimes(1)
    expect(stateAuthorityApi.getSnapshotDocument).not.toHaveBeenCalled()
  })

  it('renders snapshot name + LIVE tag when is_live is true', async () => {
    await act(async () => {
      render(<GraphDocumentInspector />)
    })
    expect(screen.getByText('Live Tone')).toBeTruthy()
    expect(screen.getByText('LIVE')).toBeTruthy()
  })

  it('renders summary metrics derived from the document', async () => {
    const { container } = await act(async () => {
      return render(<GraphDocumentInspector />)
    })
    // Per-metric scoping — each metric has a label + value pair in a div
    const metricDivs = container.querySelectorAll('.graph-doc-inspector__summary-grid > div')
    expect(metricDivs.length).toBe(4)
    const byLabel: Record<string, string> = {}
    metricDivs.forEach((div) => {
      const label = div.querySelector('.graph-doc-inspector__metric-label')?.textContent ?? ''
      const value = div.querySelector('.graph-doc-inspector__metric-value')?.textContent ?? ''
      byLabel[label] = value
    })
    expect(byLabel.Nodes).toBe('2')
    expect(byLabel.Edges).toBe('1')
    expect(byLabel.Channels).toBe('1')
    expect(byLabel.Morph).toBe('quad')
    expect(screen.getByText('v2026.04')).toBeTruthy()
  })

  it('renders raw JSON body with all graph sections', async () => {
    await act(async () => {
      render(<GraphDocumentInspector />)
    })
    const pre = screen.getByLabelText('Raw graph document JSON')
    expect(pre.textContent).toContain('"version": "2026.04"')
    expect(pre.textContent).toContain('"map2:fx:nam"')
    expect(pre.textContent).toContain('"mode": "quad"')
  })

  it('uses the snapshot-by-id endpoint when snapshotId prop is set', async () => {
    await act(async () => {
      render(<GraphDocumentInspector snapshotId={101} />)
    })
    expect(stateAuthorityApi.getSnapshotDocument).toHaveBeenCalledWith(101)
    expect(stateAuthorityApi.getLiveDocument).not.toHaveBeenCalled()
    expect(screen.getByText('archived')).toBeTruthy()
  })

  it('renders injected document prop without fetching', async () => {
    render(<GraphDocumentInspector document={BASE_DOC} />)
    expect(stateAuthorityApi.getLiveDocument).not.toHaveBeenCalled()
    expect(stateAuthorityApi.getSnapshotDocument).not.toHaveBeenCalled()
    expect(screen.getByText('Live Tone')).toBeTruthy()
  })

  it('surfaces fetch errors via InlineNotification', async () => {
    stateAuthorityApi.getLiveDocument.mockRejectedValueOnce(new Error('boom'))
    await act(async () => {
      render(<GraphDocumentInspector />)
    })
    expect(screen.getByText('Failed to load document')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('refreshes on Refresh button click', async () => {
    await act(async () => {
      render(<GraphDocumentInspector />)
    })
    expect(stateAuthorityApi.getLiveDocument).toHaveBeenCalledTimes(1)
    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    await act(async () => {
      fireEvent.click(refreshButton)
    })
    expect(stateAuthorityApi.getLiveDocument).toHaveBeenCalledTimes(2)
  })
})
