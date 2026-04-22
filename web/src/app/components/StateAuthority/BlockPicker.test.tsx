import { render, screen, fireEvent, act } from '@testing-library/react'
import { BlockPicker } from './BlockPicker'
import type { StateAuthorityCatalogEntry } from '../../../map2/clients/stateAuthority'

jest.mock('../../../map2/clients/stateAuthority', () => ({
  stateAuthorityApi: {
    getCatalog: jest.fn(async () => ({
      entries: SAMPLE_ENTRIES,
      count: SAMPLE_ENTRIES.length,
    })),
  },
}))

const { stateAuthorityApi } = jest.requireMock('../../../map2/clients/stateAuthority') as {
  stateAuthorityApi: { getCatalog: jest.Mock }
}

const SAMPLE_ENTRIES: StateAuthorityCatalogEntry[] = [
  {
    uri: 'map2:fx:nam',
    type: 'fx',
    name: 'nam',
    label: 'Neural Amp Modeler',
    description: 'Amp model loader',
    category: 'amp',
    default_parameters: { gain: 0.7 },
    default_state: {},
    aliases: ['map2://juce/nam'],
    is_system_managed: false,
  },
  {
    uri: 'map2:fx:reverb-ir',
    type: 'fx',
    name: 'reverb-ir',
    label: 'Reverb IR',
    description: 'Convolution reverb',
    category: 'reverb',
    default_parameters: { mix: 0.4 },
    default_state: {},
    aliases: [],
    is_system_managed: false,
  },
  {
    uri: 'map2:sys:output-limiter',
    type: 'sys',
    name: 'output-limiter',
    label: 'Output Limiter',
    description: 'Auto-injected',
    category: 'safety',
    default_parameters: {},
    default_state: {},
    aliases: [],
    is_system_managed: true,
  },
  {
    uri: 'map2:ctrl:morph',
    type: 'ctrl',
    name: 'morph',
    label: 'Morph Pad',
    description: 'A/B/C/D morph XY control',
    category: 'morph',
    default_parameters: {},
    default_state: {},
    aliases: [],
    is_system_managed: false,
  },
]

describe('BlockPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches the catalog on mount and renders tiles', async () => {
    await act(async () => {
      render(<BlockPicker />)
    })
    expect(stateAuthorityApi.getCatalog).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Neural Amp Modeler')).toBeTruthy()
    expect(screen.getByText('Reverb IR')).toBeTruthy()
    expect(screen.getByText('Morph Pad')).toBeTruthy()
  })

  it('hides system-managed blocks by default', async () => {
    await act(async () => {
      render(<BlockPicker />)
    })
    expect(screen.queryByText('Output Limiter')).toBeNull()
  })

  it('shows system-managed blocks when hideSystemManaged is false', async () => {
    await act(async () => {
      render(<BlockPicker hideSystemManaged={false} />)
    })
    expect(screen.getByText('Output Limiter')).toBeTruthy()
  })

  it('filters by URI substring via the search input', async () => {
    await act(async () => {
      render(<BlockPicker entries={SAMPLE_ENTRIES.filter((e) => !e.is_system_managed)} />)
    })
    const input = screen.getByPlaceholderText(/Search by name, category, or URI/i)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'nam' } })
    })
    expect(screen.getByText('Neural Amp Modeler')).toBeTruthy()
    expect(screen.queryByText('Reverb IR')).toBeNull()
  })

  it('emits onPick with the selected catalog entry', async () => {
    const onPick = jest.fn()
    await act(async () => {
      render(<BlockPicker entries={SAMPLE_ENTRIES} onPick={onPick} />)
    })
    const tile = screen.getByText('Neural Amp Modeler').closest('[class*="cds--tile"]')
    expect(tile).toBeTruthy()
    await act(async () => {
      fireEvent.click(tile as Element)
    })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].uri).toBe('map2:fx:nam')
  })

  it('shows empty state when filter matches nothing', async () => {
    await act(async () => {
      render(<BlockPicker entries={SAMPLE_ENTRIES} />)
    })
    const input = screen.getByPlaceholderText(/Search by name, category, or URI/i)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'xyzzy-nope' } })
    })
    expect(screen.getByText(/No blocks match your filter/i)).toBeTruthy()
  })

  it('renders alias count on tiles that have aliases', async () => {
    await act(async () => {
      render(<BlockPicker entries={SAMPLE_ENTRIES} />)
    })
    expect(screen.getByText('1 alias')).toBeTruthy()
  })
})
