import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Combobox,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxStore,
  Menu,
  MenuButton,
  MenuItem,
  MenuProvider,
  useMenuStore,
} from '@ariakit/react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material'
import { BadgeCheck, Loader2, Plus, Power, Trash2, Link2 } from 'lucide-react'
import type { Chain, ChainsResponse } from '../../map2/types'
import { chainsApi } from '../../map2/api'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'

export function ChainsPage() {
  const queryClient = useQueryClient()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [chainName, setChainName] = useState('')
  const { pushToast } = useToasts()

  const chainsKey = ['chains'] as const

  const chainsQuery = useQuery<ChainsResponse>({ queryKey: chainsKey, queryFn: chainsApi.list })
  const chainNames = useMemo(() => chainsQuery.data?.chains.map((c) => c.name) ?? [], [chainsQuery.data])

  const combobox = useComboboxStore()

  const searchValue = (combobox.getState().value ?? '').toLowerCase()
  const filteredChains = useMemo(
    () => chainsQuery.data?.chains.filter((c) => c.name.toLowerCase().includes(searchValue)) ?? [],
    [chainsQuery.data, searchValue]
  )

  const createChain = useMutation({
    mutationFn: (name: string) => chainsApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chainsKey })
      setChainName('')
      setCreateDialogOpen(false)
      pushToast('Chain created', 'success')
    },
    onError: () => pushToast('Failed to create chain', 'error'),
  })

  const activateChain = useMutation({
    mutationFn: (id: number) => chainsApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chainsKey })
      pushToast('Chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate chain', 'error'),
  })

  const deactivateChain = useMutation({
    mutationFn: (id: number) => chainsApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chainsKey })
      pushToast('Chain deactivated', 'info')
    },
    onError: () => pushToast('Failed to deactivate chain', 'error'),
  })

  const deleteChain = useMutation({
    mutationFn: (id: number) => chainsApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData(chainsKey, (data?: ChainsResponse) => {
        if (!data) return data
        return { ...data, count: Math.max(0, data.count - 1), chains: data.chains.filter((c) => c.id !== id) }
      })
      // Invalidate to ensure cache stays in sync with server after deletion
      queryClient.invalidateQueries({ queryKey: chainsKey })
      pushToast('Chain deleted', 'warn')
    },
    onError: () => pushToast('Failed to delete chain', 'error'),
  })

  const renameChain = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => chainsApi.rename(id, name),
    onSuccess: (res, { id, name }) => {
      queryClient.setQueryData(chainsKey, (data?: ChainsResponse) => {
        if (!data) return data
        return {
          ...data,
          chains: data.chains.map((c) => (c.id === id ? { ...c, name, updated_at: new Date().toISOString() } : c)),
        }
      })
      pushToast('Chain renamed', 'success')
    },
    onError: () => pushToast('Failed to rename chain', 'error'),
  })

  const activeChain = chainsQuery.data?.chains.find((c) => c.is_active)
  const totalPlugins = chainsQuery.data?.chains.reduce((acc, c) => acc + c.plugins.length, 0) ?? 0

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault()
    if (!chainName.trim()) return
    createChain.mutate(chainName.trim())
  }

  return (
    <div className="stack">
      <PageHeader
        title="Chains"
        subtitle="Curate and activate processing chains with Ariakit dialogs and menus."
        icon={<Link2 size={32} style={{ color: '#3b82f6' }} />}
        actions={
          <div className="flex" style={{ gap: 8 }}>
            <a className="btn btn-ghost" href="/grid">
              <Plus size={16} /> Grid view
            </a>
            <button className="btn btn-primary" onClick={() => setCreateDialogOpen(true)}>
              <Plus size={16} /> New chain
            </button>
          </div>
        }
      />

      <div className="grid two">
        <StatCard
          label="Total chains"
          value={chainsQuery.data?.count ?? '—'}
          helper={chainsQuery.isFetching ? 'Refreshing' : 'Inventory'}
        />
        <StatCard
          label="Active chain"
          value={activeChain?.name ?? 'None selected'}
          helper={activeChain ? 'Live' : 'Pick one'}
          tone={activeChain ? 'success' : 'warn'}
        />
        <StatCard
          label="Plugins across chains"
          value={totalPlugins}
          helper="Footprint"
        />
      </div>

      <div className="card">
        <div className="section-heading">
          <div>
            <h3>All chains</h3>
            <p className="subtitle">Search, activate, and manage via Ariakit primitives.</p>
          </div>
          <ComboboxProvider store={combobox}>
            <div style={{ minWidth: 240 }}>
              <Combobox store={combobox} className="combobox" placeholder="Filter by name" />
              <ComboboxPopover store={combobox} className="menu" gutter={6}>
                {chainNames.length === 0 ? (
                  <div className="menu-item" aria-disabled>
                    No chains yet
                  </div>
                ) : (
                  chainNames.map((name) => (
                    <ComboboxItem key={name} value={name} className="menu-item" />
                  ))
                )}
              </ComboboxPopover>
            </div>
          </ComboboxProvider>
        </div>

        {chainsQuery.isLoading ? (
          <div className="flex" style={{ padding: '12px 4px' }}>
            <Loader2 className="spin" size={18} /> Loading chains...
          </div>
        ) : chainsQuery.error ? (
          <div className="pill warn">Failed to load chains</div>
        ) : filteredChains.length === 0 ? (
          <div className="list-item">No chains match that filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plugins</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredChains.map((chain) => (
                  <ChainRow
                    key={chain.id}
                    chain={chain}
                    onActivate={() => activateChain.mutate(chain.id)}
                    onDeactivate={() => deactivateChain.mutate(chain.id)}
                    onDelete={() => deleteChain.mutate(chain.id)}
                    onRename={(newName) => renameChain.mutate({ id: chain.id, name: newName })}
                    disableActions={activateChain.isPending || deactivateChain.isPending || deleteChain.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Chain Dialog - Material-UI Version (Jan 20, 2026 Fix) */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create a new chain</DialogTitle>
        <DialogContent sx={{ minWidth: '400px' }}>
          <p style={{ marginBottom: '16px', color: '#999' }}>
            Name it, then add plugins from the Plugins view.
          </p>
          <TextField
            autoFocus
            fullWidth
            label="Chain name"
            placeholder="e.g. Modern Crunch"
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && chainName.trim()) {
                e.preventDefault();
                handleCreate(e as any);
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCreateDialogOpen(false);
            setChainName('');
          }}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={createChain.isPending || !chainName.trim()}
          >
            {createChain.isPending ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Create
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}

function ChainRow({
  chain,
  onActivate,
  onDeactivate,
  onDelete,
  onRename,
  disableActions,
}: {
  chain: Chain
  onActivate: () => void
  onDeactivate: () => void
  onDelete: () => void
  onRename: (name: string) => void
  disableActions: boolean
}) {
  const menu = useMenuStore()
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(chain.name)
  const pluginCount = chain.plugins.length

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = renameValue.trim()
    if (!trimmed) return
    onRename(trimmed)
    setRenameDialogOpen(false)
  }

  return (
    <tr>
      <td>{chain.name}</td>
      <td>{pluginCount} plugin{pluginCount === 1 ? '' : 's'}</td>
      <td>
        <span className={`pill ${chain.is_active ? 'success' : 'muted'}`}>
          {chain.is_active ? <BadgeCheck size={14} /> : null}
          {chain.is_active ? 'Active' : 'Idle'}
        </span>
      </td>
      <td>{chain.updated_at && !isNaN(new Date(chain.updated_at).getTime())
        ? new Date(chain.updated_at).toLocaleString()
        : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        <MenuProvider store={menu}>
          <MenuButton store={menu} className="btn btn-ghost btn-sm">Actions</MenuButton>
          <Menu store={menu} className="menu">
            {!chain.is_active ? (
              <MenuItem className="menu-item" onClick={onActivate} disabled={disableActions}>
                <Power size={16} /> Activate
              </MenuItem>
            ) : (
              <MenuItem className="menu-item" onClick={onDeactivate} disabled={disableActions}>
                <Power size={16} /> Deactivate
              </MenuItem>
            )}
            <MenuItem
              className="menu-item"
              onClick={() => {
                setRenameValue(chain.name)
                setRenameDialogOpen(true)
              }}
              disabled={disableActions}
            >
              Rename
            </MenuItem>
            <MenuItem 
              className="menu-item" 
              onClick={() => {
                if (confirm('Delete this chain? This removes the chain and its routing from the inventory. Presets remain unaffected.')) {
                  onDelete()
                }
              }} 
              disabled={disableActions}
            >
              <Trash2 size={16} /> Delete
            </MenuItem>
          </Menu>
        </MenuProvider>

        {/* Rename Dialog - Material-UI */}
        <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
          <DialogTitle>Rename chain</DialogTitle>
          <DialogContent sx={{ minWidth: '400px' }}>
            <p style={{ marginBottom: '16px', color: '#999' }}>
              Update the chain name and keep routing intact.
            </p>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              placeholder="e.g. Modern Crunch"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) {
                  e.preventDefault()
                  handleRenameSubmit(e as any)
                }
              }}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRenameSubmit}
              variant="contained"
              disabled={disableActions || !renameValue.trim()}
            >
              Rename
            </Button>
          </DialogActions>
        </Dialog>
      </td>
    </tr>
  )
}
