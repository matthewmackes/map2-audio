import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockNAMGetStatus = jest.fn()
const mockNAMGetInstanceStatus = jest.fn()
const mockNAMGetStatusAtPosition = jest.fn()
const mockNAMLoadModelToInstance = jest.fn()
const mockNAMLoadModelAtPosition = jest.fn()
const mockIRGetTypeStatus = jest.fn()
const mockListCabinets = jest.fn()
const mockListReverbs = jest.fn()
const mockIRLoadCabinetToInstance = jest.fn()
const mockIRLoadReverbToInstance = jest.fn()
const mockIRLoadCabinetAtPosition = jest.fn()
const mockIRLoadReverbAtPosition = jest.fn()

jest.mock('../../../../../map2/api', () => ({
  namApi: {
    getStatus: (...args: unknown[]) => mockNAMGetStatus(...args),
    getInstanceStatus: (...args: unknown[]) => mockNAMGetInstanceStatus(...args),
    getStatusAtPosition: (...args: unknown[]) => mockNAMGetStatusAtPosition(...args),
    loadModelToInstance: (...args: unknown[]) => mockNAMLoadModelToInstance(...args),
    loadModelAtPosition: (...args: unknown[]) => mockNAMLoadModelAtPosition(...args),
  },
  irApi: {
    getTypeStatus: (...args: unknown[]) => mockIRGetTypeStatus(...args),
    listCabinets: (...args: unknown[]) => mockListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockListReverbs(...args),
    loadCabinetToInstance: (...args: unknown[]) => mockIRLoadCabinetToInstance(...args),
    loadReverbToInstance: (...args: unknown[]) => mockIRLoadReverbToInstance(...args),
    loadCabinetAtPosition: (...args: unknown[]) => mockIRLoadCabinetAtPosition(...args),
    loadReverbAtPosition: (...args: unknown[]) => mockIRLoadReverbAtPosition(...args),
  },
}))

import { NAMCard } from './NAMCard'
import { CabinetIRCard } from './CabinetIRCard'
import { ReverbIRCard } from './ReverbIRCard'
import { getPluginIdentityKeyFromParts } from '../../../../../map2/utils/pluginIdentity'

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../Base/CarbonCardShell', () => ({
  CarbonCardShell: ({ plugin, visualization, children, footer }: any) => (
    <section aria-label={`${plugin.name} shell`}>
      <div>{visualization}</div>
      <div>{children}</div>
      <footer>{footer}</footer>
    </section>
  ),
}))

jest.mock('../../Base/CarbonParameterSection', () => ({
  CarbonParameterSection: ({ title, children }: any) => (
    <section aria-label={title}>
      <h4>{title}</h4>
      {children}
    </section>
  ),
}))

jest.mock('../../Base/CarbonMeteringFooter', () => ({
  CarbonMeteringFooter: () => <div>Metering footer</div>,
}))

jest.mock('../../../Controls/ParameterKnob', () => ({
  ParameterKnob: ({ label }: any) => <div>{label}</div>,
}))

jest.mock('../../Visualizations/ReverbDecayCurve', () => ({
  ReverbDecayCurve: () => <div>Reverb decay</div>,
}))

jest.mock('../../../loaders/NAMManagerDialog', () => ({
  NAMManagerDialog: ({ open }: { open: boolean }) => (open ? <div>NAM manager open</div> : null),
}))

jest.mock('../../../loaders/CabinetIRManagerDialog', () => ({
  CabinetIRManagerDialog: ({ open }: { open: boolean }) => (open ? <div>Cabinet IR manager open</div> : null),
}))

jest.mock('../../../loaders/ReverbIRManagerDialog', () => ({
  ReverbIRManagerDialog: ({ open }: { open: boolean }) => (open ? <div>Reverb IR manager open</div> : null),
}))

const mockPushToast = jest.fn()

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function makePlugin(name: string, category: string) {
  return {
    uri: `map2://juce/${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    author: 'MAP2',
    category,
    class_label: category,
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
  }
}

function makeInstancePlugin(name: string, category: string, instanceId: number) {
  return {
    ...makePlugin(name, category),
    instance_id: instanceId,
  }
}

function renderCard(ui: React.ReactElement) {
  const queryClient = makeClient()
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>,
    ),
  }
}

describe('JUCE asset selector cards', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockNAMGetStatus.mockReset()
    mockNAMGetInstanceStatus.mockReset()
    mockNAMGetStatusAtPosition.mockReset()
    mockNAMLoadModelToInstance.mockReset()
    mockNAMLoadModelAtPosition.mockReset()
    mockIRGetTypeStatus.mockReset()
    mockListCabinets.mockReset()
    mockListReverbs.mockReset()
    mockIRLoadCabinetToInstance.mockReset()
    mockIRLoadReverbToInstance.mockReset()
    mockIRLoadCabinetAtPosition.mockReset()
    mockIRLoadReverbAtPosition.mockReset()

    mockNAMGetStatus.mockResolvedValue({
      available: true,
      activeModel: 'Edge Crunch',
      loading: false,
      bypass: false,
      inputLevel: -12,
      outputLevel: -9,
      input_gain: 0,
      output_gain: 0,
      normalize: false,
      availableModels: ['Edge Crunch', 'Clean Chime'],
      mix: 100,
      peakInput: -12,
      peakOutput: -9,
      latency: 0,
    })
    mockIRGetTypeStatus.mockImplementation(async (type: string) => {
      if (type === 'cabinet') {
        return {
          available: true,
          loaded: 'Vintage 4x12',
          mix: 100,
          bypass: false,
          availableIRs: [{ name: 'Vintage 4x12', size: '512 KB', length: 1024 }],
        }
      }
      return {
        available: true,
        loaded: 'Studio Room',
        mix: 30,
        bypass: false,
        currentDecay: 2400,
        availableIRs: [{ name: 'Studio Room', size: '1.23 MB', length: 2048 }],
      }
    })
    mockListCabinets.mockResolvedValue({
      irs: [{ name: 'Vintage 4x12', size: 524288 }],
    })
    mockListReverbs.mockResolvedValue({
      irs: [{ name: 'Studio Room', size: 1289748 }],
    })
    mockNAMGetInstanceStatus.mockResolvedValue({
      available: true,
      activeModel: 'Instance Crunch',
      loading: false,
      bypass: false,
      inputLevel: -10,
      outputLevel: -8,
      input_gain: 1,
      output_gain: -1,
      normalize: true,
      availableModels: ['Instance Crunch'],
      mix: 100,
      peakInput: -10,
      peakOutput: -8,
      latency: 0,
    })
    mockNAMGetStatusAtPosition.mockResolvedValue({
      available: true,
      activeModel: 'Position Crunch',
      loading: false,
      bypass: false,
      inputLevel: -11,
      outputLevel: -7,
      input_gain: 2,
      output_gain: -2,
      normalize: true,
      availableModels: ['Position Crunch'],
      mix: 100,
      peakInput: -11,
      peakOutput: -7,
      latency: 0,
    })
    mockNAMLoadModelToInstance.mockResolvedValue({ status: 'ok' })
    mockNAMLoadModelAtPosition.mockResolvedValue({ status: 'ok' })
    mockIRLoadCabinetToInstance.mockResolvedValue({ status: 'ok' })
    mockIRLoadReverbToInstance.mockResolvedValue({ status: 'ok' })
    mockIRLoadCabinetAtPosition.mockResolvedValue({ status: 'ok' })
    mockIRLoadReverbAtPosition.mockResolvedValue({ status: 'ok' })

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/nam/upload') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            model: {
              name: 'Uploaded NAM',
            },
          }),
        } as Response
      }

      if (url === '/api/nam/models/Uploaded%20NAM/load') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ok' }),
        } as Response
      }

      if (url === '/api/ir/cabinets/upload') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            filename: 'Uploaded Cabinet.wav',
          }),
        } as Response
      }

      if (url === '/api/ir/cabinets/Uploaded%20Cabinet.wav/load') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ok' }),
        } as Response
      }

      if (url === '/api/ir/reverbs/upload') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            filename: 'Uploaded Reverb.wav',
          }),
        } as Response
      }

      if (url === '/api/ir/reverbs/Uploaded%20Reverb.wav/load') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ok' }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as jest.MockedFunction<typeof fetch>
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.resetAllMocks()
  })

  it('opens the shared NAM manager from the in-card Select action', async () => {
    renderCard(
      <NAMCard
        plugin={makePlugin('NAM', 'Amplifier')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#ff6b6b"
      />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Library' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByText('NAM manager open')).toBeInTheDocument()
  })

  it('opens the shared cabinet IR manager from the Select action', async () => {
    renderCard(
      <CabinetIRCard
        plugin={makePlugin('Cabinet IR', 'Convolution')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#f97316"
      />,
    )

    await waitFor(() => expect(screen.getByText('Vintage 4x12')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByText('Cabinet IR manager open')).toBeInTheDocument()
  })

  it('opens the shared reverb IR manager from the Select action', async () => {
    renderCard(
      <ReverbIRCard
        plugin={makePlugin('Reverb IR', 'Convolution')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#a855f7"
      />,
    )

    await waitFor(() => expect(screen.getByText('Studio Room')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    expect(screen.getByText('Reverb IR manager open')).toBeInTheDocument()
  })

  it('uploads a NAM model directly from the selected-block card', async () => {
    renderCard(
      <NAMCard
        plugin={makePlugin('NAM', 'Amplifier')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#ff6b6b"
      />,
    )

    await waitFor(() => expect(screen.getByLabelText('Upload NAM model to selected block')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Upload NAM model to selected block'), {
      target: {
        files: [new File(['nam-data'], 'direct-upload.nam', { type: 'application/octet-stream' })],
      },
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/nam/upload', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/nam/models/Uploaded%20NAM/load', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('uploads a cabinet IR directly from the selected-block card', async () => {
    renderCard(
      <CabinetIRCard
        plugin={makePlugin('Cabinet IR', 'Convolution')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#f97316"
      />,
    )

    await waitFor(() => expect(screen.getByLabelText('Upload cabinet IR to selected block')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Upload cabinet IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'direct-cab.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ir/cabinets/upload', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ir/cabinets/Uploaded%20Cabinet.wav/load', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('uploads a reverb IR directly from the selected-block card', async () => {
    renderCard(
      <ReverbIRCard
        plugin={makePlugin('Reverb IR', 'Convolution')}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#a855f7"
      />,
    )

    await waitFor(() => expect(screen.getByLabelText('Upload reverb IR to selected block')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Upload reverb IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'direct-reverb.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ir/reverbs/upload', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/ir/reverbs/Uploaded%20Reverb.wav/load', expect.objectContaining({ method: 'POST' }))
    })
  })

  it('uses instance-scoped load APIs for NAM and IR cards when instance ids are present', async () => {
    renderCard(
      <>
        <NAMCard
          plugin={makeInstancePlugin('NAM', 'Amplifier', 101)}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#ff6b6b"
        />
        <CabinetIRCard
          plugin={makeInstancePlugin('Cabinet IR', 'Convolution', 202)}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#f97316"
        />
        <ReverbIRCard
          plugin={makeInstancePlugin('Reverb IR', 'Convolution', 303)}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#a855f7"
        />
      </>,
    )

    await waitFor(() => {
      expect(mockNAMGetInstanceStatus).toHaveBeenCalledWith(101)
      expect(mockIRGetTypeStatus).toHaveBeenCalledWith('cabinet', { instanceId: 202 })
      expect(mockIRGetTypeStatus).toHaveBeenCalledWith('reverb', { instanceId: 303 })
    })

    fireEvent.change(screen.getByLabelText('Upload NAM model to selected block'), {
      target: {
        files: [new File(['nam-data'], 'instance-upload.nam', { type: 'application/octet-stream' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload cabinet IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'instance-cab.wav', { type: 'audio/wav' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload reverb IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'instance-reverb.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(mockNAMLoadModelToInstance).toHaveBeenCalledWith('Uploaded NAM', 101)
      expect(mockIRLoadCabinetToInstance).toHaveBeenCalledWith('Uploaded Cabinet.wav', 202)
      expect(mockIRLoadReverbToInstance).toHaveBeenCalledWith('Uploaded Reverb.wav', 303)
    })
  })

  it('uses position-scoped load APIs for NAM and IR cards when plugin positions are present without instance ids', async () => {
    renderCard(
      <>
        <NAMCard
          plugin={makePlugin('NAM', 'Amplifier')}
          pluginPosition={4}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#ff6b6b"
        />
        <CabinetIRCard
          plugin={makePlugin('Cabinet IR', 'Convolution')}
          pluginPosition={5}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#f97316"
        />
        <ReverbIRCard
          plugin={makePlugin('Reverb IR', 'Convolution')}
          pluginPosition={6}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#a855f7"
        />
      </>,
    )

    await waitFor(() => {
      expect(mockNAMGetStatusAtPosition).toHaveBeenCalledWith(4)
      expect(mockIRGetTypeStatus).toHaveBeenCalledWith('cabinet', { instanceId: undefined, pluginPosition: 5 })
      expect(mockIRGetTypeStatus).toHaveBeenCalledWith('reverb', { instanceId: undefined, pluginPosition: 6 })
    })

    fireEvent.change(screen.getByLabelText('Upload NAM model to selected block'), {
      target: {
        files: [new File(['nam-data'], 'position-upload.nam', { type: 'application/octet-stream' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload cabinet IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'position-cab.wav', { type: 'audio/wav' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload reverb IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'position-reverb.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(mockNAMLoadModelAtPosition).toHaveBeenCalledWith('Uploaded NAM', 4)
      expect(mockIRLoadCabinetAtPosition).toHaveBeenCalledWith('Uploaded Cabinet.wav', 5)
      expect(mockIRLoadReverbAtPosition).toHaveBeenCalledWith('Uploaded Reverb.wav', 6)
    })
  })

  it('invalidates only the scoped status and list queries after selected-block asset uploads', async () => {
    const { queryClient } = renderCard(
      <>
        <NAMCard
          plugin={makePlugin('NAM', 'Amplifier')}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#ff6b6b"
        />
        <CabinetIRCard
          plugin={makePlugin('Cabinet IR', 'Convolution')}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#f97316"
        />
        <ReverbIRCard
          plugin={makePlugin('Reverb IR', 'Convolution')}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#a855f7"
        />
      </>,
    )
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const namStatusScopeKey = getPluginIdentityKeyFromParts('map2://juce/nam')
    const cabinetStatusScopeKey = getPluginIdentityKeyFromParts('map2://juce/convolution/cabinet')
    const reverbStatusScopeKey = getPluginIdentityKeyFromParts('map2://juce/convolution/reverb')

    await waitFor(() => expect(screen.getByLabelText('Upload NAM model to selected block')).toBeInTheDocument())
    invalidateSpy.mockClear()

    fireEvent.change(screen.getByLabelText('Upload NAM model to selected block'), {
      target: {
        files: [new File(['nam-data'], 'scoped-upload.nam', { type: 'application/octet-stream' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload cabinet IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'scoped-cab.wav', { type: 'audio/wav' })],
      },
    })
    fireEvent.change(screen.getByLabelText('Upload reverb IR to selected block'), {
      target: {
        files: [new File(['wave-data'], 'scoped-reverb.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['nam', 'models'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['nam', 'status', namStatusScopeKey] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ir', 'cabinet', 'list'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ir', 'status', 'cabinet', cabinetStatusScopeKey] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ir', 'reverb', 'list'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ir', 'status', 'reverb', reverbStatusScopeKey] })
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['nam'] })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['ir'] })
  })
})
