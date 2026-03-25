import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { DrumMachineWorkspaceModal } from './DrumMachineWorkspaceModal'

jest.mock('@carbon/react', () => ({
  Button: ({ children, onClick, renderIcon: _renderIcon, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  Modal: ({ open, modalHeading, modalLabel, onRequestClose, children }: any) => (
    open ? (
      <section aria-label={modalHeading}>
        <span>{modalLabel}</span>
        <button onClick={onRequestClose}>Close</button>
        {children}
      </section>
    ) : null
  ),
  Tag: ({ children }: any) => <span>{children}</span>,
  Tile: ({ children }: any) => <div>{children}</div>,
}))

jest.mock('@carbon/icons-react', () => ({
  Launch: () => <span>launch</span>,
}))

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const scope = queryKey.join(':')
    if (scope === 'drums:state') {
      return {
        data: {
          ui_mode: 'advanced',
          bpm: 120,
          volume: 80,
          pattern: 7,
          variation: 1,
          transport: false,
        },
      }
    }
    if (scope === 'drums:transport') {
      return {
        data: {
          is_playing: true,
          bpm: 128,
          pattern: 9,
          variation: 2,
        },
      }
    }
    if (scope === 'drums:active-kit') {
      return {
        data: {
          name: 'Studio',
        },
      }
    }
    return { data: undefined }
  },
}))

const mockSetTransport = jest.fn().mockResolvedValue(undefined)
const mockTapTempo = jest.fn().mockResolvedValue(undefined)
const mockTriggerFill = jest.fn().mockResolvedValue(undefined)

jest.mock('@/map2/api', () => ({
  drumsApi: {
    getState: jest.fn(),
    getTransport: jest.fn(),
    getActiveKit: jest.fn(),
    setTransport: (...args: unknown[]) => mockSetTransport(...args),
    tapTempo: (...args: unknown[]) => mockTapTempo(...args),
    triggerFill: (...args: unknown[]) => mockTriggerFill(...args),
  },
}))

jest.mock('@/map2/drumMachineState', () => ({
  normalizeDrumMachineState: (state: Record<string, unknown> | undefined) => ({
    ui_mode: 'advanced',
    bpm: 120,
    volume: 80,
    pattern: 7,
    variation: 1,
    transport: false,
    ...state,
  }),
}))

jest.mock('@/app/pages/DrumsPage', () => ({
  DrumsWorkspace: ({
    embedded,
    initialMode,
    onSelectionChange,
    commandRequest,
    onCommandStateChange,
  }: {
    embedded?: boolean
    initialMode?: string | null
    onSelectionChange?: (selection: Record<string, unknown>) => void
    commandRequest?: { id: number; type: string } | null
    onCommandStateChange?: (state: Record<string, unknown>) => void
  }) => {
    const React = require('react')
    const [commands, setCommands] = React.useState<string[]>([])
    const [commandState, setCommandState] = React.useState({
      canUndoPattern: true,
      canRedoPattern: false,
      canUndoSample: true,
      canRedoSample: false,
      selectedPad: 0,
      isBusy: false,
    })

    React.useEffect(() => {
      onSelectionChange?.({
        mode: initialMode ?? 'advanced',
        pad: {
          index: 0,
          name: 'Kick',
          note: 36,
          bus: 1,
          soundSource: 'hybrid',
          muted: false,
          soloed: true,
          sampleLoaded: true,
          sampleCount: 44100,
          sampleRate: 48000,
          sfzPath: 'kits/studio/kick.sfz',
        },
        step: {
          instrumentIndex: 0,
          stepIndex: 4,
          active: true,
          velocity: 115,
          accent: true,
          probability: 0.8,
          microTiming: -3,
          ratchetCount: 4,
          ratchetDecay: 18,
          hasLocks: true,
        },
      })
    }, [initialMode, onSelectionChange])

    React.useEffect(() => {
      onCommandStateChange?.(commandState)
    }, [commandState, onCommandStateChange])

    React.useEffect(() => {
      if (!commandRequest) {
        return
      }
      setCommands((current) => [...current, commandRequest.type])
      if (commandRequest.type === 'pattern-undo') {
        setCommandState((current) => ({ ...current, canUndoPattern: false, canRedoPattern: true }))
      }
      if (commandRequest.type === 'sample-undo') {
        setCommandState((current) => ({ ...current, canUndoSample: false, canRedoSample: true }))
      }
    }, [commandRequest])

    return (
      <div data-testid="drums-workspace">
        {embedded ? 'embedded' : 'page'}|{initialMode ?? 'none'}
        <div data-testid="workspace-command-log">{commands.join(',')}</div>
        <section id="drum-transport">transport</section>
        <section id="drum-advanced-sequencer">sequencer</section>
        <section id="drum-advanced-inspector">inspector</section>
        <section id="drum-advanced-midi">midi</section>
        <section id="drum-advanced-step-locks">step-locks</section>
      </div>
    )
  },
}))

describe('DrumMachineWorkspaceModal', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    mockSetTransport.mockClear()
    mockTapTempo.mockClear()
    mockTriggerFill.mockClear()
  })

  it('renders the embedded workspace with the requested mode', () => {
    render(
      <DrumMachineWorkspaceModal
        open
        mode="backing_tracks"
        onClose={jest.fn()}
      />,
    )

    expect(screen.getByTestId('drums-workspace')).toHaveTextContent('embedded|backing_tracks')
    expect(screen.getAllByText('Backing Tracks').length).toBeGreaterThan(0)
    expect(screen.getByText('Playing')).toBeInTheDocument()
    expect(screen.getByText('128 BPM')).toBeInTheDocument()
    expect(screen.getByText('Studio')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Transport' })).toHaveAttribute('href', '#drum-transport')
    expect(screen.getByRole('button', { name: /Performance/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Editing.*Active/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Sound Design/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Arrow keys move step focus in the sequencer grid.')).toBeInTheDocument()
    expect(screen.getByText('Live Inspector')).toBeInTheDocument()
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.getByText('Hybrid')).toBeInTheDocument()
    expect(screen.getByText('48000 Hz · 44100 samples')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open pad editor' })).toHaveAttribute('href', '#drum-advanced-inspector')
    expect(screen.getByText('Step 5')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('x4 · 18% decay')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open step locks' })).toHaveAttribute('href', '#drum-advanced-step-locks')
  })

  it('persists and restores workspace layout presets', () => {
    const scrollIntoView = jest.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const { unmount } = render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Performance/ }))

    expect(window.localStorage.getItem('map2:drum-workspace-preset')).toBe('performance')
    expect(screen.getByRole('button', { name: /Performance.*Active/ })).toHaveAttribute('aria-pressed', 'true')
    expect(scrollIntoView).toHaveBeenCalled()
    expect(document.getElementById('drum-workspace-top')).toHaveClass(
      'drum-machine-workspace-modal__shell--preset-performance',
    )

    unmount()

    render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Performance.*Active/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves, loads, and deletes named workspace layouts', () => {
    const scrollIntoView = jest.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Workspace layout name'), { target: { value: 'Performance Rack' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Layout' }))

    expect(screen.getByText('Performance Rack')).toBeInTheDocument()
    expect(window.localStorage.getItem('map2:drum-workspace-layouts')).toContain('Performance Rack')

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(scrollIntoView).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByText('Performance Rack')).not.toBeInTheDocument()
  })

  it('opens the shortcut overlay from the UI and closes it with escape', () => {
    render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Shortcut Overlay' }))

    expect(screen.getByRole('dialog', { name: 'Drum shortcut overlay' })).toBeInTheDocument()
    expect(screen.getByText('Embedded Drum Workspace Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Shift + ?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open MIDI Editor/ })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Drum shortcut overlay' })).not.toBeInTheDocument()
  })

  it('toggles the shortcut overlay from the keyboard', () => {
    const scrollIntoView = jest.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(screen.getByRole('dialog', { name: 'Drum shortcut overlay' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Performance Layout/ }))

    expect(window.localStorage.getItem('map2:drum-workspace-preset')).toBe('performance')
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Drum shortcut overlay' })).not.toBeInTheDocument()
  })

  it('runs transport commands and forwards history commands through the overlay', async () => {
    render(
      <DrumMachineWorkspaceModal
        open
        mode="advanced"
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Shortcut Overlay' }))
    fireEvent.click(screen.getByRole('button', { name: /Toggle Playback/ }))
    expect(mockSetTransport).toHaveBeenCalledWith({ is_playing: false })

    fireEvent.click(screen.getByRole('button', { name: 'Shortcut Overlay' }))
    fireEvent.click(screen.getByRole('button', { name: /Undo Pattern/ }))
    expect(screen.getByTestId('workspace-command-log')).toHaveTextContent('pattern-undo')
    expect(screen.getByText('Pattern Undo Empty')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shortcut Overlay' }))
    fireEvent.click(screen.getByRole('button', { name: /Tap Tempo/ }))
    expect(mockTapTempo).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Shortcut Overlay' }))
    fireEvent.click(screen.getByRole('button', { name: /Trigger Fill/ }))
    expect(mockTriggerFill).toHaveBeenCalled()
  })

  it('can route out to the standalone drums page', () => {
    render(
      <DrumMachineWorkspaceModal
        open
        mode="practice"
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }))

    expect(window.location.pathname).toBe('/drums')
    expect(window.location.search).toBe('?mode=practice')
  })
})
