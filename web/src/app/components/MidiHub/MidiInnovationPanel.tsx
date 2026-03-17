import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AILabel, AILabelContent, Button, Checkbox, Tag, TextInput } from '@carbon/react'
import { midiHubApi, type MidiHubLearnSuggestion } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiInnovationPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
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
    queryKey: ['midi-hub', scopeKey, 'mesh'],
    queryFn: () => midiHubApi.getMeshStatus(nodeId),
    refetchInterval: 3000,
  })

  const shadowQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'shadow'],
    queryFn: () => midiHubApi.getDeviceShadow(100, nodeId),
    refetchInterval: 3000,
  })

  const requestLearnSuggestions = useMutation({
    mutationFn: async () =>
      midiHubApi.getLearnSuggestions(
        {
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
        },
        nodeId,
      ),
    onSuccess: (payload) => {
      setLearnSuggestions(payload.suggestions)
      pushToast('Learn suggestions updated', 'success')
    },
    onError: () => pushToast('Learn suggestions failed', 'error'),
  })

  const upsertMeshPeer = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertMeshPeer({ peer_id: meshPeerId.trim(), base_url: meshBaseUrl.trim(), active: true }, nodeId),
    onSuccess: () => {
      pushToast('Mesh peer saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'mesh'] })
    },
    onError: () => pushToast('Mesh peer save failed', 'error'),
  })

  const toggleMeshForwarding = useMutation({
    mutationFn: async (enabled: boolean) => midiHubApi.setMeshForwarding(enabled, nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'mesh'] })
    },
  })

  const publishRoutes = useMutation({
    mutationFn: async () => {
      const routes = (await midiHubApi.getRoutes(nodeId)).routes.map((route) => ({ ...route }))
      return midiHubApi.publishMeshRoutes({ source_instance: 'local', routes, fanout: false }, nodeId)
    },
    onSuccess: () => {
      pushToast('Mesh route table published', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'mesh'] })
    },
  })

  const upsertShadow = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertDeviceShadow(
        shadowDeviceId.trim(),
        {
          expected_state: {
            connected: true,
            responding: true,
            health: shadowHealth,
          },
          source: 'ui',
        },
        nodeId,
      ),
    onSuccess: (payload) => {
      pushToast(payload.drift_detected ? 'Shadow drift detected' : 'Shadow state saved', payload.drift_detected ? 'warn' : 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'shadow'] })
    },
  })

  const clearShadow = useMutation({
    mutationFn: () => midiHubApi.clearDeviceShadowEvents(nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'shadow'] })
    },
  })

  const peerCount = useMemo(() => Number(meshQuery.data?.peer_count ?? 0), [meshQuery.data?.peer_count])
  const driftCount = useMemo(() => Number(shadowQuery.data?.count ?? 0), [shadowQuery.data?.count])

  return (
    <div className="midi-hub-panel-grid--3">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <AILabel kind="inline" size="mini" textLabel="AI">
            <AILabelContent>
              Suggested control mappings are generated from the active chain context and should be reviewed before use.
            </AILabelContent>
          </AILabel>
          <Tag type="cool-gray">{`Suggestions ${learnSuggestions.length}`}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-innovation-parameter"
            labelText="Parameter"
            value={parameterId}
            onChange={(event) => setParameterId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-innovation-active"
            labelText="Active plug-ins"
            value={activePlugins}
            onChange={(event) => setActivePlugins(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-innovation-bypassed"
            labelText="Bypassed plug-ins"
            value={bypassedPlugins}
            onChange={(event) => setBypassedPlugins(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => requestLearnSuggestions.mutate()}>
            Suggest mappings
          </Button>
        </div>

        <div className="midi-hub-record-list">
          {learnSuggestions.length === 0 ? <div className="midi-hub-empty-state">No AI suggestions generated.</div> : null}
          {learnSuggestions.map((row, index) => (
            <div key={`${row.cc_number}-${index}`} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{`CC ${row.cc_number} on channel ${row.channel}`}</strong>
                <div className="midi-hub-record-meta">{`${Math.round(row.confidence * 100)}% confidence · ${row.reason}`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={peerCount > 0 ? 'green' : 'warm-gray'}>{`Peers ${peerCount}`}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-innovation-peer-id"
            labelText="Peer ID"
            value={meshPeerId}
            onChange={(event) => setMeshPeerId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-innovation-peer-url"
            labelText="Peer base URL"
            value={meshBaseUrl}
            onChange={(event) => setMeshBaseUrl(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-innovation-forwarding"
            labelText="Forward mesh traffic"
            checked={meshForwardingEnabled}
            onChange={(_, data) => {
              setMeshForwardingEnabled(data.checked)
              toggleMeshForwarding.mutate(data.checked)
            }}
          />
          <Button size="sm" kind="secondary" onClick={() => upsertMeshPeer.mutate()}>
            Save peer
          </Button>
          <Button size="sm" kind="ghost" onClick={() => publishRoutes.mutate()}>
            Publish routes
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={driftCount > 0 ? 'red' : 'cool-gray'}>{`Drift events ${driftCount}`}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-innovation-shadow-device"
            labelText="Shadow device ID"
            value={shadowDeviceId}
            onChange={(event) => setShadowDeviceId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-innovation-shadow-health"
            labelText="Expected health"
            value={shadowHealth}
            onChange={(event) => setShadowHealth(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="secondary" onClick={() => upsertShadow.mutate()}>
            Sync shadow
          </Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => clearShadow.mutate()}>
            Clear drift
          </Button>
        </div>
      </div>
    </div>
  )
}
