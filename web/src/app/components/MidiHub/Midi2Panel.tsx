import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, Tag, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function Midi2Panel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'midi2-status'],
    queryFn: () => midiHubApi.getMidi2Status(nodeId),
    refetchInterval: 3000,
  })

  const [enabled, setEnabled] = useState(false)
  const [protocol, setProtocol] = useState<'midi1' | 'midi2'>('midi1')
  const [deviceId, setDeviceId] = useState('device-1')
  const [profileId, setProfileId] = useState('gm2')
  const [propertyKey, setPropertyKey] = useState('patch_name')
  const [propertyValue, setPropertyValue] = useState('Init')
  const [midiHex, setMidiHex] = useState('90 3C 64')
  const [umpWords, setUmpWords] = useState('')

  const devices = statusQuery.data?.devices ?? []

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'midi2-status'] })

  const configureMutation = useMutation({
    mutationFn: async () => midiHubApi.updateMidi2Config({ enabled, default_protocol: protocol }, nodeId),
    onSuccess: () => {
      pushToast('MIDI 2.0 config updated', 'success')
      void refresh()
    },
    onError: () => pushToast('Failed to update MIDI 2.0 config', 'error'),
  })

  const discoverMutation = useMutation({
    mutationFn: async () => midiHubApi.discoverMidi2Device(deviceId, nodeId),
    onSuccess: () => {
      pushToast('MIDI-CI discovery sent', 'success')
      void refresh()
    },
  })

  const profileMutation = useMutation({
    mutationFn: async () => midiHubApi.setMidi2Profile(deviceId, profileId, true, nodeId),
    onSuccess: () => {
      pushToast('Profile enabled', 'success')
      void refresh()
    },
  })

  const propertyMutation = useMutation({
    mutationFn: async () => midiHubApi.setMidi2Property(deviceId, propertyKey, propertyValue, nodeId),
    onSuccess: () => {
      pushToast('Property updated', 'success')
      void refresh()
    },
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
    onSuccess: (payload) => setUmpWords(payload.words.join(', ')),
    onError: () => pushToast('MIDI 1.0 to UMP translation failed', 'error'),
  })

  const translateToMidi1 = useMutation({
    mutationFn: async () => {
      const words = umpWords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10))
      return midiHubApi.translateUmpToMidi1(words, nodeId)
    },
    onSuccess: (payload) => {
      const hex = payload.message.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      setMidiHex(hex)
    },
    onError: () => pushToast('UMP to MIDI 1.0 translation failed', 'error'),
  })

  const effectiveStatus = useMemo(() => statusQuery.data, [statusQuery.data])

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={effectiveStatus?.enabled ? 'green' : 'warm-gray'}>
            {effectiveStatus?.enabled ? 'Enabled' : 'Disabled'}
          </Tag>
          <Tag type="cool-gray">{`Devices ${effectiveStatus?.device_count ?? 0}`}</Tag>
        </div>

        <div className="midi-hub-stat-grid">
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Default protocol</span>
            <strong className="midi-hub-stat-tile__value">{effectiveStatus?.default_protocol ?? 'midi1'}</strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Discovered devices</span>
            <strong className="midi-hub-stat-tile__value">{effectiveStatus?.device_count ?? 0}</strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">Translation</span>
            <strong className="midi-hub-stat-tile__value">{umpWords.trim() ? 'Ready' : 'Idle'}</strong>
          </div>
          <div className="midi-hub-stat-tile">
            <span className="midi-hub-stat-tile__label">MIDI-CI</span>
            <strong className="midi-hub-stat-tile__value">Available</strong>
          </div>
        </div>

        <div className="midi-hub-form-grid">
          <Select
            id="midi-hub-midi2-enabled"
            labelText="Service state"
            value={enabled ? 'enabled' : 'disabled'}
            onChange={(event) => setEnabled(event.currentTarget.value === 'enabled')}
          >
            <SelectItem value="disabled" text="Disabled" />
            <SelectItem value="enabled" text="Enabled" />
          </Select>

          <Select
            id="midi-hub-midi2-protocol"
            labelText="Default protocol"
            value={protocol}
            onChange={(event) => setProtocol(event.currentTarget.value === 'midi2' ? 'midi2' : 'midi1')}
          >
            <SelectItem value="midi1" text="MIDI 1.0" />
            <SelectItem value="midi2" text="MIDI 2.0" />
          </Select>
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => configureMutation.mutate()}>
            Apply protocol
          </Button>
          <Button size="sm" kind="ghost" onClick={() => discoverMutation.mutate()}>
            Send discovery
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-midi2-device-id"
            labelText="Device ID"
            value={deviceId}
            onChange={(event) => setDeviceId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-profile-id"
            labelText="Profile ID"
            value={profileId}
            onChange={(event) => setProfileId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-property-key"
            labelText="Property key"
            value={propertyKey}
            onChange={(event) => setPropertyKey(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-property-value"
            labelText="Property value"
            value={propertyValue}
            onChange={(event) => setPropertyValue(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-midi2-midi-hex"
            labelText="MIDI 1.0 bytes"
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
          <Button size="sm" kind="secondary" onClick={() => profileMutation.mutate()}>
            Enable profile
          </Button>
          <Button size="sm" kind="secondary" onClick={() => propertyMutation.mutate()}>
            Set property
          </Button>
          <Button size="sm" kind="ghost" onClick={() => translateToUmp.mutate()}>
            MIDI 1.0 to UMP
          </Button>
          <Button size="sm" kind="ghost" onClick={() => translateToMidi1.mutate()} disabled={!umpWords.trim()}>
            UMP to MIDI 1.0
          </Button>
        </div>

        {devices.length > 0 ? <pre className="midi-hub-code-block">{JSON.stringify(devices, null, 2)}</pre> : null}
      </div>
    </div>
  )
}
