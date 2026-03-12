import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { CheckmarkFilled, Copy, Edit, Plug, Save, TrashCan, Upload } from '@carbon/icons-react'
import { useToasts } from '../components/Toasts'
import { midiHubApi, type MidiHubRoute } from '../../map2/api'
import './MidiHub2Page.css'

type HubTabId = 'preset' | 'filter' | 'mapper' | 'router' | 'firmware' | 'settings'

type HubPort = {
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

const TAB_ORDER: Array<{ id: HubTabId; label: string }> = [
  { id: 'preset', label: 'Preset' },
  { id: 'filter', label: 'MIDI Filter' },
  { id: 'mapper', label: 'MIDI Mapper' },
  { id: 'router', label: 'MIDI Router' },
  { id: 'firmware', label: 'Firmware' },
  { id: 'settings', label: 'Settings' },
]

const PRODUCT_OPTIONS = ['H2MIDI Pro', 'H4MIDI WC', 'H12MIDI Pro', 'H24MIDI Pro']

const MIDI_MESSAGES = [
  'Note On',
  'Note Off',
  'Ctrl Change',
  'Prog Change',
  'Pitch bend',
  'Chann Aftertouch',
  'Key Aftertouch',
]

const FILTER_MESSAGE_OPTIONS = [
  'Note On',
  'Note Off',
  'Ctrl Change',
  'Prog Change',
  'Pitch bend',
  'Aftertouch',
  'SysEx',
  'Clock',
]

const CURVE_OPTIONS = ['Linear', 'User curve 1', 'User curve 2', 'User curve 3', 'User curve 4']

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

const SETTINGS_STORAGE_KEY = 'map2:midi-hub-2:settings:v1'

function getInitialMappers(): MapperState[] {
  return Array.from({ length: 16 }).map(() => ({ ...defaultMapperState }))
}

function readPorts(raw: unknown): HubPort[] {
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

function slugifyPresetName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'preset'
}

export function MidiHub2Page() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const [activeTab, setActiveTab] = useState<HubTabId>('preset')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetEditName, setPresetEditName] = useState('')
  const [selectedFilterPort, setSelectedFilterPort] = useState('')
  const [filterChannels, setFilterChannels] = useState<number[]>([])
  const [filterMessages, setFilterMessages] = useState<string[]>([])
  const [selectedMapperIndex, setSelectedMapperIndex] = useState(0)
  const [mappers, setMappers] = useState<MapperState[]>(() => getInitialMappers())
  const [selectedRouterSource, setSelectedRouterSource] = useState('')
  const [routerPortWindowOpen, setRouterPortWindowOpen] = useState(false)
  const [routerReservedPorts, setRouterReservedPorts] = useState<string[]>([])
  const [manualFirmwareMode, setManualFirmwareMode] = useState(true)
  const [firmwarePath, setFirmwarePath] = useState('')

  const [settingsProduct, setSettingsProduct] = useState(PRODUCT_OPTIONS[0])
  const [settingsMidiInput, setSettingsMidiInput] = useState('')
  const [settingsMidiOutput, setSettingsMidiOutput] = useState('')
  const [presetChangeEnabled, setPresetChangeEnabled] = useState(false)
  const [presetChangeMessage, setPresetChangeMessage] = useState<PresetMessageMode>('ctrl_change')
  const [presetChangeChannel, setPresetChangeChannel] = useState(1)
  const [presetChangeBaseValue, setPresetChangeBaseValue] = useState(0)
  const [forwardPresetMessage, setForwardPresetMessage] = useState(true)
  const [buttonBehavior, setButtonBehavior] = useState<ButtonBehaviorMode>('change_preset')
  const [buttonShortPushChangesPreset, setButtonShortPushChangesPreset] = useState(true)
  const [deviceDumpRunning, setDeviceDumpRunning] = useState(false)
  const [deviceDumpText, setDeviceDumpText] = useState('')

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

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', 'presets'],
    queryFn: midiHubApi.listPresets,
    refetchInterval: 4000,
  })

  const programSlotsQuery = useQuery({
    queryKey: ['midi-hub', 'program-slots'],
    queryFn: midiHubApi.getProgramSlots,
    refetchInterval: 5000,
  })

  const ports = useMemo(() => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports), [statusQuery.data])
  const sourcePorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports]
  )
  const destinationPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports]
  )

  const presets = presetsQuery.data?.presets ?? []
  const routes = routesQuery.data?.routes ?? []
  const slots = programSlotsQuery.data?.slots ?? {}

  const routerSource = selectedRouterSource || sourcePorts[0]?.port_id || ''

  const savePresetMutation = useMutation({
    mutationFn: async (name: string) => {
      const normalized = name.trim()
      const finalName = normalized || `Preset ${new Date().toLocaleString()}`
      return midiHubApi.savePreset({
        preset_id: `${slugifyPresetName(finalName)}-${Date.now().toString().slice(-6)}`,
        name: finalName.slice(0, 16),
        description: 'Saved from MIDI Hub-2 preset page',
      })
    },
    onSuccess: () => {
      setPresetEditName('')
      pushToast('Preset saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'presets'] })
    },
    onError: () => pushToast('Failed to save preset', 'error'),
  })

  const recallPresetMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.recallPreset(presetId),
    onSuccess: () => {
      pushToast('Preset recalled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
    },
    onError: () => pushToast('Failed to recall preset', 'error'),
  })

  const loadPresetMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.getPreset(presetId),
    onSuccess: (payload) => {
      if (!payload?.preset) {
        pushToast('Preset file could not be loaded', 'error')
        return
      }
      setPresetEditName(payload.preset.name.slice(0, 16))
      pushToast('Preset loaded into editor fields', 'success')
    },
    onError: () => pushToast('Failed to load preset', 'error'),
  })

  const setProgramSlotMutation = useMutation({
    mutationFn: async (params: { slot: number; target: string }) => midiHubApi.setProgramSlot(params.slot, params.target),
    onSuccess: () => {
      pushToast('Program slot saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'program-slots'] })
    },
    onError: () => pushToast('Failed to save slot', 'error'),
  })

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
      pushToast('Router cleared (disabled active routes)', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'routes'] })
    },
    onError: () => pushToast('Failed to clear router', 'error'),
  })

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
    setMappers(getInitialMappers())
  }

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

  const resetAllFilters = () => {
    setFilterChannels([])
    setFilterMessages([])
  }

  const settingsSave = () => {
    const payload = {
      settingsProduct,
      settingsMidiInput,
      settingsMidiOutput,
      presetChangeEnabled,
      presetChangeMessage,
      presetChangeChannel,
      presetChangeBaseValue,
      forwardPresetMessage,
      buttonBehavior,
      buttonShortPushChangesPreset,
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload))
    pushToast('Settings stored for this browser profile', 'success')
  }

  const runDeviceDump = () => {
    setDeviceDumpRunning(true)
    const lines = [
      '# HxMIDI Tools - Device dump',
      `Product: ${settingsProduct}`,
      `MIDI Input: ${settingsMidiInput || 'Not selected'}`,
      `MIDI Output: ${settingsMidiOutput || 'Not selected'}`,
      `Detected ports: ${ports.length}`,
      'Instructions: unplug all USB hubs/devices, click Start device dump, reconnect problematic device, copy output to support@cme-pro.com',
    ]
    setTimeout(() => {
      setDeviceDumpText(lines.join('\n'))
      setDeviceDumpRunning(false)
      pushToast('Device dump prepared', 'success')
    }, 450)
  }

  const copyDeviceDump = async () => {
    try {
      await navigator.clipboard.writeText(deviceDumpText || '')
      pushToast('Device descriptors copied', 'success')
    } catch {
      pushToast('Clipboard copy failed', 'error')
    }
  }

  const isRouteActive = (source: string, destination: string) =>
    routes.some((route) => route.enabled && route.source_port === source && route.destination_ports.includes(destination))

  const tabButton = (tab: { id: HubTabId; label: string }) => (
    <button
      key={tab.id}
      type="button"
      className={`midi-hub2-tab ${activeTab === tab.id ? 'is-active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  )

  return (
    <div className="stack midi-hub2-page">
      <Layer className="midi-hub2-hero">
        <div className="midi-hub2-hero-title-row">
          <Plug size={32} aria-hidden="true" className="midi-hub2-hero-icon" />
          <div>
            <h1 className="midi-hub2-hero-title">MIDI Hub-2</h1>
            <p className="midi-hub2-hero-subtitle">HxMIDI Tools-inspired workspace mapped to MAP2 services.</p>
          </div>
        </div>
      </Layer>

      <section className="midi-hub2-shell">
        <div className="midi-hub2-topbar">
          <div className="midi-hub2-product-line">
            <span className="midi-hub2-label">Product</span>
            <Select
              id="midi-hub2-product-select"
              size="sm"
              hideLabel
              labelText="Product"
              value={settingsProduct}
              onChange={(event) => setSettingsProduct(event.currentTarget.value)}
              className="midi-hub2-select-w-180"
            >
              {PRODUCT_OPTIONS.map((product) => (
                <SelectItem key={product} value={product} text={product} />
              ))}
            </Select>
          </div>

          <div className="midi-hub2-product-line">
            <span className="midi-hub2-label">MIDI Input</span>
            <Select
              id="midi-hub2-midi-input-select"
              size="sm"
              hideLabel
              labelText="MIDI input"
              value={settingsMidiInput}
              onChange={(event) => setSettingsMidiInput(event.currentTarget.value)}
              className="midi-hub2-select-w-180"
            >
              <SelectItem value="" text="Select input" />
              {sourcePorts.map((port) => (
                <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
              ))}
            </Select>
          </div>

          <div className="midi-hub2-product-line">
            <span className="midi-hub2-label">MIDI Output</span>
            <Select
              id="midi-hub2-midi-output-select"
              size="sm"
              hideLabel
              labelText="MIDI output"
              value={settingsMidiOutput}
              onChange={(event) => setSettingsMidiOutput(event.currentTarget.value)}
              className="midi-hub2-select-w-180"
            >
              <SelectItem value="" text="Select output" />
              {destinationPorts.map((port) => (
                <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
              ))}
            </Select>
          </div>

          <div className="midi-hub2-preset-indicator">
            <span className="midi-hub2-label">Select preset</span>
            <Select
              id="midi-hub2-active-preset-select"
              size="sm"
              hideLabel
              labelText="Active preset"
              value={selectedPresetId}
              onChange={(event) => {
                const nextId = event.currentTarget.value
                setSelectedPresetId(nextId)
                const preset = presets.find((entry) => entry.preset_id === nextId)
                setPresetEditName((preset?.name ?? '').slice(0, 16))
              }}
              className="midi-hub2-select-w-200"
            >
              <SelectItem value="" text="No preset" />
              {presets.map((preset) => (
                <SelectItem key={preset.preset_id} value={preset.preset_id} text={preset.name} />
              ))}
            </Select>
          </div>
        </div>

        <div className="midi-hub2-tab-row">
          {TAB_ORDER.map(tabButton)}
        </div>

        {activeTab === 'preset' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>Preset</h3>
              <Tag type="gray">{`${presets.length} presets`}</Tag>
            </div>

            <div className="midi-hub2-preset-grid">
              <div className="midi-hub2-box">
                <label className="midi-hub2-label" htmlFor="preset-name-input">Preset Name (16 chars max)</label>
                <div className="midi-hub2-inline">
                  <TextInput
                    id="preset-name-input"
                    size="sm"
                    hideLabel
                    labelText="Preset name"
                    className="midi-hub2-text-field is-full-width"
                    value={presetEditName}
                    onChange={(event) => setPresetEditName(event.currentTarget.value.slice(0, 16))}
                  />
                  <Button size="sm" kind="tertiary" renderIcon={Edit}>
                    Rename
                  </Button>
                </div>
                <div className="midi-hub2-inline">
                  <Button
                    size="sm"
                    kind="primary"
                    renderIcon={Save}
                    onClick={() => savePresetMutation.mutate(presetEditName)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    kind="tertiary"
                    onClick={() => {
                      if (selectedPresetId) {
                        loadPresetMutation.mutate(selectedPresetId)
                      }
                    }}
                  >
                    Load
                  </Button>
                  <Button
                    size="sm"
                    kind="tertiary"
                    onClick={() => {
                      if (selectedPresetId) {
                        recallPresetMutation.mutate(selectedPresetId)
                      }
                    }}
                  >
                    Recall
                  </Button>
                </div>
              </div>

              <div className="midi-hub2-box">
                <h4>View full settings</h4>
                <p>
                  Overview of filter, mapper, and router states for the current preset profile.
                </p>
                <div className="midi-hub2-inline">
                  <Tag type="gray">{`Filters active: ${filterChannels.length + filterMessages.length}`}</Tag>
                  <Tag type="gray">{`Mappers active: ${mappers.filter((item) => item.enabled).length}`}</Tag>
                  <Tag type="gray">{`Routes active: ${routes.filter((route) => route.enabled).length}`}</Tag>
                </div>
              </div>

              <div className="midi-hub2-box">
                <h4>Program slot map</h4>
                <p>
                  Assign MIDI Program Change values to saved presets for remote switching.
                </p>
                <div className="midi-hub2-slot-list">
                  {Array.from({ length: 8 }).map((_, slot) => {
                    const value = slots[String(slot)] ?? ''
                    return (
                      <div key={slot} className="midi-hub2-slot-row">
                        <span>P{slot}</span>
                        <Select
                          id={`midi-hub2-program-slot-${slot}`}
                          size="sm"
                          hideLabel
                          labelText={`Program slot ${slot}`}
                          value={value}
                          onChange={(event) => {
                            const target = event.currentTarget.value
                            if (!target) return
                            setProgramSlotMutation.mutate({ slot, target })
                          }}
                          className="midi-hub2-select-w-180"
                        >
                          <SelectItem value="" text="Unassigned" />
                          {presets.map((preset) => (
                            <SelectItem key={preset.preset_id} value={preset.preset_id} text={preset.name} />
                          ))}
                        </Select>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              className="midi-hub2-alert"
              title="Warning"
              subtitle="Reset all to factory defaults applies to filter, mapper, and router domains for the selected product."
            />
            <Button
              size="sm"
              kind="danger--tertiary"
              renderIcon={TrashCan}
              onClick={() => {
                resetAllFilters()
                resetAllMappers()
                pushToast('Reset all to factory defaults applied locally', 'info')
              }}
            >
              Reset all to factory defaults
            </Button>
          </div>
        ) : null}

        {activeTab === 'filter' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>MIDI Filter</h3>
              <div className="midi-hub2-inline">
                <Button size="sm" kind="tertiary" onClick={resetAllFilters}>Reset all filters</Button>
              </div>
            </div>

            <div className="midi-hub2-inline">
              <span className="midi-hub2-label">Input/Output</span>
              <Select
                id="midi-hub2-filter-port-select"
                size="sm"
                hideLabel
                labelText="Filter input or output port"
                value={selectedFilterPort}
                onChange={(event) => setSelectedFilterPort(event.currentTarget.value)}
                className="midi-hub2-select-w-320"
              >
                <SelectItem value="" text="Select input/output port" />
                {ports.map((port) => (
                  <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
                ))}
              </Select>
            </div>

            <div className="midi-hub2-filter-grid">
              <div className="midi-hub2-box">
                <h4>Channels</h4>
                <div className="midi-hub2-pill-grid">
                  {Array.from({ length: 16 }).map((_, index) => {
                    const channel = index + 1
                    const active = filterChannels.includes(channel)
                    return (
                      <button
                        key={channel}
                        type="button"
                        className={`midi-hub2-pill ${active ? 'is-active' : ''}`}
                        onClick={() => toggleChannel(channel)}
                      >
                        Ch {channel}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="midi-hub2-box">
                <h4>Message Types</h4>
                <div className="midi-hub2-pill-grid">
                  {FILTER_MESSAGE_OPTIONS.map((message) => {
                    const active = filterMessages.includes(message)
                    return (
                      <button
                        key={message}
                        type="button"
                        className={`midi-hub2-pill ${active ? 'is-active' : ''}`}
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
              className="midi-hub2-alert"
              title="Info"
              subtitle="Selected channels are blocked entirely. Selected message types are blocked on all channels."
            />
          </div>
        ) : null}

        {activeTab === 'mapper' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>MIDI Mapper</h3>
              <div className="midi-hub2-inline">
                <Button size="sm" kind="tertiary" onClick={resetSelectedMapper}>Reset selected mapper</Button>
                <Button size="sm" kind="danger--tertiary" onClick={resetAllMappers}>Reset all mappers</Button>
                <Button size="sm" kind="tertiary">Edit curves</Button>
              </div>
            </div>

            <div className="midi-hub2-mapper-buttons">
              {mappers.map((item, index) => {
                const active = selectedMapperIndex === index
                return (
                  <button
                    key={index}
                    type="button"
                    className={`midi-hub2-mapper-button ${active ? 'is-selected' : ''}`}
                    onClick={() => setSelectedMapperIndex(index)}
                  >
                    {index + 1}
                    {item.enabled ? <CheckmarkFilled size={12} className="midi-hub2-dot" /> : null}
                  </button>
                )
              })}
            </div>

            <div className="midi-hub2-inline">
              <span className="midi-hub2-label">Inputs</span>
              <Select
                id="midi-hub2-mapper-input-select"
                size="sm"
                hideLabel
                labelText="Mapper input"
                value={mapper.input}
                onChange={(event) => setMapper({ input: event.currentTarget.value })}
                className="midi-hub2-select-w-220"
              >
                <SelectItem value="Disable" text="Disable" />
                <SelectItem value="USB-A Host In" text="USB-A Host In" />
                <SelectItem value="USB-C Virtual In" text="USB-C Virtual In" />
                <SelectItem value="WIDICore BLE In" text="WIDICore BLE In" />
                <SelectItem value="MIDI In" text="MIDI In" />
              </Select>
            </div>

            <div className="midi-hub2-config-grid">
              <div className="midi-hub2-box">
                <h4>Config (Source)</h4>
                <div className="midi-hub2-row-grid">
                  <Select
                    id="midi-hub2-source-message-select"
                    size="sm"
                    hideLabel
                    labelText="Source message"
                    value={mapper.sourceMessage}
                    onChange={(event) => setMapper({ sourceMessage: event.currentTarget.value })}
                  >
                    {MIDI_MESSAGES.map((message) => (
                      <SelectItem key={message} value={message} text={message} />
                    ))}
                  </Select>
                  <TextInput
                    id="midi-hub2-source-channel-min"
                    size="sm"
                    labelText="Channel min"
                    type="number"
                    value={String(mapper.sourceChannelMin)}
                    onChange={(event) => setMapper({ sourceChannelMin: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-source-channel-max"
                    size="sm"
                    labelText="Channel max"
                    type="number"
                    value={String(mapper.sourceChannelMax)}
                    onChange={(event) => setMapper({ sourceChannelMax: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-source-value1-min"
                    size="sm"
                    labelText="Value 1 min"
                    type="number"
                    value={String(mapper.sourceValue1Min)}
                    onChange={(event) => setMapper({ sourceValue1Min: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-source-value1-max"
                    size="sm"
                    labelText="Value 1 max"
                    type="number"
                    value={String(mapper.sourceValue1Max)}
                    onChange={(event) => setMapper({ sourceValue1Max: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-source-value2-min"
                    size="sm"
                    labelText="Value 2 min"
                    type="number"
                    value={String(mapper.sourceValue2Min)}
                    onChange={(event) => setMapper({ sourceValue2Min: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-source-value2-max"
                    size="sm"
                    labelText="Value 2 max"
                    type="number"
                    value={String(mapper.sourceValue2Max)}
                    onChange={(event) => setMapper({ sourceValue2Max: Number(event.currentTarget.value) })}
                  />
                </div>
              </div>

              <div className="midi-hub2-box">
                <h4>Config (Target)</h4>
                <div className="midi-hub2-row-grid">
                  <Select
                    id="midi-hub2-target-message-select"
                    size="sm"
                    hideLabel
                    labelText="Target message"
                    value={mapper.targetMessage}
                    onChange={(event) => setMapper({ targetMessage: event.currentTarget.value })}
                  >
                    {MIDI_MESSAGES.concat('Filter Message').map((message) => (
                      <SelectItem key={message} value={message} text={message} />
                    ))}
                  </Select>
                  <TextInput
                    id="midi-hub2-target-channel-min"
                    size="sm"
                    labelText="Channel min"
                    type="number"
                    value={String(mapper.targetChannelMin)}
                    onChange={(event) => setMapper({ targetChannelMin: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-target-channel-max"
                    size="sm"
                    labelText="Channel max"
                    type="number"
                    value={String(mapper.targetChannelMax)}
                    onChange={(event) => setMapper({ targetChannelMax: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-target-value1-min"
                    size="sm"
                    labelText="Value 1 min"
                    type="number"
                    value={String(mapper.targetValue1Min)}
                    onChange={(event) => setMapper({ targetValue1Min: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-target-value1-max"
                    size="sm"
                    labelText="Value 1 max"
                    type="number"
                    value={String(mapper.targetValue1Max)}
                    onChange={(event) => setMapper({ targetValue1Max: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-target-value2-min"
                    size="sm"
                    labelText="Value 2 min"
                    type="number"
                    value={String(mapper.targetValue2Min)}
                    onChange={(event) => setMapper({ targetValue2Min: Number(event.currentTarget.value) })}
                  />
                  <TextInput
                    id="midi-hub2-target-value2-max"
                    size="sm"
                    labelText="Value 2 max"
                    type="number"
                    value={String(mapper.targetValue2Max)}
                    onChange={(event) => setMapper({ targetValue2Max: Number(event.currentTarget.value) })}
                  />
                </div>

                <div className="midi-hub2-inline midi-hub2-inline-spaced">
                  <Checkbox
                    id="mapper-follow-checkbox"
                    labelText="Follow"
                    checked={mapper.follow}
                    onChange={(_, data) => setMapper({ follow: data.checked })}
                  />
                  <Checkbox
                    id="mapper-invert-checkbox"
                    labelText="Invert"
                    checked={mapper.invert}
                    onChange={(_, data) => setMapper({ invert: data.checked })}
                  />
                  <Checkbox
                    id="mapper-keep-original-checkbox"
                    labelText="Keep original"
                    checked={mapper.keepOriginal}
                    onChange={(_, data) => setMapper({ keepOriginal: data.checked })}
                  />
                  <Select
                    id="midi-hub2-curve-select"
                    size="sm"
                    hideLabel
                    labelText="Curve"
                    value={mapper.curve}
                    onChange={(event) => setMapper({ curve: event.currentTarget.value })}
                    className="midi-hub2-select-w-160"
                  >
                    {CURVE_OPTIONS.map((curve) => (
                      <SelectItem key={curve} value={curve} text={curve} />
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'router' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>MIDI Router</h3>
              <div className="midi-hub2-inline">
                <Button size="sm" kind="tertiary" onClick={() => setRouterPortWindowOpen((value) => !value)}>
                  Port
                </Button>
                <Button size="sm" kind="tertiary" onClick={() => pushToast('USB-A Ports reservation window opened', 'info')}>
                  USB-A Ports reservation
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => resetRouterMutation.mutate()}>
                  Reset router
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => clearRouterMutation.mutate()}>
                  Clear router
                </Button>
              </div>
            </div>

            <div className="midi-hub2-router-layout">
              <div className="midi-hub2-router-column">
                <h4>Inputs</h4>
                <div className="midi-hub2-router-source-list">
                  {sourcePorts.map((port) => (
                    <button
                      key={port.port_id}
                      type="button"
                      className={`midi-hub2-source-button ${routerSource === port.port_id ? 'is-active' : ''}`}
                      onClick={() => setSelectedRouterSource(port.port_id)}
                    >
                      {port.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="midi-hub2-router-column">
                <h4>Outputs</h4>
                <div className="midi-hub2-router-destination-list">
                  {destinationPorts.map((port) => {
                    const active = routerSource ? isRouteActive(routerSource, port.port_id) : false
                    return (
                      <label key={port.port_id} className="midi-hub2-destination-item">
                        <Checkbox
                          id={`router-destination-${port.port_id}`}
                          hideLabel
                          labelText={`Route to ${port.name}`}
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
                        <span>{port.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {routerPortWindowOpen ? (
              <div className="midi-hub2-port-window">
                <h4>USB-A Port Window</h4>
                <p>Select enabled virtual USB-A ports for routing.</p>
                <div className="midi-hub2-port-window-grid">
                  {destinationPorts.map((port) => {
                    const active = routerReservedPorts.includes(port.port_id)
                    return (
                      <button
                        key={port.port_id}
                        type="button"
                        className={`midi-hub2-pill ${active ? 'is-active' : ''}`}
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
                <div className="midi-hub2-inline">
                  <Button size="sm" kind="tertiary" onClick={() => setRouterReservedPorts([])}>Reset</Button>
                  <Button
                    size="sm"
                    kind="primary"
                    onClick={() => pushToast('Apply ports reservation: profile saved', 'success')}
                  >
                    Apply ports reservation
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'firmware' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>Firmware</h3>
              <div className="midi-hub2-inline">
                <Tag type={manualFirmwareMode ? 'warm-gray' : 'gray'}>
                  {manualFirmwareMode ? 'Manual update' : 'Menu update'}
                </Tag>
              </div>
            </div>

            <div className="midi-hub2-inline">
              <Checkbox
                id="firmware-manual-update"
                labelText="Manual update"
                checked={manualFirmwareMode}
                onChange={(_, data) => setManualFirmwareMode(data.checked)}
              />
              <Checkbox
                id="firmware-menu-update"
                labelText="Menu update"
                checked={!manualFirmwareMode}
                onChange={(_, data) => setManualFirmwareMode(!data.checked)}
              />
            </div>

            <div className="midi-hub2-inline">
              <TextInput
                id="midi-hub2-firmware-file"
                size="sm"
                labelText="Firmware file"
                placeholder="/path/to/hxmidi-firmware.bin"
                value={firmwarePath}
                className="midi-hub2-text-field is-full-width"
                onChange={(event) => setFirmwarePath(event.currentTarget.value)}
              />
            </div>

            <div className="midi-hub2-inline">
              <Button
                size="sm"
                kind="tertiary"
                renderIcon={Upload}
                onClick={() => pushToast('Load firmware selected', 'info')}
              >
                Load firmware
              </Button>
              <Button
                size="sm"
                kind="primary"
                onClick={() => pushToast('Start upgrade requested', 'success')}
              >
                Start upgrade
              </Button>
              <Button
                size="sm"
                kind="danger--tertiary"
                onClick={() => pushToast('Restore official firmware requested', 'info')}
              >
                Restore official firmware
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab === 'settings' ? (
          <div className="midi-hub2-tab-panel">
            <div className="midi-hub2-panel-header">
              <h3>Settings</h3>
              <Button size="sm" kind="primary" onClick={settingsSave}>Save settings</Button>
            </div>

            <div className="midi-hub2-settings-grid">
              <div className="midi-hub2-box">
                <h4>Presets settings</h4>
                <Checkbox
                  id="settings-preset-change-enabled"
                  labelText="Enable changing preset from MIDI messages"
                  checked={presetChangeEnabled}
                  onChange={(_, data) => setPresetChangeEnabled(data.checked)}
                />
                <Checkbox
                  id="settings-forward-preset-message"
                  labelText="Forward message to MIDI/USB outputs"
                  checked={forwardPresetMessage}
                  onChange={(_, data) => setForwardPresetMessage(data.checked)}
                />
                <div className="midi-hub2-row-grid">
                  <Select
                    id="midi-hub2-preset-change-message"
                    size="sm"
                    hideLabel
                    labelText="Preset change message"
                    value={presetChangeMessage}
                    onChange={(event) => setPresetChangeMessage(event.currentTarget.value as PresetMessageMode)}
                  >
                    <SelectItem value="note_on" text="Note On" />
                    <SelectItem value="note_off" text="Note Off" />
                    <SelectItem value="ctrl_change" text="Ctrl Change" />
                    <SelectItem value="prog_change" text="Prog Change" />
                  </Select>
                  <TextInput
                    id="midi-hub2-preset-change-channel"
                    size="sm"
                    labelText="Channel"
                    type="number"
                    value={String(presetChangeChannel)}
                    onChange={(event) => setPresetChangeChannel(Number(event.currentTarget.value))}
                  />
                  <TextInput
                    id="midi-hub2-preset-change-base-value"
                    size="sm"
                    labelText="Base value"
                    type="number"
                    value={String(presetChangeBaseValue)}
                    onChange={(event) => setPresetChangeBaseValue(Number(event.currentTarget.value))}
                  />
                </div>
              </div>

              <div className="midi-hub2-box">
                <h4>Button</h4>
                <Select
                  id="midi-hub2-button-behavior-select"
                  size="sm"
                  hideLabel
                  labelText="Button behavior"
                  value={buttonBehavior}
                  onChange={(event) => setButtonBehavior(event.currentTarget.value as ButtonBehaviorMode)}
                  className="midi-hub2-select-w-240"
                >
                  <SelectItem value="change_preset" text="Change current preset" />
                  <SelectItem value="all_notes_off" text="Send all notes off" />
                </Select>
                <Checkbox
                  id="settings-short-push-preset"
                  labelText="Use short push to change current preset"
                  checked={buttonShortPushChangesPreset}
                  onChange={(_, data) => setButtonShortPushChangesPreset(data.checked)}
                />
              </div>

              <div className="midi-hub2-box">
                <h4>Device</h4>
                <p>
                  Start device dump, then connect unrecognized USB device and copy descriptors for support.
                </p>
                <div className="midi-hub2-inline">
                  <Button size="sm" kind="primary" disabled={deviceDumpRunning} onClick={runDeviceDump}>
                    {deviceDumpRunning ? 'Dumping...' : 'Start device dump'}
                  </Button>
                  <Button size="sm" kind="tertiary" renderIcon={Copy} onClick={copyDeviceDump}>
                    Copy
                  </Button>
                </div>
                <TextArea
                  id="midi-hub2-device-dump-output"
                  rows={6}
                  hideLabel
                  labelText="Device dump output"
                  className="midi-hub2-text-field is-full-width"
                  value={deviceDumpText}
                  onChange={(event) => setDeviceDumpText(event.currentTarget.value)}
                  placeholder="USB descriptors output"
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
