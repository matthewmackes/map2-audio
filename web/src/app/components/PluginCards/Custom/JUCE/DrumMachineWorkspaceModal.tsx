import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button, Modal, Tag, Tile } from '@carbon/react'
import { Launch } from '@carbon/icons-react'

import {
  DrumsWorkspace,
  type DrumWorkspaceCommandRequest,
  type DrumWorkspaceCommandState,
  type DrumWorkspaceSelectionSummary,
} from '@/app/pages/DrumsPage'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import type { DrumKit, DrumMachineState, DrumTransportState } from '@/map2/types'

import './DrumMachineWorkspaceModal.css'

type DrumMode = 'practice' | 'advanced' | 'backing_tracks'
type WorkspacePreset = 'performance' | 'editing' | 'sound-design'
type ShortcutCommand = {
  label: string
  hint: string
  action: () => void | Promise<void>
  disabled?: boolean
}

type SavedWorkspaceLayout = {
  id: string
  name: string
  preset: WorkspacePreset
}

export interface DrumMachineWorkspaceModalProps {
  open: boolean
  mode: DrumMode
  onClose: () => void
}

const MODE_LABELS: Record<DrumMode, string> = {
  practice: 'Practice',
  advanced: 'Advanced',
  backing_tracks: 'Backing Tracks',
}

const WORKSPACE_SECTIONS = [
  { id: 'drum-workspace-top', label: 'Overview' },
  { id: 'drum-transport', label: 'Transport' },
  { id: 'drum-modes', label: 'Modes' },
  { id: 'drum-footer', label: 'Status' },
] as const

const WORKSPACE_PRESETS: Array<{
  id: WorkspacePreset
  label: string
  description: string
  href: string
}> = [
  {
    id: 'performance',
    label: 'Performance',
    description: 'Transport, live mode state, and status checks.',
    href: '#drum-transport',
  },
  {
    id: 'editing',
    label: 'Editing',
    description: 'Sequencer, patterns, and song arrangement.',
    href: '#drum-advanced-sequencer',
  },
  {
    id: 'sound-design',
    label: 'Sound Design',
    description: 'Pad inspector, sample work, mixer, and MIDI.',
    href: '#drum-advanced-inspector',
  },
] as const

const WORKSPACE_PRESET_STORAGE_KEY = 'map2:drum-workspace-preset'
const WORKSPACE_LAYOUTS_STORAGE_KEY = 'map2:drum-workspace-layouts'

const SHORTCUT_CUES = [
  'Arrow keys move step focus in the sequencer grid.',
  'Enter or Space toggles the focused step.',
  'Shift-click selects a step for parameter-lock editing.',
  'Use the mode tabs to jump between Practice, Advanced, and Backing Tracks.',
] as const

function formatPatternLabel(pattern: number, variation: number) {
  return `P${String(pattern + 1).padStart(3, '0')} · ${variation === 0 ? 'Main' : `Var ${variation}`}`
}

function formatStepLabel(stepIndex: number) {
  return `Step ${stepIndex + 1}`
}

function navigateToDrums(mode: DrumMode) {
  if (typeof window === 'undefined') {
    return
  }

  const nextUrl = `/drums?mode=${mode}`
  window.history.pushState({}, '', nextUrl)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function focusWorkspaceSection(href: string) {
  if (typeof document === 'undefined') {
    return
  }

  const sectionId = href.replace(/^#/, '')
  document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function loadSavedWorkspaceLayouts(): SavedWorkspaceLayout[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUTS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is SavedWorkspaceLayout => (
      item
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && (item.preset === 'performance' || item.preset === 'editing' || item.preset === 'sound-design')
    ))
  } catch {
    return []
  }
}

function presetHref(preset: WorkspacePreset) {
  return WORKSPACE_PRESETS.find((candidate) => candidate.id === preset)?.href ?? '#drum-workspace-top'
}

export function DrumMachineWorkspaceModal({
  open,
  mode,
  onClose,
}: DrumMachineWorkspaceModalProps) {
  const [selection, setSelection] = useState<DrumWorkspaceSelectionSummary | null>(null)
  const [workspaceCommandState, setWorkspaceCommandState] = useState<DrumWorkspaceCommandState | null>(null)
  const [commandRequest, setCommandRequest] = useState<DrumWorkspaceCommandRequest | null>(null)
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false)
  const [layoutDraftName, setLayoutDraftName] = useState('')
  const [workspacePreset, setWorkspacePreset] = useState<WorkspacePreset>(() => {
    if (typeof window === 'undefined') {
      return 'editing'
    }

    const storedPreset = window.localStorage.getItem(WORKSPACE_PRESET_STORAGE_KEY)
    if (storedPreset === 'performance' || storedPreset === 'editing' || storedPreset === 'sound-design') {
      return storedPreset
    }
    return 'editing'
  })
  const [savedLayouts, setSavedLayouts] = useState<SavedWorkspaceLayout[]>(() => loadSavedWorkspaceLayouts())
  const stateQuery = useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    enabled: open,
    staleTime: 500,
    refetchInterval: 1500,
  })
  const transportQuery = useQuery({
    queryKey: ['drums', 'transport'],
    queryFn: drumsApi.getTransport,
    enabled: open,
    staleTime: 250,
    refetchInterval: 1000,
  })
  const activeKitQuery = useQuery({
    queryKey: ['drums', 'active-kit'],
    queryFn: drumsApi.getActiveKit,
    enabled: open,
    staleTime: 10_000,
  })

  const normalizedState = normalizeDrumMachineState(stateQuery.data as DrumMachineState | undefined)
  const transport = transportQuery.data as DrumTransportState | undefined
  const activeKit = activeKitQuery.data as DrumKit | null | undefined
  const activeMode = transport ? mode : normalizedState.ui_mode
  const bpm = transport?.bpm ?? normalizedState.bpm
  const pattern = transport?.pattern ?? normalizedState.pattern
  const variation = transport?.variation ?? normalizedState.variation
  const isPlaying = transport?.is_playing ?? normalizedState.transport
  const selectedPad = selection?.pad ?? null
  const selectedStep = selection?.step ?? null
  const queueWorkspaceCommand = (type: DrumWorkspaceCommandRequest['type']) => {
    setCommandRequest({ id: Date.now() + Math.floor(Math.random() * 1000), type })
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(WORKSPACE_PRESET_STORAGE_KEY, workspacePreset)
  }, [workspacePreset])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(WORKSPACE_LAYOUTS_STORAGE_KEY, JSON.stringify(savedLayouts))
  }, [savedLayouts])

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault()
        setShortcutOverlayOpen((current) => !current)
        return
      }
      if (event.key === 'Escape') {
        setShortcutOverlayOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const applyPreset = (preset: WorkspacePreset, href: string) => {
    setWorkspacePreset(preset)
    focusWorkspaceSection(href)
  }
  const saveCurrentLayout = () => {
    const nextName = layoutDraftName.trim() || `${WORKSPACE_PRESETS.find((preset) => preset.id === workspacePreset)?.label ?? 'Workspace'} Layout`
    const nextLayout: SavedWorkspaceLayout = {
      id: `layout-${Date.now()}`,
      name: nextName,
      preset: workspacePreset,
    }
    setSavedLayouts((current) => [nextLayout, ...current].slice(0, 8))
    setLayoutDraftName('')
  }
  const quickCommands: ShortcutCommand[] = [
    { label: 'Toggle Playback', hint: isPlaying ? 'Pause the transport' : 'Start the transport', action: async () => { await drumsApi.setTransport({ is_playing: !isPlaying }) } },
    { label: 'Stop Playback', hint: 'Hard stop the transport', action: async () => { await drumsApi.setTransport({ is_playing: false }) }, disabled: !isPlaying },
    { label: 'Tap Tempo', hint: 'Capture a new BPM tap', action: async () => { await drumsApi.tapTempo(Date.now()) } },
    { label: 'Trigger Fill', hint: 'Fire the current fill variation', action: async () => { await drumsApi.triggerFill() } },
    { label: 'Undo Pattern', hint: 'Restore the previous pattern snapshot', action: () => queueWorkspaceCommand('pattern-undo'), disabled: !workspaceCommandState?.canUndoPattern || workspaceCommandState?.isBusy },
    { label: 'Redo Pattern', hint: 'Reapply the last undone pattern snapshot', action: () => queueWorkspaceCommand('pattern-redo'), disabled: !workspaceCommandState?.canRedoPattern || workspaceCommandState?.isBusy },
    { label: 'Undo Sample', hint: 'Restore the previous pad sample WAV', action: () => queueWorkspaceCommand('sample-undo'), disabled: !workspaceCommandState?.canUndoSample || workspaceCommandState?.isBusy },
    { label: 'Redo Sample', hint: 'Reapply the last undone pad sample WAV', action: () => queueWorkspaceCommand('sample-redo'), disabled: !workspaceCommandState?.canRedoSample || workspaceCommandState?.isBusy },
    { label: 'Performance Layout', hint: 'Focus transport and live state', action: () => applyPreset('performance', '#drum-transport') },
    { label: 'Editing Layout', hint: 'Focus sequencer and pattern tools', action: () => applyPreset('editing', '#drum-advanced-sequencer') },
    { label: 'Sound Design Layout', hint: 'Focus pad, sample, and mix tools', action: () => applyPreset('sound-design', '#drum-advanced-inspector') },
    { label: 'Open Step Locks', hint: 'Jump to the step-lock editor', action: () => focusWorkspaceSection('#drum-advanced-step-locks') },
    { label: 'Open MIDI Editor', hint: 'Jump to drum MIDI controls', action: () => focusWorkspaceSection('#drum-advanced-midi') },
    { label: 'Open Transport', hint: 'Jump to the transport surface', action: () => focusWorkspaceSection('#drum-transport') },
  ]

  return (
    <Modal
      open={open}
      passiveModal
      size="lg"
      modalHeading="Drum Machine Workspace"
      modalLabel="JUCE Grid"
      onRequestClose={onClose}
      className="drum-machine-workspace-modal"
    >
      <div
        className={`drum-machine-workspace-modal__shell drum-machine-workspace-modal__shell--preset-${workspacePreset}`}
        id="drum-workspace-top"
      >
        <Tile className="drum-machine-workspace-modal__hero">
          <div className="drum-machine-workspace-modal__hero-copy">
            <strong>Full sampler, editor, sequencing, mixer, and MIDI workspace</strong>
            <p>
              This modal embeds the complete drum-machine surface from the dedicated workspace
              without leaving JUCE Grid.
            </p>
          </div>
          <div className="drum-machine-workspace-modal__hero-meta">
            <Tag type="blue">{MODE_LABELS[activeMode]}</Tag>
            <Tag type={isPlaying ? 'green' : 'cool-gray'}>{isPlaying ? 'Playing' : 'Stopped'}</Tag>
            <Tag type="teal">{bpm} BPM</Tag>
            <Tag type="purple">{formatPatternLabel(pattern, variation)}</Tag>
            <Tag type="warm-gray">{activeKit?.name ?? 'No kit loaded'}</Tag>
            <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => navigateToDrums(mode)}>
              Open full page
            </Button>
          </div>
        </Tile>

        <div className="drum-machine-workspace-modal__layout">
          <nav className="drum-machine-workspace-modal__rail" aria-label="Drum workspace navigation">
            <div className="drum-machine-workspace-modal__rail-copy">
              <span>Workspace</span>
              <strong>{MODE_LABELS[activeMode]}</strong>
            </div>
            <div className="drum-machine-workspace-modal__rail-links">
              {WORKSPACE_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  className="drum-machine-workspace-modal__rail-link"
                  href={`#${section.id}`}
                >
                  {section.label}
                </a>
              ))}
            </div>
            <div className="drum-machine-workspace-modal__preset-group">
              <span className="drum-machine-workspace-modal__group-label">Focus Presets</span>
              <div className="drum-machine-workspace-modal__preset-list">
                {WORKSPACE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="drum-machine-workspace-modal__preset-card"
                    type="button"
                    aria-pressed={workspacePreset === preset.id}
                    data-active={workspacePreset === preset.id ? 'true' : 'false'}
                    onClick={() => {
                      setWorkspacePreset(preset.id)
                      focusWorkspaceSection(preset.href)
                    }}
                  >
                    <strong>
                      {preset.label}
                      {workspacePreset === preset.id ? ' · Active' : ''}
                    </strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="drum-machine-workspace-modal__preset-group">
              <span className="drum-machine-workspace-modal__group-label">Saved Layouts</span>
              <div className="drum-machine-workspace-modal__layout-save">
                <label className="drum-machine-workspace-modal__layout-field">
                  <span className="drum-machine-workspace-modal__layout-field-label">Layout name</span>
                  <input
                    aria-label="Workspace layout name"
                    value={layoutDraftName}
                    onChange={(event) => setLayoutDraftName(event.currentTarget.value)}
                    placeholder="Editing set"
                  />
                </label>
                <Button kind="primary" size="sm" onClick={saveCurrentLayout}>
                  Save Layout
                </Button>
              </div>
              <div className="drum-machine-workspace-modal__saved-layouts" aria-label="Saved workspace layouts">
                {savedLayouts.length > 0 ? savedLayouts.map((layout) => (
                  <div key={layout.id} className="drum-machine-workspace-modal__saved-layout">
                    <div className="drum-machine-workspace-modal__saved-layout-copy">
                      <strong>{layout.name}</strong>
                      <span>{WORKSPACE_PRESETS.find((preset) => preset.id === layout.preset)?.label ?? 'Custom'} preset</span>
                    </div>
                    <div className="drum-machine-workspace-modal__saved-layout-actions">
                      <Button kind="ghost" size="sm" onClick={() => applyPreset(layout.preset, presetHref(layout.preset))}>
                        Load
                      </Button>
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        onClick={() => setSavedLayouts((current) => current.filter((candidate) => candidate.id !== layout.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="drum-machine-workspace-modal__inspector-empty">
                    Save named layouts for recurring performance, editing, and sound-design views.
                  </p>
                )}
              </div>
            </div>
            <div className="drum-machine-workspace-modal__preset-group">
              <span className="drum-machine-workspace-modal__group-label">Shortcut Cues</span>
              <ul className="drum-machine-workspace-modal__shortcut-list">
                {SHORTCUT_CUES.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
              <div className="drum-machine-workspace-modal__inspector-tags">
                <Tag type={workspaceCommandState?.canUndoPattern ? 'green' : 'cool-gray'}>
                  {workspaceCommandState?.canUndoPattern ? 'Pattern Undo Ready' : 'Pattern Undo Empty'}
                </Tag>
                <Tag type={workspaceCommandState?.canUndoSample ? 'teal' : 'cool-gray'}>
                  {workspaceCommandState?.canUndoSample ? `Pad ${((workspaceCommandState?.selectedPad ?? 0) + 1)} Sample Undo Ready` : 'Sample Undo Empty'}
                </Tag>
              </div>
              <Button kind="secondary" size="sm" onClick={() => setShortcutOverlayOpen(true)}>
                Shortcut Overlay
              </Button>
            </div>
          </nav>

          <div className="drum-machine-workspace-modal__workspace">
            <DrumsWorkspace
              embedded
              initialMode={mode}
              onSelectionChange={setSelection}
              commandRequest={commandRequest}
              onCommandStateChange={setWorkspaceCommandState}
            />
            {shortcutOverlayOpen ? (
              <div
                className="drum-machine-workspace-modal__shortcut-overlay"
                role="dialog"
                aria-modal="false"
                aria-label="Drum shortcut overlay"
              >
                <Tile className="drum-machine-workspace-modal__shortcut-overlay-tile">
                  <div className="drum-machine-workspace-modal__inspector-header">
                    <div className="drum-machine-workspace-modal__rail-copy">
                      <span>Quick Commands</span>
                      <strong>Embedded Drum Workspace Shortcuts</strong>
                    </div>
                    <Button kind="ghost" size="sm" onClick={() => setShortcutOverlayOpen(false)}>
                      Close
                    </Button>
                  </div>
                  <div className="drum-machine-workspace-modal__shortcut-groups">
                    <div className="drum-machine-workspace-modal__shortcut-group">
                      <span className="drum-machine-workspace-modal__group-label">Keyboard</span>
                      <dl className="drum-machine-workspace-modal__shortcut-map">
                        <div><dt>Shift + ?</dt><dd>Open or close this overlay</dd></div>
                        <div><dt>Arrow Keys</dt><dd>Move sequencer focus</dd></div>
                        <div><dt>Enter / Space</dt><dd>Toggle the focused step</dd></div>
                        <div><dt>Shift + Click</dt><dd>Inspect a step without toggling it</dd></div>
                        <div><dt>Escape</dt><dd>Close this overlay</dd></div>
                      </dl>
                    </div>
                    <div className="drum-machine-workspace-modal__shortcut-group">
                      <span className="drum-machine-workspace-modal__group-label">Quick Actions</span>
                      <div className="drum-machine-workspace-modal__command-list">
                        {quickCommands.map((command) => (
                          <button
                            key={command.label}
                            type="button"
                            className="drum-machine-workspace-modal__command-button"
                            disabled={command.disabled}
                            data-disabled={command.disabled ? 'true' : 'false'}
                            onClick={() => {
                              setShortcutOverlayOpen(false)
                              void Promise.resolve(command.action())
                            }}
                          >
                            <strong>{command.label}</strong>
                            <span>{command.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tile>
              </div>
            ) : null}
          </div>

          <aside className="drum-machine-workspace-modal__inspector" aria-label="Live drum inspector">
            <Tile className="drum-machine-workspace-modal__inspector-tile">
              <div className="drum-machine-workspace-modal__inspector-header">
                <div className="drum-machine-workspace-modal__rail-copy">
                  <span>Live Inspector</span>
                  <strong>{selectedPad?.name ?? 'Awaiting pad context'}</strong>
                </div>
                {selectedPad ? <Tag type="green">Pad {selectedPad.index + 1}</Tag> : null}
              </div>
              {selectedPad ? (
                <div className="drum-machine-workspace-modal__inspector-stack">
                  <div className="drum-machine-workspace-modal__inspector-tags">
                    <Tag type="blue">Bus {selectedPad.bus}</Tag>
                    <Tag type="cool-gray">Note {selectedPad.note}</Tag>
                    <Tag type={selectedPad.soundSource === 'sample' ? 'green' : selectedPad.soundSource === 'hybrid' ? 'teal' : 'cyan'}>
                      {selectedPad.soundSource === 'hybrid' ? 'Hybrid' : selectedPad.soundSource === 'synth' ? 'Synth' : 'Sample'}
                    </Tag>
                    <Tag type={selectedPad.muted ? 'red' : 'cool-gray'}>{selectedPad.muted ? 'Muted' : 'Live'}</Tag>
                    <Tag type={selectedPad.soloed ? 'cyan' : 'cool-gray'}>{selectedPad.soloed ? 'Soloed' : 'Grouped'}</Tag>
                  </div>
                  <dl className="drum-machine-workspace-modal__inspector-facts">
                    <div>
                      <dt>Sample</dt>
                      <dd>
                        {selectedPad.sampleLoaded
                          ? `${selectedPad.sampleRate} Hz · ${selectedPad.sampleCount} samples`
                          : 'No sample loaded'}
                      </dd>
                    </div>
                    <div>
                      <dt>Source Path</dt>
                      <dd>{selectedPad.sfzPath}</dd>
                    </div>
                  </dl>
                  <div className="drum-machine-workspace-modal__inspector-links">
                    <a href="#drum-advanced-inspector">Open pad editor</a>
                    <a href="#drum-advanced-midi">Open MIDI editor</a>
                  </div>
                </div>
              ) : (
                <p className="drum-machine-workspace-modal__inspector-empty">
                  Select a pad in the sequencer to keep its editor context pinned here.
                </p>
              )}
            </Tile>

            <Tile className="drum-machine-workspace-modal__inspector-tile">
              <div className="drum-machine-workspace-modal__inspector-header">
                <div className="drum-machine-workspace-modal__rail-copy">
                  <span>Step Focus</span>
                  <strong>{selectedStep ? formatStepLabel(selectedStep.stepIndex) : 'No step selected'}</strong>
                </div>
                {selectedStep ? (
                  <Tag type={selectedStep.active ? 'green' : 'cool-gray'}>
                    {selectedStep.active ? 'Active hit' : 'Inspector only'}
                  </Tag>
                ) : null}
              </div>
              {selectedStep ? (
                <div className="drum-machine-workspace-modal__inspector-stack">
                  <div className="drum-machine-workspace-modal__inspector-tags">
                    <Tag type="warm-gray">Row {selectedStep.instrumentIndex + 1}</Tag>
                    <Tag type="purple">{selectedStep.velocity > 0 ? `Vel ${selectedStep.velocity}` : 'Velocity 0'}</Tag>
                    <Tag type={selectedStep.accent ? 'blue' : 'cool-gray'}>
                      {selectedStep.accent ? 'Accent' : 'Plain'}
                    </Tag>
                    <Tag type={selectedStep.hasLocks ? 'magenta' : 'cool-gray'}>
                      {selectedStep.hasLocks ? 'P-locks' : 'No locks'}
                    </Tag>
                  </div>
                  <dl className="drum-machine-workspace-modal__inspector-facts">
                    <div>
                      <dt>Probability</dt>
                      <dd>{Math.round(selectedStep.probability * 100)}%</dd>
                    </div>
                    <div>
                      <dt>Micro Timing</dt>
                      <dd>{selectedStep.microTiming} ticks</dd>
                    </div>
                    <div>
                      <dt>Ratchet</dt>
                      <dd>x{selectedStep.ratchetCount} · {selectedStep.ratchetDecay}% decay</dd>
                    </div>
                  </dl>
                  <div className="drum-machine-workspace-modal__inspector-links">
                    <a href="#drum-advanced-step-locks">Open step locks</a>
                    <a href="#drum-advanced-sequencer">Return to sequencer</a>
                  </div>
                </div>
              ) : (
                <p className="drum-machine-workspace-modal__inspector-empty">
                  Shift-click a step to pin its parameter-lock state in this side inspector.
                </p>
              )}
            </Tile>
          </aside>
        </div>
      </div>
    </Modal>
  )
}

export default DrumMachineWorkspaceModal
