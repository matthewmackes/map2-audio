import { useEffect, useState } from 'react'
import { Accordion, AccordionItem, Button, NumberInput, Select, SelectItem, Tag, TextInput, Toggle } from '@carbon/react'
import { useToasts } from '../Toasts'

const STORAGE_KEY = 'map2-midi-hub-message-mappers'
const MESSAGE_TYPES = ['note_on', 'note_off', 'control_change', 'program_change', 'pitch_bend']
const CURVE_OPTIONS = ['linear', 'log', 'exp', 's_curve']

type MapperSlot = {
  slotId: string
  enabled: boolean
  sourcePort: string
  messageType: string
  channelMin: number
  channelMax: number
  valueMin: number
  valueMax: number
  target: string
  curve: string
}

function createDefaultSlot(index: number): MapperSlot {
  return {
    slotId: `mapper-${index + 1}`,
    enabled: false,
    sourcePort: 'USB Host In',
    messageType: 'control_change',
    channelMin: 1,
    channelMax: 16,
    valueMin: 0,
    valueMax: 127,
    target: '',
    curve: 'linear',
  }
}

function createDefaultSlots(): MapperSlot[] {
  return Array.from({ length: 16 }, (_, index) => createDefaultSlot(index))
}

function parseNumber(event: { currentTarget?: { value?: string } }, fallback: number, min: number, max: number) {
  const parsed = Number(event.currentTarget?.value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function MidiHubMessageMapper() {
  const { pushToast } = useToasts()
  const [slots, setSlots] = useState<MapperSlot[]>(createDefaultSlots)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length === 16) {
        setSlots(parsed as MapperSlot[])
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
  }, [slots])

  const updateSlot = (index: number, patch: Partial<MapperSlot>) => {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index
          ? {
              ...slot,
              ...patch,
            }
          : slot,
      ),
    )
  }

  return (
    <div className="midi-hub-processing-stack">
      <div className="midi-hub-processing-toolbar">
        <Tag type="blue">16 mapper slots</Tag>
        <Button size="sm" kind="ghost" onClick={() => setSlots(createDefaultSlots())}>
          Reset all mappers
        </Button>
      </div>
      <Accordion align="start">
        {slots.map((slot, index) => (
          <AccordionItem key={slot.slotId} title={
            <div className="midi-hub-processing-accordion-heading">
              <span>{`Slot ${index + 1}`}</span>
              <Tag type={slot.enabled ? 'green' : 'cool-gray'}>{slot.enabled ? slot.target || 'Configured' : 'Disabled'}</Tag>
            </div>
          }>
            <div className="midi-hub-processing-stack">
              <div className="midi-hub-processing-form-grid">
                <TextInput id={`${slot.slotId}-target`} labelText="Target" value={slot.target} onChange={(event) => updateSlot(index, { target: event.currentTarget.value, enabled: true })} />
                <Select id={`${slot.slotId}-source`} labelText="Source lane" value={slot.sourcePort} onChange={(event) => updateSlot(index, { sourcePort: event.currentTarget.value, enabled: true })}>
                  <SelectItem value="USB Host In" text="USB Host In" />
                  <SelectItem value="USB Device In" text="USB Device In" />
                  <SelectItem value="BLE In" text="BLE In" />
                  <SelectItem value="DIN In" text="DIN In" />
                  <SelectItem value="Web MIDI In" text="Web MIDI In" />
                </Select>
                <Select id={`${slot.slotId}-message`} labelText="Message type" value={slot.messageType} onChange={(event) => updateSlot(index, { messageType: event.currentTarget.value, enabled: true })}>
                  {MESSAGE_TYPES.map((messageType) => (
                    <SelectItem key={messageType} value={messageType} text={messageType} />
                  ))}
                </Select>
                <Select id={`${slot.slotId}-curve`} labelText="Curve" value={slot.curve} onChange={(event) => updateSlot(index, { curve: event.currentTarget.value, enabled: true })}>
                  {CURVE_OPTIONS.map((curve) => (
                    <SelectItem key={curve} value={curve} text={curve} />
                  ))}
                </Select>
                <NumberInput id={`${slot.slotId}-channel-min`} label="Channel min" min={1} max={16} value={slot.channelMin} onChange={(event) => updateSlot(index, { channelMin: parseNumber(event, slot.channelMin, 1, 16), enabled: true })} />
                <NumberInput id={`${slot.slotId}-channel-max`} label="Channel max" min={1} max={16} value={slot.channelMax} onChange={(event) => updateSlot(index, { channelMax: parseNumber(event, slot.channelMax, 1, 16), enabled: true })} />
                <NumberInput id={`${slot.slotId}-value-min`} label="Value min" min={0} max={127} value={slot.valueMin} onChange={(event) => updateSlot(index, { valueMin: parseNumber(event, slot.valueMin, 0, 127), enabled: true })} />
                <NumberInput id={`${slot.slotId}-value-max`} label="Value max" min={0} max={127} value={slot.valueMax} onChange={(event) => updateSlot(index, { valueMax: parseNumber(event, slot.valueMax, 0, 127), enabled: true })} />
              </div>
              <div className="midi-hub-processing-toolbar">
                <Toggle id={`${slot.slotId}-enabled`} labelText="Enabled" labelA="Off" labelB="On" toggled={slot.enabled} onToggle={(next) => updateSlot(index, { enabled: next })} />
                <Button size="sm" kind="secondary" onClick={() => pushToast(`Mapper slot ${index + 1} saved`, 'success')}>
                  Save slot
                </Button>
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  onClick={() => {
                    setSlots((current) => current.map((entry, entryIndex) => (entryIndex === index ? createDefaultSlot(index) : entry)))
                    pushToast(`Mapper slot ${index + 1} cleared`, 'info')
                  }}
                >
                  Clear slot
                </Button>
              </div>
            </div>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
