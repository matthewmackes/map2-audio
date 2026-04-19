import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CodeSnippet,
  DataTable,
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
  TextArea,
  TextInput,
  Toggle,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

const ALIAS_HEADERS = [
  { key: 'type', header: 'Type' },
  { key: 'name', header: 'Instance tag' },
  { key: 'value', header: 'Primary value' },
]

export function TesiraPanel() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [host, setHost] = useState('192.168.10.55')
  const [port, setPort] = useState('23')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secured, setSecured] = useState(false)
  const [autoReconnect, setAutoReconnect] = useState(true)
  const [command, setCommand] = useState('SESSION get aliases')
  const [levelTag, setLevelTag] = useState('Level1')
  const [levelValue, setLevelValue] = useState('-10')
  const [muteTag, setMuteTag] = useState('Level1')
  const [presetId, setPresetId] = useState('1001')
  const [subscriptionTag, setSubscriptionTag] = useState('Level1')
  const [subscriptionAttribute, setSubscriptionAttribute] = useState('level')
  const [hydratedConfig, setHydratedConfig] = useState(false)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'tesira-status'] }),
      queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'tesira-aliases'] }),
      queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'tesira-subscriptions'] }),
    ])
  }

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'tesira-status'],
    queryFn: () => midiHubApi.getTesiraStatus(nodeId),
    refetchInterval: 4000,
  })

  const aliasesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'tesira-aliases'],
    queryFn: () => midiHubApi.listTesiraAliases(nodeId),
  })

  useEffect(() => {
    if (hydratedConfig || !statusQuery.data) return
    setHost(statusQuery.data.host || '192.168.10.55')
    setPort(String(statusQuery.data.port || 23))
    setUsername(statusQuery.data.username || '')
    setSecured(Boolean(statusQuery.data.secured))
    setAutoReconnect(Boolean(statusQuery.data.auto_reconnect))
    if (statusQuery.data.aliases[0]?.instance_tag) {
      const aliasTag = statusQuery.data.aliases[0].instance_tag
      setLevelTag(aliasTag)
      setMuteTag(aliasTag)
      setSubscriptionTag(aliasTag)
    }
    setHydratedConfig(true)
  }, [hydratedConfig, statusQuery.data])

  const connectMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.connectTesira(
        {
          host: host.trim(),
          port: Math.max(1, Math.min(65535, Number.parseInt(port || '23', 10) || 23)),
          username: username.trim(),
          password,
          secured,
          auto_reconnect: autoReconnect,
        },
        nodeId,
      ),
    onSuccess: async () => {
      pushToast('Tesira connection updated', 'success')
      await refresh()
    },
    onError: () => pushToast('Tesira connection failed', 'error'),
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => midiHubApi.disconnectTesira(nodeId),
    onSuccess: async () => {
      pushToast('Tesira disconnected', 'info')
      await refresh()
    },
  })

  const commandMutation = useMutation({
    mutationFn: async () => midiHubApi.sendTesiraCommand(command, nodeId),
    onSuccess: async () => {
      pushToast('Tesira command sent', 'success')
      await refresh()
    },
    onError: () => pushToast('Tesira command failed', 'error'),
  })

  const levelMutation = useMutation({
    mutationFn: async () => midiHubApi.setTesiraLevel(levelTag, Number.parseFloat(levelValue || '0') || 0, nodeId),
    onSuccess: async () => {
      pushToast('Tesira level updated', 'success')
      await refresh()
    },
  })

  const muteMutation = useMutation({
    mutationFn: async () => midiHubApi.setTesiraMute(muteTag, true, nodeId),
    onSuccess: async () => {
      pushToast('Tesira mute updated', 'info')
      await refresh()
    },
  })

  const presetMutation = useMutation({
    mutationFn: async () => midiHubApi.recallTesiraPreset(Number.parseInt(presetId || '1001', 10) || 1001, nodeId),
    onSuccess: async () => {
      pushToast('Tesira preset recalled', 'success')
      await refresh()
    },
  })

  const subscriptionMutation = useMutation({
    mutationFn: async () => midiHubApi.subscribeTesira(subscriptionTag, subscriptionAttribute, nodeId),
    onSuccess: async () => {
      pushToast('Tesira subscription added', 'success')
      await refresh()
    },
  })

  const removeSubscriptionMutation = useMutation({
    mutationFn: async (token: string) => midiHubApi.unsubscribeTesira(token, nodeId),
    onSuccess: async () => {
      pushToast('Tesira subscription removed', 'info')
      await refresh()
    },
  })

  const aliases =
    aliasesQuery.data?.aliases.map((alias) => ({
      id: alias.instance_tag,
      type: alias.block_type,
      name: alias.instance_tag,
      value:
        alias.level !== undefined
          ? `${alias.level} dB`
          : alias.mute !== undefined
            ? alias.mute
              ? 'Muted'
              : 'Live'
            : alias.selection !== undefined
              ? `Source ${alias.selection}`
              : alias.peak_db !== undefined
                ? `${alias.peak_db} dBFS`
                : alias.label ?? 'Ready',
    })) ?? []

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-network-panel__toolbar">
          <Tag type={statusQuery.data?.connected ? 'green' : 'warm-gray'}>
            {statusQuery.data?.connected ? 'Connected' : 'Offline'}
          </Tag>
          <Tag type="cool-gray">{`Aliases ${statusQuery.data?.aliases.length ?? 0}`}</Tag>
          <Tag type="blue">{statusQuery.data?.auto_reconnect ? 'Auto reconnect' : 'Manual'}</Tag>
        </div>
        <div className="midi-hub-form-grid">
          <TextInput id="tesira-host" labelText="Tesira host" value={host} onChange={(event) => setHost(event.currentTarget.value)} />
          <TextInput id="tesira-port" labelText="Port" value={port} onChange={(event) => setPort(event.currentTarget.value)} />
          <TextInput id="tesira-username" labelText="Username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} />
          <TextInput id="tesira-password" labelText="Password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
        </div>
        <div className="midi-hub-network-panel__toggles">
          <Toggle id="tesira-secured" labelText="Secured Telnet" labelA="No" labelB="Yes" toggled={secured} onToggle={setSecured} />
          <Toggle id="tesira-auto-reconnect" labelText="Auto reconnect" labelA="Off" labelB="On" toggled={autoReconnect} onToggle={setAutoReconnect} />
        </div>
        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => connectMutation.mutate()}>
            Connect
          </Button>
          <Button size="sm" kind="secondary" onClick={() => disconnectMutation.mutate()}>
            Disconnect
          </Button>
        </div>
      </div>

      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-form-grid midi-hub-network-panel__controls-grid">
          <TextInput id="tesira-level-tag" labelText="Level instance tag" value={levelTag} onChange={(event) => setLevelTag(event.currentTarget.value)} />
          <TextInput id="tesira-level-value" labelText="Level dB" value={levelValue} onChange={(event) => setLevelValue(event.currentTarget.value)} />
          <TextInput id="tesira-mute-tag" labelText="Mute instance tag" value={muteTag} onChange={(event) => setMuteTag(event.currentTarget.value)} />
          <TextInput id="tesira-preset-id" labelText="Preset ID" value={presetId} onChange={(event) => setPresetId(event.currentTarget.value)} />
        </div>
        <div className="midi-hub-actions">
          <Button size="sm" kind="ghost" onClick={() => levelMutation.mutate()}>
            Set level
          </Button>
          <Button size="sm" kind="ghost" onClick={() => muteMutation.mutate()}>
            Mute
          </Button>
          <Button size="sm" kind="ghost" onClick={() => presetMutation.mutate()}>
            Recall preset
          </Button>
        </div>
      </div>

      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-form-grid">
          <TextInput id="tesira-subscription-tag" labelText="Subscribe instance tag" value={subscriptionTag} onChange={(event) => setSubscriptionTag(event.currentTarget.value)} />
          <TextInput id="tesira-subscription-attribute" labelText="Attribute" value={subscriptionAttribute} onChange={(event) => setSubscriptionAttribute(event.currentTarget.value)} />
        </div>
        <div className="midi-hub-actions">
          <Button size="sm" kind="secondary" onClick={() => subscriptionMutation.mutate()}>
            Subscribe
          </Button>
        </div>
        <div className="midi-hub-record-list">
          {(statusQuery.data?.subscriptions ?? []).map((subscription) => (
            <div key={subscription.token} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <span className="midi-hub-record-title">{subscription.token}</span>
                <div className="midi-hub-record-meta">{`${subscription.instance_tag} · ${subscription.attribute}`}</div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="ghost" onClick={() => removeSubscriptionMutation.mutate(subscription.token)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DataTable rows={aliases} headers={ALIAS_HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Instance tag browser"
            description="Browse discovered aliases before sending free-text TTP commands."
            className="midi-hub-network-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">SESSION get aliases</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Tesira aliases">
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

      <div className="midi-hub-network-panel__section">
        <TextArea id="tesira-command" labelText="TTP command console" rows={3} value={command} onChange={(event) => setCommand(event.currentTarget.value)} />
        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => commandMutation.mutate()}>
            Send command
          </Button>
        </div>
        <CodeSnippet className="midi-hub-code-block" type="multi">
          {JSON.stringify(statusQuery.data?.history ?? [], null, 2)}
        </CodeSnippet>
      </div>
    </div>
  )
}
