import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NAMCard } from './NAMCard'
import { CabinetIRCard } from './CabinetIRCard'
import { ReverbIRCard } from './ReverbIRCard'

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

function renderCard(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>
      {ui}
    </QueryClientProvider>,
  )
}

describe('JUCE asset selector cards', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === '/api/nam/status') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            available: true,
            activeModel: 'Edge Crunch',
            loading: false,
            bypass: false,
            inputLevel: -12,
            outputLevel: -9,
            inputGain: 0,
            outputGain: 0,
            normalize: false,
            availableModels: ['Edge Crunch', 'Clean Chime'],
          }),
        } as Response
      }

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

      if (url === '/api/ir/status?type=cabinet') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            loaded: 'Vintage 4x12',
            mix: 100,
            bypass: false,
            availableIRs: [{ name: 'Vintage 4x12', size: '512 KB', length: 1024 }],
          }),
        } as Response
      }

      if (url === '/api/ir/cabinets') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            cabinets: [{ name: 'Vintage 4x12', size: '512 KB' }],
          }),
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

      if (url === '/api/ir/status?type=reverb') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            loaded: 'Studio Room',
            mix: 30,
            bypass: false,
            decayTime: 2.4,
            availableIRs: [{ name: 'Studio Room', size: '1.23 MB', length: 2048 }],
          }),
        } as Response
      }

      if (url === '/api/ir/reverbs') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            irs: [{ name: 'Studio Room', size_mb: 1.23 }],
          }),
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
})
