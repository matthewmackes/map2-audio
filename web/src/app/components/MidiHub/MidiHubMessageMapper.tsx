import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Accordion, AccordionItem, Button, NumberInput, Select, SelectItem, Tag } from '@carbon/react'
import { midiHubApi, type MidiHubMessageMapperSlot } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useMidiHubOverview } from './useMidiHubOverview'
import { useToasts } from '../Toasts'

const MESSAGE_TYPES = [
  { value: 'control_change', label: 'Control Change' },
  { value: 'note_on', label: 'Note On' },
  { value: 'note_off', label: 'Note Off' },
  { value: 'program_change', label: 'Program Change' },
  { value: 'pitchbend', label: 'Pitch Bend' },
] as const

const CURVE_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
  { value: 'exp', label: 'Exp' },
  { value: 's_curve', label: 'S-Curve' },
  { value: 'reverse', label: 'Reverse' },
] as const

type PortOption = {
  id: string
  label: string
}

function parseNumber(event: { currentTarget?: { value?: string } }, fallback: number, min: number, max: number) {
  const parsed = Number(event.currentTarget?.value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function replaceConfigFields(serverSlot: MidiHubMessageMapperSlot, localSlot: MidiHubMessageMapperSlot) {
  return {
    ...serverSlot,
    enabled: localSlot.enabled,
    source_port: localSlot.source_port,
    message_type: localSlot.message_type,
    channel_min: localSlot.channel_min,
    channel_max: localSlot.channel_max,
    value_min: localSlot.value_min,
    value_max: localSlot.value_max,
    target: localSlot.target,
    curve: localSlot.curve,
  }
}

function buildPortOptions(
  livePorts: Array<{ port_id: string; name: string }>,
  extraValues: string[],
  fallbackPrefix: string,
) {
  const options = new Map<string, string>()
  livePorts.forEach((port) => {
    options.set(port.port_id, `${port.name} (${port.port_id})`)
  })
  extraValues
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      if (!options.has(value)) {
        options.set(value, `${fallbackPrefix}: ${value}`)
      }
    })
  return Array.from(options.entries()).map<PortOption>(([id, label]) => ({ id, label }))
}

export function MidiHubMessageMapper() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { inputPorts, outputPorts } = useMidiHubOverview(nodeId, scopeKey)
  const [slots, setSlots] = useState<MidiHubMessageMapperSlot[]>([])
  const [dirtySlots, setDirtySlots] = useState<Record<string, boolean>>({})

  const slotsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'message-mappers'],
    queryFn: () => midiHubApi.listMessageMapperSlots(nodeId),
    refetchInterval: 2000,
  })

  useEffect(() => {
    const serverSlots = slotsQuery.data?.slots ?? []
    setSlots((current) => {
      const currentById = new Map(current.map((slot) => [slot.slot_id, slot]))
      return serverSlots.map((serverSlot) => {
        const localSlot = currentById.get(serverSlot.slot_id)
        if (localSlot && dirtySlots[serverSlot.slot_id]) {
          return replaceConfigFields(serverSlot, localSlot)
        }
        return serverSlot
      })
    })
  }, [dirtySlots, slotsQuery.data?.slots])

  const sourcePortOptions = useMemo(
    () => buildPortOptions(inputPorts, slots.map((slot) => slot.source_port), 'Unavailable input'),
    [inputPorts, slots],
  )
  const destinationPortOptions = useMemo(
    () => buildPortOptions(outputPorts, slots.map((slot) => slot.target), 'Unavailable destination'),
    [outputPorts, slots],
  )

  const invalidateSlots = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'message-mappers'] })

  const updateSlot = (slotId: string, patch: Partial<MidiHubMessageMapperSlot>) => {
    setSlots((current) =>
      current.map((slot) => (slot.slot_id === slotId ? { ...slot, ...patch } : slot)),
    )
    setDirtySlots((current) => ({ ...current, [slotId]: true }))
  }

  const saveSlot = useMutation({
    mutationFn: async (slot: MidiHubMessageMapperSlot) =>
      midiHubApi.updateMessageMapperSlot(
        slot.slot_id,
        {
          enabled: slot.enabled,
          source_port: slot.source_port,
          message_type: slot.message_type,
          channel_min: slot.channel_min,
          channel_max: slot.channel_max,
          value_min: slot.value_min,
          value_max: slot.value_max,
          target: slot.target,
          curve: slot.curve,
        },
        nodeId,
      ),
    onSuccess: async (_payload, slot) => {
      setDirtySlots((current) => {
        const next = { ...current }
        delete next[slot.slot_id]
        return next
      })
      pushToast(`Saved ${slot.slot_id}`, 'success')
      await invalidateSlots()
    },
    onError: () => pushToast('Failed to save mapper slot', 'error'),
  })

  const clearSlot = useMutation({
    mutationFn: async (slotId: string) => midiHubApi.clearMessageMapperSlot(slotId, nodeId),
    onSuccess: async (_payload, slotId) => {
      setDirtySlots((current) => {
        const next = { ...current }
        delete next[slotId]
        return next
      })
      pushToast(`Cleared ${slotId}`, 'info')
      await invalidateSlots()
    },
    onError: () => pushToast('Failed to clear mapper slot', 'error'),
  })

  const resetSlots = useMutation({
    mutationFn: async () => midiHubApi.resetMessageMapperSlots(nodeId),
    onSuccess: async () => {
      setDirtySlots({})
      pushToast('Reset all mapper slots', 'info')
      await invalidateSlots()
    },
    onError: () => pushToast('Failed to reset mapper slots', 'error'),
  })

  return (
    <div className="midi-hub-processing-stack">
      <div className="midi-hub-processing-toolbar">
        <Tag type="blue">16 node-backed slots</Tag>
        <Tag type="cool-gray">{`Inputs ${sourcePortOptions.length}`}</Tag>
        <Tag type="cool-gray">{`Destinations ${destinationPortOptions.length}`}</Tag>
        <Button size="sm" kind="ghost" onClick={() => resetSlots.mutate()}>
          Reset all mappers
        </Button>
      </div>
      <Accordion align="start">
        {slots.map((slot, index) => {
          const canSave = !slot.enabled || slot.target.trim().length > 0
          const telemetryLabel =
            slot.match_count > 0
              ? `${slot.match_count} live match${slot.match_count === 1 ? '' : 'es'}`
              : 'No live matches'

          return (
            <AccordionItem
              key={slot.slot_id}
              title={
                <div className="midi-hub-processing-accordion-heading">
                  <span>{`Slot ${index + 1}`}</span>
                  <Tag type={slot.enabled ? 'green' : 'cool-gray'}>
                    {slot.enabled ? slot.target || 'Awaiting destination' : 'Disabled'}
                  </Tag>
                  <Tag type={slot.match_count > 0 ? 'blue' : 'cool-gray'}>{telemetryLabel}</Tag>
                </div>
              }
            >
              <div className="midi-hub-processing-stack">
                <div className="midi-hub-processing-form-grid">
                  <Select
                    id={`${slot.slot_id}-source`}
                    labelText="Source port"
                    value={slot.source_port}
                    onChange={(event) => updateSlot(slot.slot_id, { source_port: event.currentTarget.value })}
                  >
                    <SelectItem value="" text="Any input port" />
                    {sourcePortOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id} text={option.label} />
                    ))}
                  </Select>
                  <Select
                    id={`${slot.slot_id}-target`}
                    labelText="Destination port"
                    value={slot.target}
                    onChange={(event) => updateSlot(slot.slot_id, { target: event.currentTarget.value, enabled: true })}
                  >
                    <SelectItem value="" text="Select destination" />
                    {destinationPortOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id} text={option.label} />
                    ))}
                  </Select>
                  <Select
                    id={`${slot.slot_id}-message`}
                    labelText="Message type"
                    value={slot.message_type}
                    onChange={(event) => updateSlot(slot.slot_id, { message_type: event.currentTarget.value, enabled: true })}
                  >
                    {MESSAGE_TYPES.map((messageType) => (
                      <SelectItem key={messageType.value} value={messageType.value} text={messageType.label} />
                    ))}
                  </Select>
                  <Select
                    id={`${slot.slot_id}-curve`}
                    labelText="Mapping curve"
                    value={slot.curve}
                    onChange={(event) => updateSlot(slot.slot_id, { curve: event.currentTarget.value, enabled: true })}
                  >
                    {CURVE_OPTIONS.map((curve) => (
                      <SelectItem key={curve.value} value={curve.value} text={curve.label} />
                    ))}
                  </Select>
                  <NumberInput
                    id={`${slot.slot_id}-channel-min`}
                    label="Channel min"
                    min={1}
                    max={16}
                    value={slot.channel_min}
                    onChange={(event) => updateSlot(slot.slot_id, { channel_min: parseNumber(event, slot.channel_min, 1, 16), enabled: true })}
                  />
                  <NumberInput
                    id={`${slot.slot_id}-channel-max`}
                    label="Channel max"
                    min={1}
                    max={16}
                    value={slot.channel_max}
                    onChange={(event) => updateSlot(slot.slot_id, { channel_max: parseNumber(event, slot.channel_max, 1, 16), enabled: true })}
                  />
                  <NumberInput
                    id={`${slot.slot_id}-value-min`}
                    label="Output value min"
                    min={0}
                    max={127}
                    value={slot.value_min}
                    onChange={(event) => updateSlot(slot.slot_id, { value_min: parseNumber(event, slot.value_min, 0, 127), enabled: true })}
                  />
                  <NumberInput
                    id={`${slot.slot_id}-value-max`}
                    label="Output value max"
                    min={0}
                    max={127}
                    value={slot.value_max}
                    onChange={(event) => updateSlot(slot.slot_id, { value_max: parseNumber(event, slot.value_max, 0, 127), enabled: true })}
                  />
                </div>
                <div className="midi-hub-processing-toolbar">
                  <Tag type="cool-gray">
                    {slot.source_port ? `Scoped to ${slot.source_port}` : 'Listens on any input port'}
                  </Tag>
                  <Tag type="cool-gray">
                    {slot.last_source_port ? `Last source ${slot.last_source_port}` : 'No source hit yet'}
                  </Tag>
                </div>
                <div className="midi-hub-processing-stack">
                  <div className="midi-hub-record-meta">
                    {slot.last_event_hex ? `Last input ${slot.last_event_hex}` : 'No matched input has been captured yet.'}
                  </div>
                  <div className="midi-hub-record-meta">
                    {slot.last_output_hex ? `Last output ${slot.last_output_hex}` : 'No mapped output has been emitted yet.'}
                  </div>
                  {slot.last_error ? <div className="midi-hub-record-meta">{`Last error ${slot.last_error}`}</div> : null}
                </div>
                <div className="midi-hub-processing-toolbar">
                  <Button
                    size="sm"
                    kind="primary"
                    disabled={!canSave}
                    onClick={() => saveSlot.mutate(slot)}
                  >
                    Save slot
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => updateSlot(slot.slot_id, { enabled: !slot.enabled })}
                  >
                    {slot.enabled ? 'Disable slot' : 'Enable slot'}
                  </Button>
                  <Button
                    size="sm"
                    kind="danger--tertiary"
                    onClick={() => clearSlot.mutate(slot.slot_id)}
                  >
                    Clear slot
                  </Button>
                </div>
              </div>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
