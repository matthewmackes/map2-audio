import './MaschineMidiMapPage.css'

import {
  Button as CarbonButton,
  InlineNotification,
  Layer,
  NumberInput,
  Select,
  SelectItem,
  Tag,
  Toggle,
} from '@carbon/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import {
  maschineApi,
  type ButtonMidiMapping,
  type EncoderMidiMapping,
  type MaschineMidiMap,
  type PadMidiMapping,
} from '../../map2/clients/maschine'
import { getWsBaseUrl } from '../../map2/transport'
import type { MaschineDaemonStatus, MaschineHidEvent } from '../../map2/types'

// ---------------------------------------------------------------------------
// MIDI helpers
// ---------------------------------------------------------------------------

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function midiNoteName(note: number): string {
  const octave = Math.floor(note / 12) - 2
  return `${NOTE_NAMES[note % 12]}${octave}`
}

function midiLabel(type: string, number: number): string {
  if (type === 'note') return `Note ${number} (${midiNoteName(number)})`
  if (type === 'cc') return `CC ${number}`
  return `PC ${number}`
}

function shortMidiLabel(type: string, number: number): string {
  if (type === 'note') return `N${number}`
  if (type === 'cc') return `CC${number}`
  return `PC${number}`
}

// ---------------------------------------------------------------------------
// Button ID constants (match mk1_protocol.py Button IntEnum)
// ---------------------------------------------------------------------------

const BTN = {
  MUTE: '0', SOLO: '1', SELECT: '2', DUPLICATE: '3',
  NAVIGATE: '4', KEYBOARD: '5', PATTERN: '6', SCENE: '7',
  REC: '9', ERASE: '10', SHIFT: '11', GRID: '12',
  TRANSPORT_RIGHT: '13', TRANSPORT_LEFT: '14', LOOP: '15',
  GROUP_E: '16', GROUP_F: '17', GROUP_G: '18', GROUP_H: '19',
  GROUP_D: '20', GROUP_C: '21', GROUP_B: '22', GROUP_A: '23',
  CONTROL: '24', BROWSE: '25', BROWSE_LEFT: '26', SNAP: '27',
  AUTO_WRITE: '28', BROWSE_RIGHT: '29', SAMPLING: '30', STEP: '31',
  DISPLAY_8: '32', DISPLAY_7: '33', DISPLAY_6: '34', DISPLAY_5: '35',
  DISPLAY_4: '36', DISPLAY_3: '37', DISPLAY_2: '38', DISPLAY_1: '39',
  NOTE_REPEAT: '40', PLAY: '41',
} as const

// Physical layout order for each row
const TOP_BUTTONS = [
  BTN.CONTROL, BTN.STEP, BTN.BROWSE, BTN.SAMPLING,
  BTN.SNAP, BTN.AUTO_WRITE, BTN.BROWSE_LEFT, BTN.BROWSE_RIGHT,
]
const DISPLAY_BUTTONS_LEFT = [BTN.DISPLAY_1, BTN.DISPLAY_2, BTN.DISPLAY_3, BTN.DISPLAY_4]
const DISPLAY_BUTTONS_RIGHT = [BTN.DISPLAY_5, BTN.DISPLAY_6, BTN.DISPLAY_7, BTN.DISPLAY_8]
const GROUP_BUTTONS = [
  BTN.GROUP_A, BTN.GROUP_B, BTN.GROUP_C, BTN.GROUP_D,
  BTN.GROUP_E, BTN.GROUP_F, BTN.GROUP_G, BTN.GROUP_H,
]
const LEFT_OF_PADS_BUTTONS = [
  BTN.MUTE, BTN.SOLO, BTN.SELECT, BTN.DUPLICATE,
  BTN.NAVIGATE, BTN.KEYBOARD, BTN.PATTERN, BTN.SCENE,
]
const TRANSPORT_BUTTONS = [
  BTN.SHIFT, BTN.ERASE, BTN.GRID, BTN.TRANSPORT_RIGHT,
  BTN.REC, BTN.PLAY, BTN.TRANSPORT_LEFT, BTN.LOOP,
  BTN.NOTE_REPEAT,
]

// Encoder indices: 1-7 under LCDs, 0=NAV, 8=VOL, 9=TEMPO, 10=SWING
const ENCODERS_LEFT = [1, 2, 3, 4]    // Under left LCD
const ENCODERS_RIGHT = [5, 6, 7]      // Under right LCD (only 3 — E5,E6,E7)
const ENCODERS_MASTER = [8, 9, 10]    // VOL, TEMPO, SWING
const ENCODER_NAV = 0

// Hardware pad layout: rows go 13-16 (top), 9-12, 5-8, 1-4 (bottom)
const PAD_GRID_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]
// LED_PAD_INDEX: hardware order from mk1_protocol (non-monotonic)
const LED_PAD_INDEX = [3, 2, 1, 0, 7, 6, 5, 4, 11, 10, 9, 8, 15, 14, 13, 12]

// ---------------------------------------------------------------------------
// Selected element type
// ---------------------------------------------------------------------------

type SelectedElement =
  | { kind: 'pad'; index: number }
  | { kind: 'button'; id: string }
  | { kind: 'encoder'; index: number }
  | null

// ---------------------------------------------------------------------------
// Cell component — generic cell for buttons/pads/encoders
// ---------------------------------------------------------------------------

function MK1Cell({
  label,
  midiText,
  extraText,
  isSelected,
  isActive,
  isListening,
  variant,
  ledSlot,
  onClick,
  onBrightness,
}: {
  label: string
  midiText: string
  extraText?: string
  isSelected: boolean
  isActive: boolean
  isListening?: boolean
  variant?: 'pad' | 'encoder' | 'encoder-master' | 'encoder-nav'
  ledSlot?: number
  onClick: () => void
  onBrightness?: (slot: number, brightness: number) => void
}) {
  let className = 'mk1-cell'
  if (variant) className += ` mk1-cell--${variant}`
  if (isSelected) className += ' mk1-cell--selected'
  if (isActive) className += ' mk1-cell--active'
  if (isListening) className += ' mk1-cell--listening'

  return (
    <div className={className} onClick={onClick} role="button" tabIndex={0}>
      <span className="mk1-label">{label}</span>
      <span className="mk1-midi">{midiText}</span>
      {extraText && <span className="mk1-curve">{extraText}</span>}
      {ledSlot !== undefined && (
        <>
          <div className="mk1-led-bar mk1-led-bar--on" />
          <div className="mk1-led-slider" onClick={(e) => e.stopPropagation()}>
            <input
              type="range"
              min={0}
              max={255}
              defaultValue={0}
              title="LED brightness"
              onChange={(e) => onBrightness?.(ledSlot, Number(e.target.value))}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail Editor Panel
// ---------------------------------------------------------------------------

function DetailEditor({
  selected,
  midiMap,
  onUpdate,
  onTest,
  isConnected,
}: {
  selected: SelectedElement
  midiMap: MaschineMidiMap
  onUpdate: (map: MaschineMidiMap) => void
  onTest: (element: { element_type: string; index: number }) => void
  isConnected: boolean
}) {
  if (!selected) {
    return (
      <div className="mk1-detail-panel">
        <p style={{ color: '#888', fontSize: '0.8rem' }}>
          Select a pad, button, or encoder to edit its MIDI assignment.
        </p>
      </div>
    )
  }

  if (selected.kind === 'pad') {
    const pad = midiMap.pads[selected.index]
    if (!pad) return null
    return (
      <div className="mk1-detail-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#eee' }}>{pad.label || `PAD ${selected.index + 1}`}</h3>
          <Tag type="teal">Pad {selected.index + 1}</Tag>
        </div>
        <div className="mk1-detail-form">
          <label>Message Type</label>
          <Select
            id="pad-msg-type"
            size="sm"
            labelText=""
            hideLabel
            value={pad.message_type}
            onChange={(e) => {
              const updated = { ...midiMap, pads: [...midiMap.pads] }
              updated.pads[selected.index] = { ...pad, message_type: e.target.value as PadMidiMapping['message_type'] }
              onUpdate(updated)
            }}
          >
            <SelectItem value="note" text="Note" />
            <SelectItem value="cc" text="CC" />
            <SelectItem value="program_change" text="Program Change" />
          </Select>

          <label>Number</label>
          <NumberInput
            id="pad-note"
            size="sm"
            label=""
            hideLabel
            min={0}
            max={127}
            value={pad.note}
            onChange={(_e, { value }) => {
              const updated = { ...midiMap, pads: [...midiMap.pads] }
              updated.pads[selected.index] = { ...pad, note: Number(value) }
              onUpdate(updated)
            }}
          />

          <label>Velocity Curve</label>
          <Select
            id="pad-curve"
            size="sm"
            labelText=""
            hideLabel
            value={pad.velocity_curve}
            onChange={(e) => {
              const updated = { ...midiMap, pads: [...midiMap.pads] }
              updated.pads[selected.index] = { ...pad, velocity_curve: e.target.value as PadMidiMapping['velocity_curve'] }
              onUpdate(updated)
            }}
          >
            <SelectItem value="linear" text="Linear" />
            <SelectItem value="log" text="Logarithmic" />
            <SelectItem value="exp" text="Exponential" />
          </Select>

          <label>MIDI Output</label>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>{midiLabel(pad.message_type, pad.note)}</span>
        </div>
        <CarbonButton
          kind="primary"
          size="sm"
          disabled={!isConnected}
          onClick={() => onTest({ element_type: 'pad', index: selected.index })}
        >
          Test Pad {selected.index + 1}
        </CarbonButton>
      </div>
    )
  }

  if (selected.kind === 'button') {
    const btn = midiMap.buttons[selected.id]
    if (!btn) return null
    return (
      <div className="mk1-detail-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#eee' }}>{btn.label}</h3>
          <Tag type="purple">Button</Tag>
        </div>
        <div className="mk1-detail-form">
          <label>Message Type</label>
          <Select
            id="btn-msg-type"
            size="sm"
            labelText=""
            hideLabel
            value={btn.message_type}
            onChange={(e) => {
              const updated = { ...midiMap, buttons: { ...midiMap.buttons } }
              updated.buttons[selected.id] = { ...btn, message_type: e.target.value as ButtonMidiMapping['message_type'] }
              onUpdate(updated)
            }}
          >
            <SelectItem value="note" text="Note" />
            <SelectItem value="cc" text="CC" />
            <SelectItem value="program_change" text="Program Change" />
          </Select>

          <label>Number</label>
          <NumberInput
            id="btn-number"
            size="sm"
            label=""
            hideLabel
            min={0}
            max={127}
            value={btn.number}
            onChange={(_e, { value }) => {
              const updated = { ...midiMap, buttons: { ...midiMap.buttons } }
              updated.buttons[selected.id] = { ...btn, number: Number(value) }
              onUpdate(updated)
            }}
          />

          <label>MIDI Output</label>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>{midiLabel(btn.message_type, btn.number)}</span>
        </div>
        <CarbonButton
          kind="primary"
          size="sm"
          disabled={!isConnected}
          onClick={() => onTest({ element_type: 'button', index: Number(selected.id) })}
        >
          Test {btn.label}
        </CarbonButton>
      </div>
    )
  }

  if (selected.kind === 'encoder') {
    const enc = midiMap.encoders[selected.index]
    if (!enc) return null
    return (
      <div className="mk1-detail-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#eee' }}>{enc.label}</h3>
          <Tag type="magenta">Encoder {selected.index}</Tag>
        </div>
        <div className="mk1-detail-form">
          <label>CC Number</label>
          <NumberInput
            id="enc-cc"
            size="sm"
            label=""
            hideLabel
            min={0}
            max={127}
            value={enc.cc}
            onChange={(_e, { value }) => {
              const updated = { ...midiMap, encoders: [...midiMap.encoders] }
              updated.encoders[selected.index] = { ...enc, cc: Number(value) }
              onUpdate(updated)
            }}
          />

          <label>Mode</label>
          <Select
            id="enc-mode"
            size="sm"
            labelText=""
            hideLabel
            value={enc.mode}
            onChange={(e) => {
              const updated = { ...midiMap, encoders: [...midiMap.encoders] }
              updated.encoders[selected.index] = { ...enc, mode: e.target.value as EncoderMidiMapping['mode'] }
              onUpdate(updated)
            }}
          >
            <SelectItem value="relative" text="Relative" />
            <SelectItem value="absolute" text="Absolute" />
          </Select>

          <label>MIDI Output</label>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>CC {enc.cc} ({enc.mode})</span>
        </div>
        <CarbonButton
          kind="primary"
          size="sm"
          disabled={!isConnected}
          onClick={() => onTest({ element_type: 'encoder', index: selected.index })}
        >
          Test {enc.label}
        </CarbonButton>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function MaschineMidiMapPage() {
  const [selected, setSelected] = useState<SelectedElement>(null)
  const [localMap, setLocalMap] = useState<MaschineMidiMap | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [listenMode, setListenMode] = useState(false)
  const [activePads, setActivePads] = useState<Set<number>>(new Set())
  const [activeButtons, setActiveButtons] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<MaschineDaemonStatus | null>(null)

  // Fetch MIDI map config
  const midiMapQuery = useQuery({
    queryKey: ['maschine', 'midi-map'],
    queryFn: () => maschineApi.getMidiMap(),
  })

  // Fetch device status
  const statusQuery = useQuery({
    queryKey: ['maschine', 'status'],
    queryFn: () => maschineApi.getStatus(),
    refetchInterval: 3000,
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (map: MaschineMidiMap) =>
      maschineApi.updateMidiMap({
        channel: map.channel,
        pads: map.pads,
        buttons: map.buttons,
        encoders: map.encoders,
      }),
    onSuccess: (response) => {
      setLocalMap(response.midi_map)
      setIsDirty(false)
    },
  })

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => maschineApi.resetMidiMap(),
    onSuccess: (response) => {
      setLocalMap(response.midi_map)
      setIsDirty(false)
    },
  })

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (payload: { element_type: string; index: number }) =>
      maschineApi.testMidiElement({ element_type: payload.element_type as 'pad' | 'button' | 'encoder', index: payload.index }),
  })

  // LED set (fire-and-forget for sliders)
  const handleLedBrightness = useCallback((slot: number, brightness: number) => {
    void maschineApi.setLed(slot, brightness)
  }, [])

  // Initialize local map from query
  useEffect(() => {
    if (midiMapQuery.data?.midi_map && !localMap) {
      setLocalMap(midiMapQuery.data.midi_map)
    }
  }, [midiMapQuery.data, localMap])

  // WebSocket for live input monitoring
  useEffect(() => {
    const socket = new WebSocket(`${getWsBaseUrl()}/api/maschine/ws`)

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data ?? '{}')) as { type?: string; data?: unknown }
      if (message.type === 'maschine:status' && message.data) {
        setStatus(message.data as MaschineDaemonStatus)
      }
      if (message.type === 'maschine:hid_traffic' && message.data && listenMode) {
        const hid = message.data as MaschineHidEvent
        const payload = hid.payload ?? {}
        if (hid.decoded_type === 'pad_press' && typeof payload.pad_index === 'number') {
          setActivePads((prev) => new Set(prev).add(payload.pad_index as number))
          setSelected({ kind: 'pad', index: payload.pad_index as number })
          setTimeout(() => setActivePads((prev) => {
            const next = new Set(prev)
            next.delete(payload.pad_index as number)
            return next
          }), 300)
        }
        if ((hid.decoded_type === 'button_press' || hid.decoded_type === 'group_press' || hid.decoded_type === 'transport_press') && typeof payload.button === 'number') {
          const btnId = String(payload.button)
          setActiveButtons((prev) => new Set(prev).add(btnId))
          setSelected({ kind: 'button', id: btnId })
          setTimeout(() => setActiveButtons((prev) => {
            const next = new Set(prev)
            next.delete(btnId)
            return next
          }), 300)
        }
        if (hid.decoded_type === 'encoder' && typeof payload.encoder === 'number') {
          setSelected({ kind: 'encoder', index: payload.encoder as number })
        }
      }
    }

    return () => { socket.close() }
  }, [listenMode])

  const resolvedStatus = status ?? statusQuery.data?.state ?? null
  const isConnected = Boolean(resolvedStatus?.connected && resolvedStatus?.transport?.connected)
  const midiMap = localMap ?? midiMapQuery.data?.midi_map ?? null

  const handleUpdate = useCallback((updated: MaschineMidiMap) => {
    setLocalMap(updated)
    setIsDirty(true)
  }, [])

  // Helper to render a button cell
  const renderButton = useCallback((id: string) => {
    if (!midiMap) return null
    const btn = midiMap.buttons[id]
    if (!btn) return null
    const ledSlot = midiMap.button_led_slots?.[id]
    return (
      <MK1Cell
        key={id}
        label={btn.label}
        midiText={shortMidiLabel(btn.message_type, btn.number)}
        isSelected={selected?.kind === 'button' && selected.id === id}
        isActive={activeButtons.has(id)}
        ledSlot={ledSlot}
        onClick={() => setSelected({ kind: 'button', id })}
        onBrightness={handleLedBrightness}
      />
    )
  }, [midiMap, selected, activeButtons, handleLedBrightness])

  // Helper to render an encoder cell
  const renderEncoder = useCallback((index: number, variant: 'encoder' | 'encoder-master' | 'encoder-nav' = 'encoder') => {
    if (!midiMap) return null
    const enc = midiMap.encoders[index]
    if (!enc) return null
    return (
      <MK1Cell
        key={`enc-${index}`}
        label={enc.label}
        midiText={`CC${enc.cc}`}
        extraText={enc.mode}
        isSelected={selected?.kind === 'encoder' && selected.index === index}
        isActive={false}
        variant={variant}
        onClick={() => setSelected({ kind: 'encoder', index })}
        onBrightness={handleLedBrightness}
      />
    )
  }, [midiMap, selected, handleLedBrightness])

  if (!midiMap) {
    return (
      <div className="midi-map-page">
        <PageHeader title="MIDI Map Editor" subtitle="Loading MIDI map configuration..." />
      </div>
    )
  }

  return (
    <div className="midi-map-page">
      <PageHeader
        title="MIDI Map Editor"
        subtitle="NI Maschine MK1 \u2014 hardware-faithful layout. Click any element to edit its MIDI assignment."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Tag type={isConnected ? 'green' : 'red'}>{isConnected ? 'Connected' : 'Offline'}</Tag>
            <Tag type="blue">Ch {midiMap.channel}</Tag>
          </div>
        }
      />

      {statusQuery.isError && (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Cannot reach backend" />
      )}

      {/* Toolbar */}
      <div className="mk1-toolbar">
        <Toggle
          id="listen-mode"
          labelText="Listen Mode"
          labelA="Off"
          labelB="On"
          size="sm"
          toggled={listenMode}
          onToggle={setListenMode}
        />
        <NumberInput
          id="midi-channel"
          size="sm"
          label="MIDI Channel"
          min={1}
          max={16}
          value={midiMap.channel}
          onChange={(_e, { value }) => handleUpdate({ ...midiMap, channel: Number(value) })}
          style={{ maxWidth: '8rem' }}
        />
        <CarbonButton
          kind="primary"
          size="sm"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => void saveMutation.mutate(midiMap)}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save as Default'}
        </CarbonButton>
        <CarbonButton
          kind="danger--tertiary"
          size="sm"
          disabled={resetMutation.isPending}
          onClick={() => void resetMutation.mutate()}
        >
          Reset to Factory
        </CarbonButton>
        {isDirty && <Tag type="warm-gray">Unsaved changes</Tag>}
        {saveMutation.isSuccess && !isDirty && <Tag type="green">Saved</Tag>}
      </div>

      {/* Main: hardware layout (left) + detail panel (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1rem', alignItems: 'start' }}>

        {/* ════════ Hardware-faithful MK1 layout ════════ */}
        <div className="mk1-layout">

          {/* Row 1: Top function buttons */}
          <span className="mk1-section-label">Function Buttons</span>
          <div className="mk1-row-top-btns">
            {TOP_BUTTONS.map((id) => renderButton(id))}
          </div>

          {/* Row 2: Dual LCD displays */}
          <span className="mk1-section-label">LCD Displays (255\u00d764)</span>
          <div className="mk1-row-lcds">
            <div className="mk1-lcd-panel">LEFT LCD</div>
            <div className="mk1-lcd-panel">RIGHT LCD</div>
          </div>

          {/* Row 3: Display buttons D1-D8 (4 under each LCD) */}
          <span className="mk1-section-label">Display Buttons</span>
          <div className="mk1-row-display-btns">
            <div className="mk1-display-btn-group">
              {DISPLAY_BUTTONS_LEFT.map((id) => renderButton(id))}
            </div>
            <div className="mk1-display-btn-group">
              {DISPLAY_BUTTONS_RIGHT.map((id) => renderButton(id))}
            </div>
          </div>

          {/* Row 4: Encoders E1-E8 + master encoders */}
          <span className="mk1-section-label">Encoders</span>
          <div className="mk1-row-encoders">
            <div className="mk1-encoder-group">
              {ENCODERS_LEFT.map((i) => renderEncoder(i))}
            </div>
            <div className="mk1-encoder-group">
              {ENCODERS_RIGHT.map((i) => renderEncoder(i))}
            </div>
            <div className="mk1-master-encoders">
              {ENCODERS_MASTER.map((i) => renderEncoder(i, 'encoder-master'))}
            </div>
          </div>

          {/* Row 5: Groups A-H + NAV encoder */}
          <span className="mk1-section-label">Groups + Navigation</span>
          <div className="mk1-row-groups">
            {GROUP_BUTTONS.map((id) => renderButton(id))}
            <div style={{ marginLeft: 'auto' }}>
              {renderEncoder(ENCODER_NAV, 'encoder-nav')}
            </div>
          </div>

          {/* Row 6: Left buttons + Pad grid */}
          <span className="mk1-section-label">Performance Area</span>
          <div className="mk1-row-main">
            <div className="mk1-left-btns">
              {LEFT_OF_PADS_BUTTONS.map((id) => renderButton(id))}
            </div>
            <div className="mk1-pad-grid">
              {PAD_GRID_ORDER.map((padIdx) => {
                const pad = midiMap.pads[padIdx]
                if (!pad) return null
                return (
                  <MK1Cell
                    key={`pad-${padIdx}`}
                    label={pad.label || `PAD ${padIdx + 1}`}
                    midiText={shortMidiLabel(pad.message_type, pad.note)}
                    extraText={pad.velocity_curve}
                    isSelected={selected?.kind === 'pad' && selected.index === padIdx}
                    isActive={activePads.has(padIdx)}
                    isListening={listenMode && activePads.has(padIdx)}
                    variant="pad"
                    ledSlot={LED_PAD_INDEX[padIdx]}
                    onClick={() => setSelected({ kind: 'pad', index: padIdx })}
                    onBrightness={handleLedBrightness}
                  />
                )
              })}
            </div>
          </div>

          {/* Row 7: Transport */}
          <span className="mk1-section-label">Transport</span>
          <div className="mk1-row-transport">
            {TRANSPORT_BUTTONS.map((id) => renderButton(id))}
          </div>
        </div>

        {/* ════════ Detail Editor Sidebar ════════ */}
        <DetailEditor
          selected={selected}
          midiMap={midiMap}
          onUpdate={handleUpdate}
          onTest={(el) => void testMutation.mutate(el)}
          isConnected={isConnected}
        />
      </div>
    </div>
  )
}

export default MaschineMidiMapPage
