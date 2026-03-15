import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AILabel, AILabelContent } from '@carbon/react'
import { Button, FormControlLabel, Switch, TextField } from '@mui/material'
import { midiHubApi, type MidiHubLearnSuggestion } from '../../../map2/api'
import { useToasts } from '../Toasts'

export function MidiInnovationPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [parameterId, setParameterId] = useState('filter_cutoff')
  const [activePlugins, setActivePlugins] = useState('wah,delay')
  const [bypassedPlugins, setBypassedPlugins] = useState('chorus')
  const [learnSuggestions, setLearnSuggestions] = useState<MidiHubLearnSuggestion[]>([])
  const [meshPeerId, setMeshPeerId] = useState('peer_a')
  const [meshBaseUrl, setMeshBaseUrl] = useState('http://127.0.0.1:8080')
  const [meshForwardingEnabled, setMeshForwardingEnabled] = useState(false)
  const [shadowDeviceId, setShadowDeviceId] = useState('usb_din_adapter:lab')
  const [shadowHealth, setShadowHealth] = useState('online')

  const meshQuery = useQuery({
    queryKey: ['midi-hub', 'mesh'],
    queryFn: midiHubApi.getMeshStatus,
    refetchInterval: 3000,
  })

  const shadowQuery = useQuery({
    queryKey: ['midi-hub', 'shadow'],
    queryFn: () => midiHubApi.getDeviceShadow(100),
    refetchInterval: 3000,
  })

  const requestLearnSuggestions = useMutation({
    mutationFn: async () =>
      midiHubApi.getLearnSuggestions({
        parameter_id: parameterId.trim(),
        chain_context: {
          active_plugins: activePlugins
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          bypassed_plugins: bypassedPlugins
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          split_targets: ['A', 'B'],
        },
      }),
    onSuccess: (payload) => {
      setLearnSuggestions(payload.suggestions)
      pushToast('Learn suggestions updated', 'success')
    },
    onError: () => pushToast('Learn suggestions failed', 'error'),
  })

  const upsertMeshPeer = useMutation({
    mutationFn: async () => midiHubApi.upsertMeshPeer({ peer_id: meshPeerId.trim(), base_url: meshBaseUrl.trim(), active: true }),
    onSuccess: () => {
      pushToast('Mesh peer saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'mesh'] })
    },
    onError: () => pushToast('Mesh peer save failed', 'error'),
  })

  const toggleMeshForwarding = useMutation({
    mutationFn: async (enabled: boolean) => midiHubApi.setMeshForwarding(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'mesh'] })
    },
  })

  const publishRoutes = useMutation({
    mutationFn: async () => {
      const routes = (await midiHubApi.getRoutes()).routes.map((route) => ({ ...route }))
      return midiHubApi.publishMeshRoutes({ source_instance: 'local', routes, fanout: false })
    },
    onSuccess: () => {
      pushToast('Mesh route table published', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'mesh'] })
    },
  })

  const upsertShadow = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertDeviceShadow(shadowDeviceId.trim(), {
        expected_state: {
          connected: true,
          responding: true,
          health: shadowHealth,
        },
        source: 'ui',
      }),
    onSuccess: (payload) => {
      pushToast(payload.drift_detected ? 'Shadow drift detected' : 'Shadow state saved', payload.drift_detected ? 'warn' : 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'shadow'] })
    },
  })

  const clearShadow = useMutation({
    mutationFn: midiHubApi.clearDeviceShadowEvents,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', 'shadow'] })
    },
  })

  const peerCount = useMemo(() => Number(meshQuery.data?.peer_count ?? 0), [meshQuery.data?.peer_count])
  const driftCount = useMemo(() => Number(shadowQuery.data?.count ?? 0), [shadowQuery.data?.count])

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="flex" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <h4 style={{ marginTop: 0, marginBottom: 0 }}>AI-assisted MIDI learn and plugin splits</h4>
          <AILabel kind="inline" size="mini" textLabel="AI">
            <AILabelContent>
              Suggested CC mappings are generated from the active chain context and should be reviewed before applying.
            </AILabelContent>
          </AILabel>
        </div>
        <div className="grid grid-3" style={{ gap: 8 }}>
          <TextField label="Parameter" size="small" value={parameterId} onChange={(event) => setParameterId(event.target.value)} />
          <TextField
            label="Active Plugins (csv)"
            size="small"
            value={activePlugins}
            onChange={(event) => setActivePlugins(event.target.value)}
          />
          <TextField
            label="Bypassed Plugins (csv)"
            size="small"
            value={bypassedPlugins}
            onChange={(event) => setBypassedPlugins(event.target.value)}
          />
        </div>
        <div className="flex" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
          <Button size="small" variant="contained" onClick={() => requestLearnSuggestions.mutate()}>
            Suggest
          </Button>
          <span className="subtitle">Suggestions: {learnSuggestions.length}</span>
        </div>
        {learnSuggestions.length > 0 ? (
          <div className="stack" style={{ marginTop: 8, gap: 6 }}>
            {learnSuggestions.map((row, index) => (
              <div key={`${row.cc_number}-${index}`} className="subtitle">
                CC{row.cc_number} Ch{row.channel} ({Math.round(row.confidence * 100)}%) - {row.reason}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h4 style={{ marginTop: 0 }}>Network MIDI Mesh</h4>
        <div className="grid grid-3" style={{ gap: 8 }}>
          <TextField label="Peer ID" size="small" value={meshPeerId} onChange={(event) => setMeshPeerId(event.target.value)} />
          <TextField label="Peer Base URL" size="small" value={meshBaseUrl} onChange={(event) => setMeshBaseUrl(event.target.value)} />
          <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={meshForwardingEnabled}
                  onChange={(event) => {
                    const next = event.target.checked
                    setMeshForwardingEnabled(next)
                    toggleMeshForwarding.mutate(next)
                  }}
                />
              }
              label="Forward"
            />
            <Button size="small" variant="outlined" onClick={() => upsertMeshPeer.mutate()}>
              Save Peer
            </Button>
            <Button size="small" variant="outlined" onClick={() => publishRoutes.mutate()}>
              Publish Routes
            </Button>
          </div>
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>Peers: {peerCount}</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h4 style={{ marginTop: 0 }}>Device Shadow Sync + Drift</h4>
        <div className="grid grid-3" style={{ gap: 8 }}>
          <TextField
            label="Device ID"
            size="small"
            value={shadowDeviceId}
            onChange={(event) => setShadowDeviceId(event.target.value)}
          />
          <TextField label="Expected Health" size="small" value={shadowHealth} onChange={(event) => setShadowHealth(event.target.value)} />
          <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
            <Button size="small" variant="contained" onClick={() => upsertShadow.mutate()}>
              Sync Shadow
            </Button>
            <Button size="small" variant="outlined" onClick={() => clearShadow.mutate()}>
              Clear Drift
            </Button>
          </div>
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>Drift events: {driftCount}</div>
      </div>
    </div>
  )
}
