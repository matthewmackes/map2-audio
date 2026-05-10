/**
 * T2503 Set 10 — DawPage rendering smoke + verb-dispatch tests.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DawPage } from './DawPage'

// --- Mock the network surface ---

jest.mock('../../map2/clients/daw', () => {
  const status = {
    mode: 'live',
    state: 'running',
    daw_mode_available: true,
    last_error: null,
  }
  return {
    __esModule: true,
    dawApi: {
      getMode: jest.fn(async () => status),
      setMode: jest.fn(async (mode: string) => ({ ...status, mode })),
      play: jest.fn(async () => ({ accepted: true, verb: 'daw.transport.play' })),
      stop: jest.fn(async () => ({ accepted: true, verb: 'daw.transport.stop' })),
      setRecord: jest.fn(async () => ({ accepted: true, verb: 'daw.transport.record' })),
      setPosition: jest.fn(async () => ({
        accepted: true,
        verb: 'daw.transport.set_position',
      })),
      newProject: jest.fn(async () => ({ accepted: true, verb: 'daw.project.new' })),
      loadProject: jest.fn(async () => ({ accepted: true, verb: 'daw.project.load' })),
      saveProject: jest.fn(async () => ({ accepted: true, verb: 'daw.project.save' })),
      createTrack: jest.fn(async () => ({ accepted: true, verb: 'daw.track.create' })),
      deleteTrack: jest.fn(async () => ({ accepted: true, verb: 'daw.track.delete' })),
      setTrackArm: jest.fn(async () => ({ accepted: true, verb: 'daw.track.set_arm' })),
      addClip: jest.fn(async () => ({ accepted: true, verb: 'daw.clip.add' })),
      removeClip: jest.fn(async () => ({ accepted: true, verb: 'daw.clip.remove' })),
      moveClip: jest.fn(async () => ({ accepted: true, verb: 'daw.clip.move' })),
      setAutomationPoint: jest.fn(async () => ({
        accepted: true,
        verb: 'daw.automation.set_point',
      })),
      addPluginToTrack: jest.fn(async () => ({
        accepted: true,
        verb: 'daw.plugin.add_to_track',
      })),
      removePluginFromTrack: jest.fn(async () => ({
        accepted: true,
        verb: 'daw.plugin.remove_from_track',
      })),
      setPluginParam: jest.fn(async () => ({
        accepted: true,
        verb: 'daw.plugin.set_param',
      })),
    },
    openDawEventStream: jest.fn(() => ({ close: () => {} })),
  }
})

jest.mock('../../map2/clients/pluginInventory', () => ({
  __esModule: true,
  pluginInventoryApi: {
    list: jest.fn(async () => ({
      plugins: [
        {
          uri: 'map2:fx:nam',
          name: 'Neural Amp Modeler',
          vendor: 'MAP2',
          category: 'amp',
          format: 'native',
          audio_inputs: 1,
          audio_outputs: 1,
          is_instrument: false,
        },
        {
          uri: 'lv2://test/eg-amp',
          name: 'LV2 Example',
          vendor: 'LV2',
          category: 'amp',
          format: 'lv2',
          audio_inputs: 1,
          audio_outputs: 1,
          is_instrument: false,
        },
      ],
      last_scan_at: 1,
      size: 2,
    })),
    get: jest.fn(),
  },
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DawPage />
    </QueryClientProvider>,
  )
}

describe('DawPage', () => {
  it('renders the non-tier-1 banner', async () => {
    renderPage()
    expect(
      screen.getByText('Reference UI — control via MIDI surface'),
    ).toBeTruthy()
  })

  it('hydrates mode + state tags from /api/daw/mode', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('daw-mode-tag').textContent).toContain('live')
      expect(screen.getByTestId('daw-state-tag').textContent).toContain('running')
    })
  })

  it('Play button fires dawApi.play', async () => {
    const { dawApi } = require('../../map2/clients/daw')
    renderPage()
    await waitFor(() => screen.getByTestId('daw-mode-tag'))
    fireEvent.click(screen.getByTestId('daw-transport-play'))
    await waitFor(() => expect(dawApi.play).toHaveBeenCalled())
  })

  it('Add-track flow fires dawApi.createTrack', async () => {
    const { dawApi } = require('../../map2/clients/daw')
    renderPage()
    await waitFor(() => screen.getByTestId('daw-mode-tag'))
    fireEvent.click(screen.getByTestId('daw-create-track'))
    await waitFor(() => expect(dawApi.createTrack).toHaveBeenCalled())
  })

  it('Pad press fires dawApi.addClip', async () => {
    const { dawApi } = require('../../map2/clients/daw')
    renderPage()
    await waitFor(() => screen.getByTestId('daw-mode-tag'))
    fireEvent.click(screen.getByTestId('daw-clip-pad-0'))
    await waitFor(() => expect(dawApi.addClip).toHaveBeenCalled())
    const args = dawApi.addClip.mock.calls[0][0]
    expect(args.start_samples).toBe(0)
    expect(args.length_samples).toBe(96000)
  })

  it('Plugin rack lists inventory and Add fires verb', async () => {
    const { dawApi } = require('../../map2/clients/daw')
    renderPage()
    await waitFor(() =>
      expect(screen.queryByTestId('daw-plugin-inventory')).not.toBeNull(),
    )
    expect(screen.queryByText('Neural Amp Modeler')).not.toBeNull()
    fireEvent.click(screen.getByTestId('daw-plugin-add-map2:fx:nam'))
    await waitFor(() =>
      expect(dawApi.addPluginToTrack).toHaveBeenCalledWith(0, 'map2:fx:nam'),
    )
  })

  it('Automation Set-point fires verb with correct args', async () => {
    const { dawApi } = require('../../map2/clients/daw')
    renderPage()
    await waitFor(() => screen.getByTestId('daw-mode-tag'))
    fireEvent.click(screen.getByTestId('daw-auto-set'))
    await waitFor(() =>
      expect(dawApi.setAutomationPoint).toHaveBeenCalled(),
    )
  })
})

describe('DawPage — flag-OFF', () => {
  beforeEach(() => {
    const daw = require('../../map2/clients/daw')
    daw.dawApi.getMode.mockResolvedValueOnce({
      mode: 'live',
      state: 'running',
      daw_mode_available: false,
      last_error: null,
    })
  })

  it('shows the disabled banner when daw_mode_available=false', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.queryByText('DAW mode disabled')).not.toBeNull()
    })
  })
})
