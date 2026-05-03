import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

const mockUseDeviceLocation = jest.fn()
const mockGroundControlProApi = {
  getPorts: jest.fn(),
  getFieldMap: jest.fn(),
  importDump: jest.fn(),
  getSession: jest.fn(),
  compileSession: jest.fn(),
  exportJson: jest.fn(),
  exportYaml: jest.fn(),
  backup: jest.fn(),
  push: jest.fn(),
  redumpVerify: jest.fn(),
  diff: jest.fn(),
  getJob: jest.fn(),
  getArtifact: jest.fn(),
}

function buildModel() {
  return {
    profile_id: 'v1_13_bulk_dump',
    global_config: {
      devices: Array.from({ length: 8 }, (_, index) => ({
        name: `DEV${index + 1}`,
        midi_channel: index + 1,
        program_offset_mode: index % 2,
        definition_raw: index,
        confidence: 'inferred',
      })),
      pedals: Array.from({ length: 2 }, () => ({ exists: 1, confidence: 'inferred' })),
      gcx: {
        num_gcx: 2,
        vca_exists: 1,
        switch_types: Array.from({ length: 32 }, (_, index) => index % 2),
        confidence: 'inferred',
      },
      midi: {
        soft_options_raw: 0,
        global_program: true,
        link_mode: 1,
        respond_to_program_change: true,
        program_change_receive_channel: 8,
        confidence: 'confirmed',
      },
      instant_access: Array.from({ length: 8 }, (_, index) => ({
        function: index,
        detail: index,
        transmit_cc: index % 2,
        switch_type: index % 2,
        confidence: 'inferred',
      })),
      utility: {
        directory_speed: 3,
        program_access_mode: 1,
        extended_memory_raw: 2,
        confidence: 'inferred',
      },
    },
    presets: Array.from({ length: 200 }, (_, presetIndex) => ({
      index: presetIndex,
      name: `P${String(presetIndex).padStart(3, '0')}`,
      device_program_changes: Array.from({ length: 8 }, (_, deviceIndex) => ({
        enabled: (presetIndex + deviceIndex) % 2,
        program: (presetIndex + deviceIndex) % 128,
        confidence: 'inferred',
      })),
      device_program_banks_raw: Array.from({ length: 8 }, (_, index) => index),
      pedal_definitions: [0, 1],
      pedal_device_assignments: [1, 2],
      gcx_loop_states: Array.from({ length: 32 }, (_, index) => index % 2),
      gcx_toggles: [0, 1, 0, 1],
      instant_access_state: Array.from({ length: 8 }, (_, index) => index % 2),
      confidence: 'inferred',
    })),
  }
}

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    FileUploaderDropContainer: ({ labelText, onAddFiles }: { labelText: string; onAddFiles: (event: React.SyntheticEvent<HTMLElement>, content: { addedFiles: File[] }) => void }) => (
      <button type="button" onClick={(event) => onAddFiles(event as unknown as React.SyntheticEvent<HTMLElement>, { addedFiles: [new File(['fixture'], 'fixture.syx', { type: 'application/octet-stream' })] })}>
        {labelText}
      </button>
    ),
    FileUploaderItem: ({ name }: { name: string }) => <div>{name}</div>,
  }
})

jest.mock('../hooks/useDeviceLocation', () => ({
  useDeviceLocation: (...args: unknown[]) => mockUseDeviceLocation(...args),
}))

jest.mock('../components/DeviceContext', () => ({
  DeviceContextBanner: ({ deviceName }: { deviceName: string }) => (
    <div data-testid="device-context-banner">{deviceName} context banner</div>
  ),
}))

const shellWindowPatches: Array<{ actions?: Array<{ id: string; label: string; onClick?: () => void; disabled?: boolean }> }> = []
jest.mock('../layout/useSetShellWindow', () => ({
  useSetShellWindow: (patch: unknown) => {
    shellWindowPatches.push(patch as never)
  },
}))

jest.mock('../../map2/groundControlProApi', () => ({
  __esModule: true,
  default: mockGroundControlProApi,
}))

const { GroundControlProPage } =
  jest.requireActual('./GroundControlProPage') as typeof import('./GroundControlProPage')

describe('GroundControlProPage', () => {
  beforeEach(() => {
    shellWindowPatches.length = 0
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })
    }
    if (typeof window.ResizeObserver === 'undefined') {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: ResizeObserverMock,
      })
      Object.defineProperty(globalThis, 'ResizeObserver', {
        writable: true,
        value: ResizeObserverMock,
      })
    }
    if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
      HTMLElement.prototype.scrollIntoView = jest.fn()
    }

    mockUseDeviceLocation.mockReset()
    Object.values(mockGroundControlProApi).forEach((mockFn) => {
      if (typeof mockFn === 'function' && 'mockReset' in mockFn) {
        mockFn.mockReset()
      }
    })

    mockUseDeviceLocation.mockReturnValue({ location: null, matches: [], isLoading: false })
    mockGroundControlProApi.getPorts.mockResolvedValue({
      rtmidi_available: true,
      inputs: [{ index: 0, name: 'Input A', connected: false }],
      outputs: [{ index: 0, name: 'Output A', connected: false }],
      recommended_input_index: 0,
      recommended_output_index: 0,
    })
    mockGroundControlProApi.getFieldMap.mockResolvedValue({
      profile_id: 'v1_13_bulk_dump',
      schema_version: '2026-03-30',
      source_documents: [{ title: 'Manual', url: 'https://example.com/manual.pdf', notes: 'official' }],
      templates: [{ path_template: 'presets[{preset_index}].name' }],
      unknown_byte_count: 1608,
      expanded_count: 400,
    })
    mockGroundControlProApi.getArtifact.mockResolvedValue({
      artifact_id: 'artifact-1',
      kind: 'source_syx',
      path: '/tmp/factory.syx',
      size_bytes: 16567,
      sha256: 'sha',
      created_at: '2026-03-30T12:00:00Z',
      metadata: {},
      content_preview: '',
    })
  })

  it('renders the full tabbed workspace and keeps push gated before import', async () => {
    renderWithRouter(<GroundControlProPage />)

    await waitFor(() => expect(mockGroundControlProApi.getPorts).toHaveBeenCalled())
    await waitFor(() => expect(mockGroundControlProApi.getFieldMap).toHaveBeenCalled())

    const lastPatch = shellWindowPatches[shellWindowPatches.length - 1]
    expect(lastPatch?.actions?.some((a) => a.id === 'push')).toBe(true)
    expect(lastPatch?.actions?.find((a) => a.id === 'push')?.disabled).toBe(true)
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Configuration' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Presets' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Validation & Transfer' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Forensics' })).toBeTruthy()
    expect(screen.getByText('Hardware not detected')).toBeTruthy()
    expect(screen.getByTestId('device-context-banner')).toHaveTextContent('Ground Control Pro context banner')
  })

  it('imports a dump into the editable session model and keeps push gated without backup', async () => {
    const importedModel = buildModel()
    mockGroundControlProApi.importDump.mockResolvedValue({
      session_id: 'session-1',
      source_name: 'factory_default_v113.syx',
      profile_id: 'v1_13_bulk_dump',
      created_at: '2026-03-30T12:00:00Z',
      updated_at: '2026-03-30T12:00:00Z',
      model: importedModel,
      validation: {
        total_payload_size: 16567,
        exact_size_ok: true,
        preamble_ok: true,
        terminator_ok: true,
        offsets_ok: true,
        field_ranges_ok: true,
        unknown_bytes_preserved: true,
        round_trip_identity: true,
        unknown_byte_count: 1608,
        errors: [],
        warnings: [],
        changed_offsets: [],
      },
      summary: {
        preset_count: 200,
        unknown_byte_count: 1608,
        source_artifact_id: 'artifact-1',
        compiled_artifact_id: null,
        backup_artifact_id: null,
      },
      artifacts: [],
    })

    renderWithRouter(<GroundControlProPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Drop a Ground Control Pro .syx dump here or click to browse' }))

    await waitFor(() => expect(mockGroundControlProApi.importDump).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Dump imported')).toBeTruthy())

    expect(screen.getByText('factory_default_v113.syx')).toBeTruthy()
    expect(screen.getByText('No fresh backup yet')).toBeTruthy()
    const afterImportPatch = shellWindowPatches[shellWindowPatches.length - 1]
    expect(afterImportPatch?.actions?.find((a) => a.id === 'push')?.disabled).toBe(true)
    expect(afterImportPatch?.actions?.find((a) => a.id === 'compile')?.disabled).toBe(false)
  })

  it('keeps GCX loop relay edits in the compiled preset model', async () => {
    const importedModel = buildModel()
    mockGroundControlProApi.importDump.mockResolvedValue({
      session_id: 'session-1',
      source_name: 'factory_default_v113.syx',
      profile_id: 'v1_13_bulk_dump',
      created_at: '2026-03-30T12:00:00Z',
      updated_at: '2026-03-30T12:00:00Z',
      model: importedModel,
      validation: {
        total_payload_size: 16567,
        exact_size_ok: true,
        preamble_ok: true,
        terminator_ok: true,
        offsets_ok: true,
        field_ranges_ok: true,
        unknown_bytes_preserved: true,
        round_trip_identity: true,
        unknown_byte_count: 1608,
        errors: [],
        warnings: [],
        changed_offsets: [],
      },
      summary: {
        preset_count: 200,
        unknown_byte_count: 1608,
        source_artifact_id: 'artifact-1',
        compiled_artifact_id: null,
        backup_artifact_id: null,
      },
      artifacts: [],
    })
    mockGroundControlProApi.compileSession.mockImplementation(async (_sessionId, model) => ({
      session_id: 'session-1',
      artifact: {
        artifact_id: 'compiled-1',
        kind: 'compiled_syx',
        path: '/tmp/compiled.syx',
        size_bytes: 16567,
        sha256: 'compiled',
        created_at: '2026-03-30T12:05:00Z',
        metadata: {},
      },
      validation: {
        total_payload_size: 16567,
        exact_size_ok: true,
        preamble_ok: true,
        terminator_ok: true,
        offsets_ok: true,
        field_ranges_ok: true,
        unknown_bytes_preserved: true,
        round_trip_identity: true,
        unknown_byte_count: 1608,
        errors: [],
        warnings: [],
        changed_offsets: [],
      },
      model,
    }))

    renderWithRouter(<GroundControlProPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Drop a Ground Control Pro .syx dump here or click to browse' }))
    await waitFor(() => expect(mockGroundControlProApi.importDump).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('tab', { name: 'Presets' }))
    const relayToggle = await screen.findByRole('switch', { name: 'GCX 1 Loop 1' })
    expect(relayToggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(relayToggle)
    const compileAction = shellWindowPatches[shellWindowPatches.length - 1]?.actions?.find((a) => a.id === 'compile')
    compileAction?.onClick?.()

    await waitFor(() => expect(mockGroundControlProApi.compileSession).toHaveBeenCalled())
    const compiledModel = mockGroundControlProApi.compileSession.mock.calls[0][1]
    expect(compiledModel.presets[0].gcx_loop_states[0]).toBe(1)
  })

  it('surfaces reconnect and re-push daemon status in the hero chrome', async () => {
    mockGroundControlProApi.getPorts.mockResolvedValue({
      rtmidi_available: true,
      inputs: [{ index: 0, name: 'Ground Control Pro In', connected: true }],
      outputs: [{ index: 0, name: 'Ground Control Pro Out', connected: true }],
      recommended_input_index: 0,
      recommended_output_index: 0,
      daemon_status: {
        enabled: true,
        state: 'repushing',
        available: true,
        poll_interval_s: 2,
        last_checked_at: '2026-04-09T20:30:00Z',
        last_seen_at: '2026-04-09T20:30:00Z',
        last_repush_at: '2026-04-09T20:30:01Z',
        last_error: null,
        reconnect_count: 1,
        matched_input_count: 1,
        matched_output_count: 1,
        notification: {
          severity: 'info',
          title: 'Ground Control Pro state restored',
          subtitle: 'Live snapshot preset 1 re-pushed.',
          emitted_at: '2026-04-09T20:30:01Z',
        },
      },
    })

    renderWithRouter(<GroundControlProPage />)

    await waitFor(() => expect(mockGroundControlProApi.getPorts).toHaveBeenCalled())

    expect(screen.getByText(/repushing/i)).toBeTruthy()
    expect(screen.getByText('Ground Control Pro state restored')).toBeTruthy()
    expect(screen.getByText('Live snapshot preset 1 re-pushed.')).toBeTruthy()
  })
})
