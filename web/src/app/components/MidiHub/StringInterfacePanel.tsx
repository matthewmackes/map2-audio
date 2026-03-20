import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Tag, TextArea, TextInput, Toggle } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function StringInterfacePanel() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [enabled, setEnabled] = useState(true)
  const [listenHost, setListenHost] = useState('0.0.0.0')
  const [listenPort, setListenPort] = useState('3037')
  const [targetHost, setTargetHost] = useState('127.0.0.1')
  const [targetPort, setTargetPort] = useState('3037')
  const [outboundCommand, setOutboundCommand] = useState('GO 12')
  const [inboundCommand, setInboundCommand] = useState('MACRO START_SHOW')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'string-interface'] })

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'string-interface'],
    queryFn: () => midiHubApi.getStringInterfaceStatus(nodeId),
    refetchInterval: 3000,
  })

  const configMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.updateStringInterfaceConfig(
        {
          enabled,
          listen_host: listenHost.trim(),
          listen_port: Number.parseInt(listenPort || '3037', 10) || 3037,
          target_host: targetHost.trim(),
          target_port: Number.parseInt(targetPort || '3037', 10) || 3037,
        },
        nodeId,
      ),
    onSuccess: async () => {
      pushToast('String interface updated', 'success')
      await refresh()
    },
  })

  const sendMutation = useMutation({
    mutationFn: async () => midiHubApi.sendStringInterfaceCommand(outboundCommand, nodeId),
    onSuccess: async () => {
      pushToast('String command sent', 'success')
      await refresh()
    },
  })

  const receiveMutation = useMutation({
    mutationFn: async () => midiHubApi.receiveStringInterfaceCommand(inboundCommand, nodeId),
    onSuccess: async () => {
      pushToast('Inbound string command simulated', 'info')
      await refresh()
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => midiHubApi.clearStringInterfaceLogs(nodeId),
    onSuccess: async () => {
      pushToast('String command log cleared', 'info')
      await refresh()
    },
  })

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__toolbar">
        <Tag type={statusQuery.data?.enabled ? 'green' : 'warm-gray'}>
          {statusQuery.data?.enabled ? 'Listening' : 'Disabled'}
        </Tag>
        <Tag type="cool-gray">{`Log entries ${statusQuery.data?.log_count ?? 0}`}</Tag>
      </div>

      <div className="midi-hub-form-grid">
        <TextInput id="string-listen-host" labelText="Listen host" value={listenHost} onChange={(event) => setListenHost(event.currentTarget.value)} />
        <TextInput id="string-listen-port" labelText="Listen port" value={listenPort} onChange={(event) => setListenPort(event.currentTarget.value)} />
        <TextInput id="string-target-host" labelText="Target host" value={targetHost} onChange={(event) => setTargetHost(event.currentTarget.value)} />
        <TextInput id="string-target-port" labelText="Target port" value={targetPort} onChange={(event) => setTargetPort(event.currentTarget.value)} />
      </div>

      <div className="midi-hub-network-panel__toggles">
        <Toggle id="string-enabled" labelText="Enable UDP listener" labelA="Off" labelB="On" toggled={enabled} onToggle={setEnabled} />
      </div>

      <div className="midi-hub-actions">
        <Button size="sm" kind="primary" onClick={() => configMutation.mutate()}>
          Apply config
        </Button>
      </div>

      <TextArea id="string-outbound-command" labelText="Outbound command" rows={2} value={outboundCommand} onChange={(event) => setOutboundCommand(event.currentTarget.value)} />
      <div className="midi-hub-actions">
        <Button size="sm" kind="secondary" onClick={() => sendMutation.mutate()}>
          Send text command
        </Button>
      </div>

      <TextArea id="string-inbound-command" labelText="Simulate inbound command" rows={2} value={inboundCommand} onChange={(event) => setInboundCommand(event.currentTarget.value)} />
      <div className="midi-hub-actions">
        <Button size="sm" kind="ghost" onClick={() => receiveMutation.mutate()}>
          Record inbound
        </Button>
        <Button size="sm" kind="ghost" onClick={() => clearMutation.mutate()}>
          Clear log
        </Button>
      </div>

      <pre className="midi-hub-code-block">{JSON.stringify(statusQuery.data?.logs ?? [], null, 2)}</pre>
    </div>
  )
}
