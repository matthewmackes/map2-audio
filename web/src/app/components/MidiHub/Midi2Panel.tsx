import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useMidiHubOverview } from './useMidiHubOverview'
import { useToasts } from '../Toasts'

const DEVICE_HEADERS = [
  { key: 'device', header: 'Device' },
  { key: 'profiles', header: 'Profiles' },
  { key: 'properties', header: 'Property Exchange' },
]

function formatTransportFailure(reason?: string | null) {
  if (!reason) return 'Transport request failed'
  return reason.replace(/_/g, ' ')
}

function parsePropertyValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed.length) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function parseInquiryTarget(value: string) {
  const trimmed = value.trim()
  if (!trimmed.length) return 0
  const parsed = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? Number.parseInt(trimmed, 16)
    : Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(127, parsed))
}

function parseUmpWords(value: string) {
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, part.startsWith('0x') || part.startsWith('0X') ? 16 : 10))
    .filter((word) => Number.isFinite(word))
}

function formatProfileDetailPreview(details?: Record<string, { profile_id: string; inquiry_target: number; data_hex: string; data_text?: string | null; data?: unknown }>) {
  const entries = Object.values(details ?? {})
  if (!entries.length) return null
  const latest = entries[entries.length - 1]
  let preview = latest.data_text?.trim()
  if (!preview && typeof latest.data === 'string') {
    preview = latest.data
  }
  if (!preview) {
    preview = latest.data_hex
  }
  return `Profile detail ${latest.profile_id} @0x${latest.inquiry_target.toString(16).padStart(2, '0').toUpperCase()} ${preview}`.trim()
}

function formatSubscriptionPreview(subscriptions?: Record<string, { resource?: string | null; res_id?: string | null; active: boolean; pending_refresh?: boolean }>) {
  const entries = Object.entries(subscriptions ?? {}).filter(([, subscription]) => subscription?.active !== false)
  if (!entries.length) return null
  return entries
    .map(([subscribeId, subscription]) => {
      const resourceLabel = subscription.res_id ? `${subscription.resource}#${subscription.res_id}` : subscription.resource || 'resource'
      return `${subscribeId}:${resourceLabel}${subscription.pending_refresh ? ' (refresh pending)' : ''}`
    })
    .join(' · ')
}

function formatDeviceOption(device: {
  device_id: string
  remote_muid?: string | null
  manufacturer_id?: string | null
}) {
  const suffix = device.remote_muid ? `MUID ${device.remote_muid}` : device.manufacturer_id ?? 'Pending reply'
  return `${device.device_id} · ${suffix}`
}

export function Midi2Panel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { inputPorts, outputPorts } = useMidiHubOverview(nodeId, scopeKey)

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'midi2-status'],
    queryFn: () => midiHubApi.getMidi2Status(nodeId),
    refetchInterval: 3000,
  })

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'network-sessions'],
    queryFn: () => midiHubApi.listNetworkSessions(nodeId),
    refetchInterval: 3000,
  })

  const [enabled, setEnabled] = useState(false)
  const [protocol, setProtocol] = useState<'midi1' | 'midi2'>('midi1')
  const [bindingTransport, setBindingTransport] = useState<'none' | 'port' | 'network_session'>('none')
  const [bindingTargetId, setBindingTargetId] = useState('')
  const [bindingResponsePort, setBindingResponsePort] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [profileId, setProfileId] = useState('7E 00 00 00 00')
  const [profileDetailTarget, setProfileDetailTarget] = useState('0')
  const [propertyResource, setPropertyResource] = useState('ResourceList')
  const [propertyResId, setPropertyResId] = useState('')
  const [propertyValue, setPropertyValue] = useState('"Init"')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [midiHex, setMidiHex] = useState('90 3C 64')
  const [umpWords, setUmpWords] = useState('')
  const [umpInspection, setUmpInspection] = useState('')
  const [hydratedConfig, setHydratedConfig] = useState(false)

  const devices = statusQuery.data?.devices ?? []
  const networkSessions = sessionsQuery.data?.sessions ?? []
  const listenSessions = networkSessions.filter((session) => session.mode === 'listen')
  const selectedDevice = devices.find((device) => device.device_id === deviceId) ?? null

  useEffect(() => {
    if (hydratedConfig || !statusQuery.data) return
    setEnabled(Boolean(statusQuery.data.enabled))
    setProtocol(statusQuery.data.default_protocol === 'midi2' ? 'midi2' : 'midi1')
    setBindingTransport(
      statusQuery.data.binding?.transport === 'port'
        ? 'port'
        : statusQuery.data.binding?.transport === 'network_session'
          ? 'network_session'
          : 'none',
    )
    setBindingTargetId(statusQuery.data.binding?.target_id ?? '')
    setBindingResponsePort(statusQuery.data.binding?.response_port ?? '')
    if (statusQuery.data.devices[0]?.device_id) {
      setDeviceId(statusQuery.data.devices[0].device_id)
    }
    setHydratedConfig(true)
  }, [hydratedConfig, statusQuery.data])

  useEffect(() => {
    if (!devices.length) {
      setDeviceId('')
      return
    }
    if (!devices.some((device) => device.device_id === deviceId)) {
      setDeviceId(devices[0].device_id)
    }
  }, [deviceId, devices])

  useEffect(() => {
    const activeSubscriptions = Object.entries(selectedDevice?.subscriptions ?? {}).filter(([, subscription]) => subscription?.active !== false)
    if (!activeSubscriptions.length) {
      setSubscriptionId('')
      return
    }
    if (!activeSubscriptions.some(([subscribeId]) => subscribeId === subscriptionId)) {
      setSubscriptionId(activeSubscriptions[0][0])
    }
  }, [selectedDevice, subscriptionId])

  useEffect(() => {
    if (bindingTransport !== 'network_session') return
    if (!listenSessions.some((session) => session.session_id === bindingTargetId)) {
      setBindingTargetId('')
    }
  }, [bindingTargetId, bindingTransport, listenSessions])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'midi2-status'] })
  const bindingReady = bindingTransport !== 'none' && bindingTargetId.trim().length > 0
  const deviceReady = Boolean(selectedDevice?.device_id)
  const profileReady = deviceReady && profileId.trim().length > 0
  const propertyReady = deviceReady && propertyResource.trim().length > 0
  const profileDetailPreview = formatProfileDetailPreview(selectedDevice?.profile_details)
  const subscriptionPreview = formatSubscriptionPreview(selectedDevice?.subscriptions)

  const configureMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.updateMidi2Config(
        {
          enabled,
          default_protocol: protocol,
          binding_transport: bindingTransport,
          binding_target_id: bindingTransport === 'none' ? '' : bindingTargetId,
          binding_response_port: bindingTransport === 'port' ? bindingResponsePort : '',
        },
        nodeId,
      ),
    onSuccess: (payload) => {
      setEnabled(Boolean(payload.enabled))
      setProtocol(payload.default_protocol === 'midi2' ? 'midi2' : 'midi1')
      setBindingTransport(
        payload.binding?.transport === 'port'
          ? 'port'
          : payload.binding?.transport === 'network_session'
            ? 'network_session'
            : 'none',
      )
      setBindingTargetId(payload.binding?.target_id ?? '')
      setBindingResponsePort(payload.binding?.response_port ?? '')
      pushToast('MIDI 2.0 config updated', 'success')
      void refresh()
    },
    onError: () => pushToast('Failed to update MIDI 2.0 config', 'error'),
  })

  const discoverMutation = useMutation({
    mutationFn: async () => midiHubApi.discoverMidi2Device('', nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('MIDI-CI discovery inquiry sent; waiting for replies', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to send MIDI-CI discovery', 'error'),
  })

  const profileInquiryMutation = useMutation({
    mutationFn: async () => midiHubApi.inquireMidi2Profiles(deviceId, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Profile inquiry sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to send profile inquiry', 'error'),
  })

  const profileMutation = useMutation({
    mutationFn: async (enabledState: boolean) => midiHubApi.setMidi2Profile(deviceId, profileId, enabledState, nodeId),
    onSuccess: (payload, enabledState) => {
      if (payload.ok) {
        pushToast(enabledState ? 'Profile enable request sent' : 'Profile disable request sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to update profile state', 'error'),
  })

  const profileDetailsMutation = useMutation({
    mutationFn: async () => midiHubApi.inquireMidi2ProfileDetails(deviceId, profileId, parseInquiryTarget(profileDetailTarget), nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Profile details inquiry sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to query profile details', 'error'),
  })

  const propertyCapabilitiesMutation = useMutation({
    mutationFn: async () => midiHubApi.inquireMidi2PropertyExchangeCapabilities(deviceId, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Property Exchange capabilities inquiry sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to query Property Exchange capabilities', 'error'),
  })

  const propertyReadMutation = useMutation({
    mutationFn: async (resource: string) => midiHubApi.readMidi2Property(deviceId, resource, propertyResId || undefined, nodeId),
    onSuccess: (payload, resource) => {
      if (payload.ok) {
        pushToast(`Property read request sent for ${resource}`, 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to read property resource', 'error'),
  })

  const propertyMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.setMidi2Property(deviceId, propertyResource, parsePropertyValue(propertyValue), propertyResId || undefined, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Property set request sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to update property', 'error'),
  })

  const subscribeMutation = useMutation({
    mutationFn: async () => midiHubApi.subscribeMidi2Property(deviceId, propertyResource, propertyResId || undefined, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Subscription request sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to subscribe to property resource', 'error'),
  })

  const endSubscriptionMutation = useMutation({
    mutationFn: async () => midiHubApi.endMidi2Subscription(deviceId, subscriptionId, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast('Subscription end request sent', 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to end subscription', 'error'),
  })

  const invalidateMutation = useMutation({
    mutationFn: async () => midiHubApi.invalidateMidi2Device(deviceId, nodeId),
    onSuccess: (payload) => {
      if (payload.ok) {
        pushToast(`Invalidated ${payload.target_muid}`, 'success')
      } else {
        pushToast(formatTransportFailure(payload.transport?.reason), 'error')
      }
      void refresh()
    },
    onError: () => pushToast('Failed to invalidate device MUID', 'error'),
  })

  const translateToUmp = useMutation({
    mutationFn: async () => {
      const message = midiHex
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 16))
      return midiHubApi.translateMidi1ToUmp(message, nodeId)
    },
    onSuccess: (payload) => {
      setUmpWords(payload.words.join(', '))
      setUmpInspection('')
    },
    onError: () => pushToast('MIDI 1.0 to UMP translation failed', 'error'),
  })

  const translateToMidi1 = useMutation({
    mutationFn: async () => {
      const words = parseUmpWords(umpWords)
      return midiHubApi.translateUmpToMidi1(words, nodeId)
    },
    onSuccess: (payload) => {
      const hex = payload.message.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      setMidiHex(hex)
    },
    onError: () => pushToast('UMP to MIDI 1.0 translation failed', 'error'),
  })

  const inspectUmpMutation = useMutation({
    mutationFn: async () => midiHubApi.inspectMidi2Ump(parseUmpWords(umpWords), nodeId),
    onSuccess: (payload) => {
      setUmpInspection(JSON.stringify(payload.messages, null, 2))
      pushToast('UMP inspection complete', 'success')
    },
    onError: () => pushToast('UMP inspection failed', 'error'),
  })

  const effectiveStatus = statusQuery.data
  const selectedOutputName = outputPorts.find((port) => port.port_id === bindingTargetId)?.name
  const selectedSessionId = listenSessions.find((session) => session.session_id === bindingTargetId)?.session_id
  const bindingTargetLabel =
    bindingTransport === 'port'
      ? (selectedOutputName ?? bindingTargetId) || 'Unbound'
      : bindingTransport === 'network_session'
        ? (selectedSessionId ?? bindingTargetId) || 'Unbound'
        : 'Unbound'

  const rows = devices.map((device) => ({
    id: device.device_id,
    device: [
      device.device_id,
      device.remote_muid ? `MUID ${device.remote_muid}` : null,
      device.manufacturer_id ? `Manufacturer ${device.manufacturer_id}` : null,
      device.discovery_state ? `Discovery ${device.discovery_state}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    profiles:
      [
        device.profile_state ? `State ${device.profile_state}` : null,
        Object.keys(device.profile_details ?? {}).length > 0 ? `Details ${Object.keys(device.profile_details ?? {}).length}` : null,
        Object.entries(device.profiles)
          .map(([key, value]) => `${key}:${value ? 'on' : 'off'}`)
          .join(', ') || 'No confirmed profiles',
      ]
        .filter(Boolean)
        .join(' · '),
    properties:
      [
        device.property_state ? `State ${device.property_state}` : null,
        device.property_exchange_capabilities?.ready ? `PE ready v${device.property_exchange_capabilities.major_version ?? 0}.${device.property_exchange_capabilities.minor_version ?? 0}` : null,
        device.resources?.length ? `Resources ${device.resources.join(', ')}` : 'No ResourceList cached',
        Object.keys(device.subscriptions ?? {}).length > 0 ? `Subscriptions ${Object.keys(device.subscriptions ?? {}).length}` : null,
        Object.keys(device.properties).length > 0 ? JSON.stringify(device.properties) : 'No confirmed property data',
        device.last_response_summary ?? null,
      ]
        .filter(Boolean)
        .join(' · '),
  }))

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-toolbar">
          <Tag type={effectiveStatus?.enabled ? 'green' : 'warm-gray'}>
            {effectiveStatus?.enabled ? 'Enabled' : 'Disabled'}
          </Tag>
          <Tag type="cool-gray">{`Devices ${effectiveStatus?.device_count ?? 0}`}</Tag>
          <Tag type={bindingTransport === 'none' ? 'warm-gray' : 'blue'}>{`Binding ${bindingTransport}`}</Tag>
        </div>

        <div className="midi-hub-stat-grid">
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Default protocol</span>
            <span className="midi-hub-stat-tile__value">{effectiveStatus?.default_protocol ?? 'midi1'}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Discovered devices</span>
            <span className="midi-hub-stat-tile__value">{effectiveStatus?.device_count ?? 0}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Translation</span>
            <span className="midi-hub-stat-tile__value">{umpWords.trim() ? 'Ready' : 'Idle'}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">MIDI-CI</span>
            <span className="midi-hub-stat-tile__value">{bindingTransport === 'none' ? 'Unbound' : 'Transport bound'}</span>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Selected device</span>
            <span className="midi-hub-stat-tile__value">{selectedDevice?.discovery_state ?? 'None'}</span>
          </div>
        </div>

        <div className="midi-hub-form-grid">
          <Select
            id="midi-hub-midi2-protocol"
            labelText="Default protocol"
            value={protocol}
            onChange={(event) => setProtocol(event.currentTarget.value === 'midi2' ? 'midi2' : 'midi1')}
          >
            <SelectItem value="midi1" text="MIDI 1.0" />
            <SelectItem value="midi2" text="MIDI 2.0" />
          </Select>
          <Select
            id="midi-hub-midi2-binding-transport"
            labelText="Transport binding"
            value={bindingTransport}
            onChange={(event) =>
              setBindingTransport(
                event.currentTarget.value === 'port'
                  ? 'port'
                  : event.currentTarget.value === 'network_session'
                    ? 'network_session'
                    : 'none',
              )
            }
          >
            <SelectItem value="none" text="No binding" />
            <SelectItem value="port" text="Output port" />
            <SelectItem value="network_session" text="Network listen session" />
          </Select>
          <Select
            id="midi-hub-midi2-binding-target"
            labelText={bindingTransport === 'network_session' ? 'Receive-capable session' : 'Output target'}
            value={bindingTargetId}
            disabled={bindingTransport === 'none'}
            onChange={(event) => setBindingTargetId(event.currentTarget.value)}
          >
            <SelectItem value="" text={bindingTransport === 'network_session' ? 'Select listen session' : 'Select output port'} />
            {bindingTransport === 'network_session'
              ? listenSessions.map((session) => (
                  <SelectItem key={session.session_id} value={session.session_id} text={`${session.session_id} · ${session.host}:${session.port}`} />
                ))
              : outputPorts.map((port) => (
                  <SelectItem key={port.port_id} value={port.port_id} text={`${port.name} (${port.port_id})`} />
                ))}
          </Select>
          <Select
            id="midi-hub-midi2-response-port"
            labelText="Response input"
            value={bindingResponsePort}
            disabled={bindingTransport !== 'port'}
            onChange={(event) => setBindingResponsePort(event.currentTarget.value)}
          >
            <SelectItem value="" text="Auto or none" />
            {inputPorts.map((port) => (
              <SelectItem key={port.port_id} value={port.port_id} text={`${port.name} (${port.port_id})`} />
            ))}
          </Select>
        </div>
        <div className="midi-hub-network-panel__toggles">
          <Toggle id="midi-hub-midi2-enabled" labelText="Enable MIDI 2.0 service" labelA="Off" labelB="On" toggled={enabled} onToggle={setEnabled} />
        </div>
        <div className="midi-hub-record-meta">{`Target ${bindingTargetLabel}`}</div>
        {effectiveStatus?.local_muid ? <div className="midi-hub-record-meta">{`Local MUID ${effectiveStatus.local_muid}`}</div> : null}
        {effectiveStatus?.binding?.response_port ? (
          <div className="midi-hub-record-meta">{`Response ${effectiveStatus.binding.response_port}`}</div>
        ) : null}
        {selectedDevice?.last_response_summary ? <div className="midi-hub-record-meta">{selectedDevice.last_response_summary}</div> : null}
        {profileDetailPreview ? <div className="midi-hub-record-meta">{profileDetailPreview}</div> : null}
        {subscriptionPreview ? <div className="midi-hub-record-meta">{`Subscriptions ${subscriptionPreview}`}</div> : null}
        {effectiveStatus?.last_tx_hex ? <div className="midi-hub-record-meta">{`Last TX ${effectiveStatus.last_tx_hex}`}</div> : null}
        {effectiveStatus?.last_rx_hex ? <div className="midi-hub-record-meta">{`Last RX ${effectiveStatus.last_rx_hex}`}</div> : null}
        {effectiveStatus?.last_error ? <div className="midi-hub-record-meta">{`Last error ${effectiveStatus.last_error}`}</div> : null}

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => configureMutation.mutate()} disabled={bindingTransport !== 'none' && !bindingReady}>
            Apply protocol
          </Button>
          <Button size="sm" kind="ghost" onClick={() => discoverMutation.mutate()} disabled={!bindingReady}>
            Send discovery
          </Button>
        </div>
      </div>

      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-form-grid">
          <Select
            id="midi-hub-midi2-device-id"
            labelText="Discovered device"
            value={deviceId}
            onChange={(event) => setDeviceId(event.currentTarget.value)}
          >
            <SelectItem value="" text={devices.length > 0 ? 'Select discovered device' : 'No discovered devices'} />
            {devices.map((device) => (
              <SelectItem key={device.device_id} value={device.device_id} text={formatDeviceOption(device)} />
            ))}
          </Select>
          <TextInput
            id="midi-hub-midi2-profile-id"
            labelText="Profile ID (5-byte hex)"
            value={profileId}
            onChange={(event) => setProfileId(event.currentTarget.value)}
            placeholder="7E 00 00 00 00"
          />
          <TextInput
            id="midi-hub-midi2-property-resource"
            labelText="Property resource"
            value={propertyResource}
            onChange={(event) => setPropertyResource(event.currentTarget.value)}
            placeholder="ResourceList"
          />
          <TextInput
            id="midi-hub-midi2-profile-detail-target"
            labelText="Profile detail target"
            value={profileDetailTarget}
            onChange={(event) => setProfileDetailTarget(event.currentTarget.value)}
            placeholder="0"
          />
          <TextInput
            id="midi-hub-midi2-property-res-id"
            labelText="Property resource ID"
            value={propertyResId}
            onChange={(event) => setPropertyResId(event.currentTarget.value)}
            placeholder="Optional resId"
          />
          <TextInput
            id="midi-hub-midi2-property-value"
            labelText="Property value (JSON or string)"
            value={propertyValue}
            onChange={(event) => setPropertyValue(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-subscription-id"
            labelText="Subscription ID"
            value={subscriptionId}
            onChange={(event) => setSubscriptionId(event.currentTarget.value)}
            placeholder="Assigned by responder"
          />
          <TextInput
            id="midi-hub-midi2-midi-hex"
            labelText="MIDI 1.0 / SysEx7 bytes"
            value={midiHex}
            onChange={(event) => setMidiHex(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-ump-words"
            labelText="UMP words"
            value={umpWords}
            onChange={(event) => setUmpWords(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="secondary" onClick={() => profileInquiryMutation.mutate()} disabled={!bindingReady || !deviceReady}>
            Query profiles
          </Button>
          <Button size="sm" kind="secondary" onClick={() => profileMutation.mutate(true)} disabled={!bindingReady || !profileReady}>
            Enable profile
          </Button>
          <Button size="sm" kind="secondary" onClick={() => profileMutation.mutate(false)} disabled={!bindingReady || !profileReady}>
            Disable profile
          </Button>
          <Button size="sm" kind="secondary" onClick={() => profileDetailsMutation.mutate()} disabled={!bindingReady || !profileReady}>
            Query profile details
          </Button>
          <Button size="sm" kind="secondary" onClick={() => propertyCapabilitiesMutation.mutate()} disabled={!bindingReady || !deviceReady}>
            Query PE caps
          </Button>
          <Button size="sm" kind="secondary" onClick={() => propertyReadMutation.mutate(propertyResource)} disabled={!bindingReady || !propertyReady}>
            Read property
          </Button>
          <Button size="sm" kind="secondary" onClick={() => propertyReadMutation.mutate('ResourceList')} disabled={!bindingReady || !deviceReady}>
            Load ResourceList
          </Button>
          <Button size="sm" kind="secondary" onClick={() => propertyMutation.mutate()} disabled={!bindingReady || !propertyReady}>
            Set property
          </Button>
          <Button size="sm" kind="secondary" onClick={() => subscribeMutation.mutate()} disabled={!bindingReady || !propertyReady}>
            Subscribe resource
          </Button>
          <Button size="sm" kind="secondary" onClick={() => endSubscriptionMutation.mutate()} disabled={!bindingReady || !deviceReady || !subscriptionId.trim()}>
            End subscription
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => invalidateMutation.mutate()} disabled={!bindingReady || !deviceReady}>
            Invalidate device
          </Button>
          <Button size="sm" kind="ghost" onClick={() => translateToUmp.mutate()}>
            MIDI 1.0 to UMP
          </Button>
          <Button size="sm" kind="ghost" onClick={() => translateToMidi1.mutate()} disabled={!umpWords.trim()}>
            UMP to MIDI 1.0
          </Button>
          <Button size="sm" kind="ghost" onClick={() => inspectUmpMutation.mutate()} disabled={!umpWords.trim()}>
            Inspect UMP
          </Button>
        </div>
        {umpInspection ? (
          <pre className="midi-hub-record-meta">
            <code>{umpInspection}</code>
          </pre>
        ) : null}
      </div>

      <DataTable rows={rows} headers={DEVICE_HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="MIDI-CI devices"
            description="Confirmed discovery replies, profile state, and Property Exchange results."
            className="midi-hub-network-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">{`UMP ${umpWords.trim() ? 'Ready' : 'Idle'}`}</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="MIDI 2.0 devices">
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _key, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  )
}
