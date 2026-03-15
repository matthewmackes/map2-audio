import { useEffect, useMemo, useState } from 'react'
import { CheckmarkFilled, Copy, Renew } from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { midiHubApi, type MidiHubRoute } from '../../../map2/api'
import { useToasts } from '../Toasts'

export type HubPort = {
  port_id: string
  name: string
  direction: string
  kind: string
}

type MapperState = {
  enabled: boolean
  input: string
  sourceMessage: string
  sourceChannelMin: number
  sourceChannelMax: number
  sourceValue1Min: number
  sourceValue1Max: number
  sourceValue2Min: number
  sourceValue2Max: number
  targetMessage: string
  targetChannelMin: number
  targetChannelMax: number
  targetValue1Min: number
  targetValue1Max: number
  targetValue2Min: number
  targetValue2Max: number
  follow: boolean
  invert: boolean
  curve: string
  keepOriginal: boolean
}

type PresetMessageMode = 'note_on' | 'note_off' | 'ctrl_change' | 'prog_change'

type ButtonBehaviorMode = 'change_preset' | 'all_notes_off'

type OperatorSettingsDraft = {
  settingsProduct: string
  settingsMidiInput: string
  settingsMidiOutput: string
  presetChangeEnabled: boolean
  presetChangeMessage: PresetMessageMode
  presetChangeChannel: number
  presetChangeBaseValue: number
  forwardPresetMessage: boolean
  buttonBehavior: ButtonBehaviorMode
  buttonShortPushChangesPreset: boolean
  manualFirmwareMode: boolean
  firmwarePath: string
}

const PRODUCT_OPTIONS = ['MAP2 Hub', 'Studio Bridge', 'Legacy DIN Rack', 'Browser + Network Rig']

const FILTER_MESSAGE_OPTIONS = [
  'Note On',
  'Note Off',
  'Ctrl Change',
  'Prog Change',
  'Pitch bend',
  'Aftertouch',
  'SysEx',
  'Clock',
  'MTC',
]

const MIDI_MESSAGES = [
  'Note On',
  'Note Off',
  'Ctrl Change',
  'Prog Change',
  'Pitch bend',
  'Channel Aftertouch',
  'Poly Aftertouch',
]

const CURVE_OPTIONS = ['Linear', 'Soft', 'Aggressive', 'Compressed', 'Expanded']

const defaultMapperState: MapperState = {
  enabled: false,
  input: 'Disable',
  sourceMessage: 'Note On',
  sourceChannelMin: 1,
  sourceChannelMax: 16,
  sourceValue1Min: 0,
  sourceValue1Max: 127,
  sourceValue2Min: 0,
  sourceValue2Max: 127,
  targetMessage: 'Ctrl Change',
  targetChannelMin: 1,
  targetChannelMax: 16,
  targetValue1Min: 1,
  targetValue1Max: 1,
  targetValue2Min: 0,
  targetValue2Max: 127,
  follow: true,
  invert: false,
  curve: 'Linear',
  keepOriginal: false,
}

const defaultSettingsDraft: OperatorSettingsDraft = {
  settingsProduct: PRODUCT_OPTIONS[0],
  settingsMidiInput: '',
  settingsMidiOutput: '',
  presetChangeEnabled: false,
  presetChangeMessage: 'ctrl_change',
  presetChangeChannel: 1,
  presetChangeBaseValue: 0,
  forwardPresetMessage: true,
  buttonBehavior: 'change_preset',
  buttonShortPushChangesPreset: true,
  manualFirmwareMode: true,
  firmwarePath: '',
}

function createInitialMappers(): MapperState[] {
  return Array.from({ length: 16 }).map(() => ({ ...defaultMapperState }))
}

export function readPorts(raw: unknown): HubPort[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row, index) => {
    const record = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    return {
      port_id: String(record.port_id ?? `port-${index}`),
      name: String(record.name ?? record.port_id ?? `Port ${index + 1}`),
      direction: String(record.direction ?? 'duplex'),
      kind: String(record.kind ?? 'virtual'),
    }
  })
}

function routePayloadFromExisting(route: MidiHubRoute, destinationPorts: string[]) {
  return {
    source_port: route.source_port,
    destination_ports: destinationPorts,
    enabled: route.enabled,
    priority: route.priority,
    route_type: route.route_type,
    filter: route.filter,
    transform_chain: route.transform_chain,
    latency_compensation_enabled: route.latency_compensation_enabled,
    destination_latency_ms: route.destination_latency_ms,
  }
}

function readStoredSettings(storageKey: string, legacyStorageKey?: string): OperatorSettingsDraft {
  const candidateKeys = legacyStorageKey ? [storageKey, legacyStorageKey] : [storageKey]
  for (const key of candidateKeys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<OperatorSettingsDraft>
      return {
        ...defaultSettingsDraft,
        ...parsed,
      }
    } catch {
      // Ignore malformed browser-local settings and fall through to defaults.
    }
  }
  return defaultSettingsDraft
}

export function MidiHubQuickRouterCard() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [selectedRouterSource, setSelectedRouterSource] = useState('')
  const [routerPortWindowOpen, setRouterPortWindowOpen] = useState(false)
  const [routerReservedPorts, setRouterReservedPorts] = useState<string[]>([])

  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'status'],
    queryFn: midiHubApi.getStatus,
    refetchInterval: 3000,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', 'routes'],
    queryFn: midiHubApi.getRoutes,
    refetchInterval: 3000,
  })

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data]
  )
  const routes = routesQuery.data?.routes ?? []
  const sourcePorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports]
  )
  const destinationPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports]
  )
  const routerSource = selectedRouterSource || sourcePorts[0]?.port_id || ''

  const routeToggleMutation = useMutation({
    mutationFn: async (params: { source: string; destination: string; active: boolean }) => {
      const matching = routes.filter(
        (route) => route.source_port === params.source && route.destination_ports.includes(params.destination)
      )

      if (params.active) {
        if (matching.some((route) => route.enabled)) {
          return
        }
        await midiHubApi.createRoute({
          source_port: params.source,
          destination_ports: [params.destination],
          enabled: true,
          priority: 100,
          route_type: 'pass_through',
          filter: { message_types: [], channels: [] },
          transform_chain: [],
        })
        return
      }

      for (const route of matching) {
        const nextDestinations = route.destination_ports.filter((destination) => destination !== params.destination)
        if (nextDestinations.length === 0) {
          await midiHubApi.deleteRoute(route.route_id)
        } else {
          await midiHubApi.updateRoute(route.route_id, routePayloadFromExisting(route, nextDestinations))
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'routes'] })
    },
    onError: () => pushToast('Failed to update routing', 'error'),
  })

  const resetRouterMutation = useMutation({
    mutationFn: async () => {
      for (const route of routes) {
        await midiHubApi.deleteRoute(route.route_id)
      }
    },
    onSuccess: () => {
      pushToast('Router reset complete', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'routes'] })
    },
    onError: () => pushToast('Failed to reset router', 'error'),
  })

  const clearRouterMutation = useMutation({
    mutationFn: async () => {
      for (const route of routes.filter((route) => route.enabled)) {
        await midiHubApi.disableRoute(route.route_id)
      }
    },
    onSuccess: () => {
      pushToast('Router cleared', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'routes'] })
    },
    onError: () => pushToast('Failed to clear router', 'error'),
  })

  const isRouteActive = (source: string, destination: string) =>
    routes.some((route) => route.enabled && route.source_port === source && route.destination_ports.includes(destination))

  return (
    <div className="midi-hub-workbench-card">
      <div className="midi-hub-workbench-card__header">
        <div>
          <h4>Quick router</h4>
          <p>Fast source-to-destination toggles for the first working path or a support rollback state.</p>
        </div>
        <div className="midi-hub-workbench-card__actions">
          <Button size="sm" kind="tertiary" onClick={() => setRouterPortWindowOpen((value) => !value)}>
            Port window
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => resetRouterMutation.mutate()}>
            Reset router
          </Button>
          <Button size="sm" kind="danger--ghost" onClick={() => clearRouterMutation.mutate()}>
            Disable active
          </Button>
        </div>
      </div>

      <div className="midi-hub-router-grid">
        <div className="midi-hub-mini-surface">
          <h5>Inputs</h5>
          <div className="midi-hub-router-list">
            {sourcePorts.length === 0 ? <p>No source ports available.</p> : null}
            {sourcePorts.map((port) => (
              <button
                key={port.port_id}
                type="button"
                className={`midi-hub-choice-pill ${routerSource === port.port_id ? 'is-active' : ''}`}
                onClick={() => setSelectedRouterSource(port.port_id)}
              >
                {port.name}
              </button>
            ))}
          </div>
        </div>

        <div className="midi-hub-mini-surface">
          <h5>Outputs</h5>
          <div className="midi-hub-router-checkbox-list">
            {destinationPorts.length === 0 ? <p>No destination ports available.</p> : null}
            {destinationPorts.map((port) => {
              const active = routerSource ? isRouteActive(routerSource, port.port_id) : false
              return (
                <label key={port.port_id} className="midi-hub-router-checkbox">
                  <Checkbox
                    id={`midi-hub-router-${port.port_id}`}
                    labelText={port.name}
                    checked={active}
                    onChange={(_, data) => {
                      if (!routerSource) return
                      routeToggleMutation.mutate({
                        source: routerSource,
                        destination: port.port_id,
                        active: data.checked,
                      })
                    }}
                  />
                  <span className="midi-hub-router-checkbox__meta">{port.kind}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      {routerPortWindowOpen ? (
        <div className="midi-hub-mini-surface">
          <h5>Reserved port window</h5>
          <p>Use this as an operator shortlist for the ports you intend to keep visible during setup or support.</p>
          <div className="midi-hub-choice-grid">
            {destinationPorts.map((port) => {
              const active = routerReservedPorts.includes(port.port_id)
              return (
                <button
                  key={port.port_id}
                  type="button"
                  className={`midi-hub-choice-pill ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    setRouterReservedPorts((previous) =>
                      previous.includes(port.port_id)
                        ? previous.filter((value) => value !== port.port_id)
                        : [...previous, port.port_id]
                    )
                  }}
                >
                  {port.name}
                </button>
              )
            })}
          </div>
          <div className="midi-hub-workbench-card__actions">
            <Button size="sm" kind="tertiary" onClick={() => setRouterReservedPorts([])}>
              Reset shortlist
            </Button>
            <Button
              size="sm"
              kind="primary"
              onClick={() => pushToast('Reserved port shortlist saved locally for this browser profile', 'success')}
            >
              Save shortlist
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MidiHubFilterPlannerCard() {
  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'status'],
    queryFn: midiHubApi.getStatus,
    refetchInterval: 3000,
  })

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data]
  )

  const [selectedFilterPort, setSelectedFilterPort] = useState('')
  const [filterChannels, setFilterChannels] = useState<number[]>([])
  const [filterMessages, setFilterMessages] = useState<string[]>([])

  const toggleChannel = (channel: number) => {
    setFilterChannels((previous) =>
      previous.includes(channel) ? previous.filter((value) => value !== channel) : [...previous, channel]
    )
  }

  const toggleMessageType = (messageType: string) => {
    setFilterMessages((previous) =>
      previous.includes(messageType)
        ? previous.filter((value) => value !== messageType)
        : [...previous, messageType]
    )
  }

  return (
    <div className="midi-hub-workbench-card">
      <div className="midi-hub-workbench-card__header">
        <div>
          <h4>Filter blueprint</h4>
          <p>Design what the destination should never see before you encode it in routes or scripts.</p>
        </div>
        <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={() => {
          setFilterChannels([])
          setFilterMessages([])
        }}>
          Reset
        </Button>
      </div>

      <Select
        id="midi-hub-filter-port"
        size="sm"
        labelText="Port focus"
        value={selectedFilterPort}
        onChange={(event) => setSelectedFilterPort(event.currentTarget.value)}
      >
        <SelectItem value="" text="All routes / all ports" />
        {ports.map((port) => (
          <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
        ))}
      </Select>

      <div className="midi-hub-choice-panel">
        <div>
          <h5>Channels</h5>
          <div className="midi-hub-choice-grid">
            {Array.from({ length: 16 }).map((_, index) => {
              const channel = index + 1
              const active = filterChannels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  className={`midi-hub-choice-pill ${active ? 'is-active' : ''}`}
                  onClick={() => toggleChannel(channel)}
                >
                  Ch {channel}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <h5>Message families</h5>
          <div className="midi-hub-choice-grid">
            {FILTER_MESSAGE_OPTIONS.map((message) => {
              const active = filterMessages.includes(message)
              return (
                <button
                  key={message}
                  type="button"
                  className={`midi-hub-choice-pill ${active ? 'is-active' : ''}`}
                  onClick={() => toggleMessageType(message)}
                >
                  {message}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Planning surface"
        subtitle="This card captures your filter intent locally so you can encode only the approved rules into routes, scripts, or macros."
      />
    </div>
  )
}

export function MidiHubMapperPlannerCard() {
  const [selectedMapperIndex, setSelectedMapperIndex] = useState(0)
  const [mappers, setMappers] = useState<MapperState[]>(() => createInitialMappers())

  const mapper = mappers[selectedMapperIndex]

  const setMapper = (patch: Partial<MapperState>) => {
    setMappers((previous) => {
      const next = [...previous]
      next[selectedMapperIndex] = {
        ...next[selectedMapperIndex],
        ...patch,
        enabled: true,
      }
      return next
    })
  }

  const resetSelectedMapper = () => {
    setMappers((previous) => {
      const next = [...previous]
      next[selectedMapperIndex] = { ...defaultMapperState }
      return next
    })
  }

  const resetAllMappers = () => {
    setMappers(createInitialMappers())
  }

  return (
    <div className="midi-hub-workbench-card">
      <div className="midi-hub-workbench-card__header">
        <div>
          <h4>Mapper blueprint</h4>
          <p>Stage source-to-target transforms before you commit them to a runtime script or device profile.</p>
        </div>
        <div className="midi-hub-workbench-card__actions">
          <Button size="sm" kind="tertiary" onClick={resetSelectedMapper}>
            Reset selected
          </Button>
          <Button size="sm" kind="danger--ghost" onClick={resetAllMappers}>
            Reset all
          </Button>
        </div>
      </div>

      <div className="midi-hub-mapper-list">
        {mappers.map((item, index) => {
          const active = selectedMapperIndex === index
          return (
            <button
              key={index}
              type="button"
              className={`midi-hub-choice-pill midi-hub-choice-pill--compact ${active ? 'is-active' : ''}`}
              onClick={() => setSelectedMapperIndex(index)}
            >
              {index + 1}
              {item.enabled ? <CheckmarkFilled size={12} className="midi-hub-mapper-dot" /> : null}
            </button>
          )
        })}
      </div>

      <Select
        id="midi-hub-mapper-input"
        size="sm"
        labelText="Source lane"
        value={mapper.input}
        onChange={(event) => setMapper({ input: event.currentTarget.value })}
      >
        <SelectItem value="Disable" text="Disable" />
        <SelectItem value="USB Host In" text="USB Host In" />
        <SelectItem value="USB Device In" text="USB Device In" />
        <SelectItem value="BLE In" text="BLE In" />
        <SelectItem value="DIN In" text="DIN In" />
        <SelectItem value="Web MIDI In" text="Web MIDI In" />
      </Select>

      <div className="midi-hub-mapper-grid">
        <div className="midi-hub-mini-surface">
          <h5>Source</h5>
          <div className="midi-hub-form-grid">
            <Select
              id="midi-hub-source-message"
              size="sm"
              labelText="Message"
              value={mapper.sourceMessage}
              onChange={(event) => setMapper({ sourceMessage: event.currentTarget.value })}
            >
              {MIDI_MESSAGES.map((message) => (
                <SelectItem key={message} value={message} text={message} />
              ))}
            </Select>
            <TextInput
              id="midi-hub-source-channel-min"
              size="sm"
              labelText="Channel min"
              type="number"
              value={String(mapper.sourceChannelMin)}
              onChange={(event) => setMapper({ sourceChannelMin: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-source-channel-max"
              size="sm"
              labelText="Channel max"
              type="number"
              value={String(mapper.sourceChannelMax)}
              onChange={(event) => setMapper({ sourceChannelMax: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-source-value1-min"
              size="sm"
              labelText="Value 1 min"
              type="number"
              value={String(mapper.sourceValue1Min)}
              onChange={(event) => setMapper({ sourceValue1Min: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-source-value1-max"
              size="sm"
              labelText="Value 1 max"
              type="number"
              value={String(mapper.sourceValue1Max)}
              onChange={(event) => setMapper({ sourceValue1Max: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-source-value2-min"
              size="sm"
              labelText="Value 2 min"
              type="number"
              value={String(mapper.sourceValue2Min)}
              onChange={(event) => setMapper({ sourceValue2Min: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-source-value2-max"
              size="sm"
              labelText="Value 2 max"
              type="number"
              value={String(mapper.sourceValue2Max)}
              onChange={(event) => setMapper({ sourceValue2Max: Number(event.currentTarget.value) })}
            />
          </div>
        </div>

        <div className="midi-hub-mini-surface">
          <h5>Target</h5>
          <div className="midi-hub-form-grid">
            <Select
              id="midi-hub-target-message"
              size="sm"
              labelText="Message"
              value={mapper.targetMessage}
              onChange={(event) => setMapper({ targetMessage: event.currentTarget.value })}
            >
              {MIDI_MESSAGES.concat('Filter Message').map((message) => (
                <SelectItem key={message} value={message} text={message} />
              ))}
            </Select>
            <TextInput
              id="midi-hub-target-channel-min"
              size="sm"
              labelText="Channel min"
              type="number"
              value={String(mapper.targetChannelMin)}
              onChange={(event) => setMapper({ targetChannelMin: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-target-channel-max"
              size="sm"
              labelText="Channel max"
              type="number"
              value={String(mapper.targetChannelMax)}
              onChange={(event) => setMapper({ targetChannelMax: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-target-value1-min"
              size="sm"
              labelText="Value 1 min"
              type="number"
              value={String(mapper.targetValue1Min)}
              onChange={(event) => setMapper({ targetValue1Min: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-target-value1-max"
              size="sm"
              labelText="Value 1 max"
              type="number"
              value={String(mapper.targetValue1Max)}
              onChange={(event) => setMapper({ targetValue1Max: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-target-value2-min"
              size="sm"
              labelText="Value 2 min"
              type="number"
              value={String(mapper.targetValue2Min)}
              onChange={(event) => setMapper({ targetValue2Min: Number(event.currentTarget.value) })}
            />
            <TextInput
              id="midi-hub-target-value2-max"
              size="sm"
              labelText="Value 2 max"
              type="number"
              value={String(mapper.targetValue2Max)}
              onChange={(event) => setMapper({ targetValue2Max: Number(event.currentTarget.value) })}
            />
          </div>

          <div className="midi-hub-checkbox-row">
            <Checkbox
              id="midi-hub-mapper-follow"
              labelText="Follow"
              checked={mapper.follow}
              onChange={(_, data) => setMapper({ follow: data.checked })}
            />
            <Checkbox
              id="midi-hub-mapper-invert"
              labelText="Invert"
              checked={mapper.invert}
              onChange={(_, data) => setMapper({ invert: data.checked })}
            />
            <Checkbox
              id="midi-hub-mapper-original"
              labelText="Keep original"
              checked={mapper.keepOriginal}
              onChange={(_, data) => setMapper({ keepOriginal: data.checked })}
            />
            <Select
              id="midi-hub-mapper-curve"
              size="sm"
              labelText="Curve"
              value={mapper.curve}
              onChange={(event) => setMapper({ curve: event.currentTarget.value })}
            >
              {CURVE_OPTIONS.map((curve) => (
                <SelectItem key={curve} value={curve} text={curve} />
              ))}
            </Select>
          </div>
        </div>
      </div>

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Draft transform lane"
        subtitle="Use these mapper lanes to design the transform contract you will implement in routes, scripts, macros, or device profiles."
      />
    </div>
  )
}

export function MidiHubOperatorProfileCard({
  storageKey,
  legacyStorageKey,
}: {
  storageKey: string
  legacyStorageKey?: string
}) {
  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'status'],
    queryFn: midiHubApi.getStatus,
    refetchInterval: 3000,
  })

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data]
  )
  const sourcePorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports]
  )
  const destinationPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports]
  )
  const { pushToast } = useToasts()

  const [settings, setSettings] = useState<OperatorSettingsDraft>(defaultSettingsDraft)
  const [deviceDumpRunning, setDeviceDumpRunning] = useState(false)
  const [deviceDumpText, setDeviceDumpText] = useState('')

  useEffect(() => {
    setSettings(readStoredSettings(storageKey, legacyStorageKey))
  }, [legacyStorageKey, storageKey])

  useEffect(() => {
    setSettings((previous) => {
      let changed = false
      let next = previous
      if (!previous.settingsMidiInput && sourcePorts[0]?.port_id) {
        next = { ...next, settingsMidiInput: sourcePorts[0].port_id }
        changed = true
      }
      if (!previous.settingsMidiOutput && destinationPorts[0]?.port_id) {
        next = { ...next, settingsMidiOutput: destinationPorts[0].port_id }
        changed = true
      }
      return changed ? next : previous
    })
  }, [destinationPorts, sourcePorts])

  const updateSettings = (patch: Partial<OperatorSettingsDraft>) => {
    setSettings((previous) => ({ ...previous, ...patch }))
  }

  const saveSettings = () => {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
    pushToast('Operator profile stored for this browser profile', 'success')
  }

  const runDeviceDump = () => {
    setDeviceDumpRunning(true)
    const inputLabel = sourcePorts.find((port) => port.port_id === settings.settingsMidiInput)?.name ?? 'Not selected'
    const outputLabel = destinationPorts.find((port) => port.port_id === settings.settingsMidiOutput)?.name ?? 'Not selected'
    const lines = [
      '# MAP2 MIDI Hub device intake report',
      `Profile: ${settings.settingsProduct}`,
      `Preferred input: ${inputLabel}`,
      `Preferred output: ${outputLabel}`,
      `Detected ports: ${ports.length}`,
      'Instructions: disconnect the problematic device, start the intake report, reconnect it directly, then copy this output into the support log.',
    ]
    setTimeout(() => {
      setDeviceDumpText(lines.join('\n'))
      setDeviceDumpRunning(false)
      pushToast('Device intake report prepared', 'success')
    }, 450)
  }

  const copyDeviceDump = async () => {
    try {
      await navigator.clipboard.writeText(deviceDumpText || '')
      pushToast('Device intake report copied', 'success')
    } catch {
      pushToast('Clipboard copy failed', 'error')
    }
  }

  return (
    <div className="midi-hub-workbench-card">
      <div className="midi-hub-workbench-card__header">
        <div>
          <h4>Operator profile and device intake</h4>
          <p>Store browser-local preferences, stage firmware intent, and capture support evidence for unknown devices.</p>
        </div>
        <Button size="sm" kind="primary" onClick={saveSettings}>
          Save profile
        </Button>
      </div>

      <div className="midi-hub-form-grid">
        <Select
          id="midi-hub-settings-product"
          size="sm"
          labelText="Rig profile"
          value={settings.settingsProduct}
          onChange={(event) => updateSettings({ settingsProduct: event.currentTarget.value })}
        >
          {PRODUCT_OPTIONS.map((product) => (
            <SelectItem key={product} value={product} text={product} />
          ))}
        </Select>
        <Select
          id="midi-hub-settings-input"
          size="sm"
          labelText="Preferred input"
          value={settings.settingsMidiInput}
          onChange={(event) => updateSettings({ settingsMidiInput: event.currentTarget.value })}
        >
          <SelectItem value="" text="Select input" />
          {sourcePorts.map((port) => (
            <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
          ))}
        </Select>
        <Select
          id="midi-hub-settings-output"
          size="sm"
          labelText="Preferred output"
          value={settings.settingsMidiOutput}
          onChange={(event) => updateSettings({ settingsMidiOutput: event.currentTarget.value })}
        >
          <SelectItem value="" text="Select output" />
          {destinationPorts.map((port) => (
            <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
          ))}
        </Select>
      </div>

      <div className="midi-hub-mini-surface">
        <h5>Preset recall posture</h5>
        <div className="midi-hub-checkbox-row">
          <Checkbox
            id="midi-hub-preset-change-enabled"
            labelText="Enable preset changes from incoming MIDI"
            checked={settings.presetChangeEnabled}
            onChange={(_, data) => updateSettings({ presetChangeEnabled: data.checked })}
          />
          <Checkbox
            id="midi-hub-preset-forward"
            labelText="Forward the triggering message downstream"
            checked={settings.forwardPresetMessage}
            onChange={(_, data) => updateSettings({ forwardPresetMessage: data.checked })}
          />
          <Checkbox
            id="midi-hub-preset-short-push"
            labelText="Use short push to change current preset"
            checked={settings.buttonShortPushChangesPreset}
            onChange={(_, data) => updateSettings({ buttonShortPushChangesPreset: data.checked })}
          />
        </div>
        <div className="midi-hub-form-grid">
          <Select
            id="midi-hub-preset-message"
            size="sm"
            labelText="Preset change message"
            value={settings.presetChangeMessage}
            onChange={(event) => updateSettings({ presetChangeMessage: event.currentTarget.value as PresetMessageMode })}
          >
            <SelectItem value="note_on" text="Note On" />
            <SelectItem value="note_off" text="Note Off" />
            <SelectItem value="ctrl_change" text="Ctrl Change" />
            <SelectItem value="prog_change" text="Program Change" />
          </Select>
          <TextInput
            id="midi-hub-preset-channel"
            size="sm"
            labelText="Channel"
            type="number"
            value={String(settings.presetChangeChannel)}
            onChange={(event) => updateSettings({ presetChangeChannel: Number(event.currentTarget.value) })}
          />
          <TextInput
            id="midi-hub-preset-base-value"
            size="sm"
            labelText="Base value"
            type="number"
            value={String(settings.presetChangeBaseValue)}
            onChange={(event) => updateSettings({ presetChangeBaseValue: Number(event.currentTarget.value) })}
          />
          <Select
            id="midi-hub-button-behavior"
            size="sm"
            labelText="Hardware button role"
            value={settings.buttonBehavior}
            onChange={(event) => updateSettings({ buttonBehavior: event.currentTarget.value as ButtonBehaviorMode })}
          >
            <SelectItem value="change_preset" text="Change current preset" />
            <SelectItem value="all_notes_off" text="Send all notes off" />
          </Select>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-workbench-card__header">
          <div>
            <h5>Firmware staging and support capture</h5>
            <p>Document the update mode and intended file now. Only execute runtime firmware work when the backend service explicitly supports it.</p>
          </div>
          <Tag type={settings.manualFirmwareMode ? 'warm-gray' : 'cool-gray'}>
            {settings.manualFirmwareMode ? 'Manual update' : 'Menu update'}
          </Tag>
        </div>
        <div className="midi-hub-checkbox-row">
          <Checkbox
            id="midi-hub-firmware-manual"
            labelText="Manual update"
            checked={settings.manualFirmwareMode}
            onChange={(_, data) => updateSettings({ manualFirmwareMode: data.checked })}
          />
          <Checkbox
            id="midi-hub-firmware-menu"
            labelText="Menu-driven update"
            checked={!settings.manualFirmwareMode}
            onChange={(_, data) => updateSettings({ manualFirmwareMode: !data.checked })}
          />
        </div>
        <TextInput
          id="midi-hub-firmware-path"
          size="sm"
          labelText="Firmware file"
          placeholder="/path/to/firmware.bin"
          value={settings.firmwarePath}
          onChange={(event) => updateSettings({ firmwarePath: event.currentTarget.value })}
        />
        <div className="midi-hub-workbench-card__actions">
          <Button size="sm" kind="tertiary" onClick={() => pushToast('Firmware staging note stored locally', 'info')}>
            Stage file
          </Button>
          <Button size="sm" kind="tertiary" disabled={deviceDumpRunning} onClick={runDeviceDump}>
            {deviceDumpRunning ? 'Preparing…' : 'Start intake report'}
          </Button>
          <Button size="sm" kind="ghost" renderIcon={Copy} onClick={copyDeviceDump}>
            Copy report
          </Button>
        </div>
        <TextArea
          id="midi-hub-device-dump"
          rows={6}
          labelText="Device intake report"
          value={deviceDumpText}
          onChange={(event) => setDeviceDumpText(event.currentTarget.value)}
          placeholder="USB descriptors and device intake notes"
        />
      </div>

      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title="Browser-local planning surface"
        subtitle="These settings help operators document intent and collect support evidence. Runtime routing, presets, scripts, and clock behavior are controlled by the live MIDI Hub panels."
      />
    </div>
  )
}
