import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
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
  TextInput,
  Toggle,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

const HEADERS = [
  { key: 'peer', header: 'Peer' },
  { key: 'status', header: 'Status' },
  { key: 'metrics', header: 'Forwarding' },
]

export function MeshNetworkPanel() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [meshPeerId, setMeshPeerId] = useState('peer_a')
  const [meshBaseUrl, setMeshBaseUrl] = useState('http://127.0.0.1:8080')
  const [meshForwardingEnabled, setMeshForwardingEnabled] = useState(false)

  const meshQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'mesh'],
    queryFn: () => midiHubApi.getMeshStatus(nodeId),
    refetchInterval: 3000,
  })
  const meshStatus = (meshQuery.data ?? {}) as Record<string, unknown>

  useEffect(() => {
    setMeshForwardingEnabled(Boolean(meshStatus.forwarding_enabled))
  }, [meshStatus.forwarding_enabled])

  const refreshMesh = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'mesh'] })

  const upsertMeshPeer = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertMeshPeer({ peer_id: meshPeerId.trim(), base_url: meshBaseUrl.trim(), active: true }, nodeId),
    onSuccess: async () => {
      pushToast('Mesh peer saved', 'success')
      await refreshMesh()
    },
  })

  const deleteMeshPeer = useMutation({
    mutationFn: async (peerId: string) => midiHubApi.deleteMeshPeer(peerId, nodeId),
    onSuccess: async () => {
      pushToast('Mesh peer removed', 'info')
      await refreshMesh()
    },
  })

  const toggleMeshForwarding = useMutation({
    mutationFn: async (enabled: boolean) => midiHubApi.setMeshForwarding(enabled, nodeId),
    onSuccess: async () => {
      await refreshMesh()
    },
  })

  const publishRoutes = useMutation({
    mutationFn: async () => {
      const routes = (await midiHubApi.getRoutes(nodeId)).routes.map((route) => ({ ...route }))
      return midiHubApi.publishMeshRoutes({ source_instance: 'local', routes, fanout: false }, nodeId)
    },
    onSuccess: async () => {
      pushToast('Mesh route table published', 'success')
      await refreshMesh()
    },
  })

  const rows = useMemo(
    () =>
      (((meshStatus.peers as Array<Record<string, unknown>> | undefined) ?? [])).map((peer) => ({
        id: String(peer.peer_id ?? 'peer'),
        peer: `${String(peer.peer_id ?? 'peer')} · ${String(peer.base_url ?? '')}`,
        status: Boolean(peer.active) ? 'Online' : 'Disabled',
        metrics: `Forwards ${Number(peer.forward_count ?? 0)} · Last sync ${peer.last_sync_at ?? 'never'}`,
      })),
    [meshStatus.peers],
  )

  return (
    <div className="midi-hub-lab-panel">
      <div className="midi-hub-lab-panel__toolbar">
        <Tag type={rows.length > 0 ? 'green' : 'warm-gray'}>{`Peers ${rows.length}`}</Tag>
        <Tag type="cool-gray">{String(meshStatus.transport_mode ?? 'mesh')}</Tag>
      </div>

      <div className="midi-hub-form-grid">
        <TextInput id="midi-hub-mesh-peer-id" labelText="Peer ID" value={meshPeerId} onChange={(event) => setMeshPeerId(event.currentTarget.value)} />
        <TextInput id="midi-hub-mesh-peer-url" labelText="Peer base URL" value={meshBaseUrl} onChange={(event) => setMeshBaseUrl(event.currentTarget.value)} />
      </div>

      <div className="midi-hub-lab-panel__toggle-row">
        <Toggle
          id="midi-hub-mesh-forwarding"
          labelText="Forward mesh traffic"
          labelA="Off"
          labelB="On"
          toggled={meshForwardingEnabled}
          onToggle={(next) => {
            setMeshForwardingEnabled(next)
            toggleMeshForwarding.mutate(next)
          }}
        />
      </div>

      <div className="midi-hub-actions">
        <Button size="sm" kind="primary" onClick={() => upsertMeshPeer.mutate()}>
          Save peer
        </Button>
        <Button size="sm" kind="ghost" onClick={() => publishRoutes.mutate()}>
          Publish routes
        </Button>
      </div>

      <DataTable rows={rows} headers={HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Mesh peers"
            description="Track peer health and remove stale endpoints from one routing table."
            className="midi-hub-lab-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type={meshForwardingEnabled ? 'blue' : 'cool-gray'}>{meshForwardingEnabled ? 'Forwarding enabled' : 'Forwarding idle'}</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Mesh peers">
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
                  <TableHeader>Action</TableHeader>
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
                      <TableCell>
                        <Button size="sm" kind="ghost" onClick={() => deleteMeshPeer.mutate(row.id)}>
                          Remove
                        </Button>
                      </TableCell>
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
