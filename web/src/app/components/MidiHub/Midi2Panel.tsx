import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, MenuItem, Select, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useToasts } from '../Toasts'

export function Midi2Panel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'midi2-status'],
    queryFn: midiHubApi.getMidi2Status,
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', 'midi2-status'] })

  const configureMutation = useMutation({
    mutationFn: async () => midiHubApi.updateMidi2Config({ enabled, default_protocol: protocol }),
    onSuccess: () => {
      pushToast('MIDI 2.0 config updated', 'success')
      void refresh()
    },
    onError: () => pushToast('Failed to update MIDI 2.0 config', 'error'),
  })

  const discoverMutation = useMutation({
    mutationFn: async () => midiHubApi.discoverMidi2Device(deviceId),
    onSuccess: () => {
      pushToast('MIDI-CI discovery sent', 'success')
      void refresh()
    },
  })

  const profileMutation = useMutation({
    mutationFn: async () => midiHubApi.setMidi2Profile(deviceId, profileId, true),
    onSuccess: () => {
      pushToast('Profile enabled', 'success')
      void refresh()
    },
  })

  const propertyMutation = useMutation({
    mutationFn: async () => midiHubApi.setMidi2Property(deviceId, propertyKey, propertyValue),
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
      return midiHubApi.translateMidi1ToUmp(message)
    },
    onSuccess: (payload) => setUmpWords(payload.words.join(', ')),
    onError: () => pushToast('MIDI1→UMP translation failed', 'error'),
  })

  const translateToMidi1 = useMutation({
    mutationFn: async () => {
      const words = umpWords
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10))
      return midiHubApi.translateUmpToMidi1(words)
    },
    onSuccess: (payload) => {
      const hex = payload.message.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      setMidiHex(hex)
    },
    onError: () => pushToast('UMP→MIDI1 translation failed', 'error'),
  })

  const effectiveStatus = useMemo(() => statusQuery.data, [statusQuery.data])

  return (
    <div className="grid two" style={{ gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>MIDI 2.0 Status</h4>
        <div className="stack" style={{ gap: 8 }}>
          <div className="list-item">Enabled: <strong>{effectiveStatus?.enabled ? 'Yes' : 'No'}</strong></div>
          <div className="list-item">Default Protocol: <strong>{effectiveStatus?.default_protocol ?? 'midi1'}</strong></div>
          <div className="list-item">Discovered Devices: <strong>{effectiveStatus?.device_count ?? 0}</strong></div>

          <Select size="small" value={enabled ? 'enabled' : 'disabled'} onChange={(event) => setEnabled(event.target.value === 'enabled')}>
            <MenuItem value="disabled">Disabled</MenuItem>
            <MenuItem value="enabled">Enabled</MenuItem>
          </Select>
          <Select size="small" value={protocol} onChange={(event) => setProtocol(event.target.value === 'midi2' ? 'midi2' : 'midi1')}>
            <MenuItem value="midi1">MIDI 1.0</MenuItem>
            <MenuItem value="midi2">MIDI 2.0</MenuItem>
          </Select>
          <Button size="small" variant="contained" onClick={() => configureMutation.mutate()}>Apply</Button>
        </div>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <h4 style={{ marginTop: 0 }}>Device + Property Controls</h4>
        <div className="stack" style={{ gap: 8 }}>
          <TextField size="small" label="Device ID" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} />
          <div className="flex" style={{ gap: 8 }}>
            <Button size="small" variant="outlined" onClick={() => discoverMutation.mutate()}>Discover</Button>
            <TextField size="small" label="Profile ID" value={profileId} onChange={(event) => setProfileId(event.target.value)} />
            <Button size="small" variant="outlined" onClick={() => profileMutation.mutate()}>Enable Profile</Button>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <TextField size="small" label="Property Key" value={propertyKey} onChange={(event) => setPropertyKey(event.target.value)} />
            <TextField size="small" label="Property Value" value={propertyValue} onChange={(event) => setPropertyValue(event.target.value)} />
            <Button size="small" variant="outlined" onClick={() => propertyMutation.mutate()}>Set Property</Button>
          </div>

          <TextField size="small" label="MIDI 1 Hex" value={midiHex} onChange={(event) => setMidiHex(event.target.value)} />
          <div className="flex" style={{ gap: 8 }}>
            <Button size="small" variant="outlined" onClick={() => translateToUmp.mutate()}>MIDI1 → UMP</Button>
            <Button size="small" variant="outlined" onClick={() => translateToMidi1.mutate()} disabled={!umpWords.trim()}>UMP → MIDI1</Button>
          </div>
          <TextField size="small" label="UMP Words" value={umpWords} onChange={(event) => setUmpWords(event.target.value)} multiline minRows={2} />

          {devices.length ? (
            <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#0f172a', color: '#e2e8f0', maxHeight: 220, overflowY: 'auto' }}>
              {JSON.stringify(devices, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
