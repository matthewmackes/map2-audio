import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockMidiHubApi = {
  getLearnSuggestions: jest.fn(async () => ({
    ok: true,
    parameter_id: 'filter_cutoff',
    suggestions: [{ cc_number: 74, channel: 1, confidence: 0.92, reason: 'Brightness macro lane' }],
    plugin_context: {},
    split_suggestions: [],
  })),
  upsertMeshPeer: jest.fn(async () => ({ ok: true, peer: { peer_id: 'peer_a' } })),
  deleteMeshPeer: jest.fn(async () => ({ ok: true })),
  upsertDeviceShadow: jest.fn(async () => ({ device_id: 'usb_din_adapter:lab', drift_detected: true, drift: { health: ['offline', 'online'] } })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: new Proxy(mockMidiHubApi, {
    get(target, prop) {
      if (prop in target) return target[prop as keyof typeof target]
      return jest.fn(async () => ({ ok: true }))
    },
  }),
}))

jest.mock('./MidiHubAreaLayout', () => ({
  MidiHubAreaLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}))

jest.mock('../../components/MidiHub/MidiHubHelpPrimitives', () => ({
  MidiHubPanelShell: ({
    children,
    title,
  }: {
    children: React.ReactNode
    title?: React.ReactNode
  }) => (
    <section>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  ),
}))

jest.mock('../../components/MidiHub/AiLearnPanel', () => {
  const { midiHubApi } = require('../../../map2/api')
  const ReactLocal = require('react')
  return {
    AiLearnPanel: () => {
      const [confidence, setConfidence] = ReactLocal.useState('')
      return (
        <div>
          <button
            type="button"
            onClick={async () => {
              const payload = await midiHubApi.getLearnSuggestions({ parameter_id: 'filter_cutoff' }, null)
              setConfidence(`${Math.round(payload.suggestions[0].confidence * 100)}% confidence`)
            }}
          >
            Suggest mappings
          </button>
          {confidence ? <div>{confidence}</div> : null}
        </div>
      )
    },
  }
})

jest.mock('../../components/MidiHub/MeshNetworkPanel', () => {
  const { midiHubApi } = require('../../../map2/api')
  return {
    MeshNetworkPanel: () => (
      <div>
        <button type="button" onClick={() => midiHubApi.upsertMeshPeer({ peer_id: 'peer_a', base_url: 'http://127.0.0.1:8080' }, null)}>
          Save peer
        </button>
        <button type="button" onClick={() => midiHubApi.deleteMeshPeer('peer_a', null)}>
          Remove
        </button>
      </div>
    ),
  }
})

jest.mock('../../components/MidiHub/DeviceShadowPanel', () => {
  const { midiHubApi } = require('../../../map2/api')
  const ReactLocal = require('react')
  return {
    DeviceShadowPanel: () => {
      const [drift, setDrift] = ReactLocal.useState('')
      return (
        <div>
          <button
            type="button"
            onClick={async () => {
              const payload = await midiHubApi.upsertDeviceShadow('usb_din_adapter:lab', { expected_state: { health: 'online' } }, null)
              setDrift(payload.drift_detected ? 'Drift detected' : 'Stable')
            }}
          >
            Sync shadow
          </button>
          {drift ? <div>{drift}</div> : null}
        </div>
      )
    },
  }
})

const { MidiHubLabPage } = require('./MidiHubLabPage') as typeof import('./MidiHubLabPage')

describe('MidiHubLabPage', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        ;(value as jest.Mock).mockClear()
      }
    })
  })

  it('renders the lab route and exercises AI suggestions, mesh peer CRUD, and shadow drift display', async () => {
    render(<MidiHubLabPage />)

    expect(screen.getByRole('heading', { name: 'Lab' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest mappings' }))
    await waitFor(() => expect(mockMidiHubApi.getLearnSuggestions).toHaveBeenCalled())
    expect(await screen.findByText('92% confidence')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save peer' }))
    await waitFor(() => expect(mockMidiHubApi.upsertMeshPeer).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(mockMidiHubApi.deleteMeshPeer).toHaveBeenCalledWith('peer_a', null))

    fireEvent.click(screen.getByRole('button', { name: 'Sync shadow' }))
    await waitFor(() => expect(mockMidiHubApi.upsertDeviceShadow).toHaveBeenCalled())
    expect(await screen.findByText('Drift detected')).toBeTruthy()
  })
})
