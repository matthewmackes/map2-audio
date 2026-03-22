import { useState } from 'react'
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
import { useToasts } from '../Toasts'

const DEVICE_HEADERS = [
  { key: 'device', header: 'Device' },
  { key: 'profiles', header: 'Profiles' },
  { key: 'properties', header: 'Properties' },
]

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

  const effectiveStatus = statusQuery.data
  const rows = devices.map((device) => ({
    id: device.device_id,
    device: `${device.device_id} · ${device.protocol}`,
    profiles: Object.entries(device.profiles)
      .map(([key, value]) => `${key}:${value ? 'on' : 'off'}`)
      .join(', ') || 'None',
    properties: Object.keys(device.properties).length > 0 ? JSON.stringify(device.properties) : 'No property exchange values',
  }))

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-toolbar">
          <Tag type={effectiveStatus?.enabled ? 'green' : 'warm-gray'}>
            {effectiveStatus?.enabled ? 'Enabled' : 'Disabled'}
          </Tag>
          <Tag type="cool-gray">{`Devices ${effectiveStatus?.device_count ?? 0}`}</Tag>
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
            <span className="midi-hub-stat-tile__value">Available</span>
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
        </div>
        <div className="midi-hub-network-panel__toggles">
          <Toggle id="midi-hub-midi2-enabled" labelText="Enable MIDI 2.0 service" labelA="Off" labelB="On" toggled={enabled} onToggle={setEnabled} />
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

      <div className="midi-hub-network-panel__section">
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
      </div>

      <DataTable rows={rows} headers={DEVICE_HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="MIDI-CI devices"
            description="Discovered devices, profile activation, and property exchange state."
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
