import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  InlineLoading,
  Layer,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add, Copy, Edit, Launch, TrashCan } from '@carbon/icons-react'

import { snapshotsApi } from '../../map2/clients/snapshots'
import type { SnapshotSummary } from '../../map2/types'
import { SnapshotPinButton } from '../components/SnapshotEditor/SnapshotPinButton'
import '../components/SnapshotEditor/SnapshotPinButton.css'

import './SnapshotsBrowserPage.css'

const HEADERS = [
  { key: 'name', header: 'Name' },
  { key: 'program', header: 'Program' },
  { key: 'tempo', header: 'Tempo' },
  { key: 'chains', header: 'Chains' },
  { key: 'updated', header: 'Updated' },
] as const

type HeaderKey = (typeof HEADERS)[number]['key']
type RowData = { id: string } & Record<HeaderKey, string | number>

function formatTempo(snapshot: SnapshotSummary): string {
  if (typeof snapshot.active_tempo_bpm === 'number') return `${Math.round(snapshot.active_tempo_bpm)} BPM`
  if (typeof snapshot.tempo_bpm === 'number') return `${Math.round(snapshot.tempo_bpm)} BPM`
  return '—'
}

function formatUpdated(snapshot: SnapshotSummary): string {
  const iso = snapshot.updated_at ?? snapshot.created_at
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString()
}

function buildDefaultName(existing: readonly SnapshotSummary[]): string {
  const taken = new Set(existing.map((s) => s.name))
  let i = existing.length + 1
  let candidate = `Snapshot ${i}`
  while (taken.has(candidate)) {
    i += 1
    candidate = `Snapshot ${i}`
  }
  return candidate
}

export function SnapshotsBrowserPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightParam = searchParams.get('highlight')
  const highlightId = highlightParam !== null ? Number(highlightParam) : null
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null)

  const listQuery = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => snapshotsApi.list(),
    refetchInterval: 5000,
  })

  const snapshots = listQuery.data?.snapshots ?? []

  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SnapshotSummary | null>(null)

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return snapshots
    return snapshots.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q),
    )
  }, [searchQuery, snapshots])

  const tableRows: RowData[] = useMemo(
    () =>
      filtered.map((s) => ({
        id: String(s.id),
        name: s.name,
        program: s.program_number ?? '—',
        tempo: formatTempo(s),
        chains: s.chain_count,
        updated: formatUpdated(s),
      })),
    [filtered],
  )

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['snapshots'] })
  }, [queryClient])

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => snapshotsApi.update(id, { name }),
    onSuccess: () => {
      invalidateList()
      setEditingId(null)
      setEditingDraft('')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => snapshotsApi.duplicate(id),
    onSuccess: invalidateList,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => {
      invalidateList()
      setPendingDelete(null)
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => snapshotsApi.activate(id),
    onSuccess: () => {
      invalidateList()
      navigate('/snapshot-editor')
    },
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => snapshotsApi.create({ name }),
    onSuccess: () => {
      invalidateList()
      navigate('/snapshot-editor')
    },
  })

  const handleRenameStart = useCallback((snapshot: SnapshotSummary) => {
    setEditingId(snapshot.id)
    setEditingDraft(snapshot.name)
  }, [])

  const handleRenameSubmit = useCallback(() => {
    if (editingId == null) return
    const trimmed = editingDraft.trim()
    if (!trimmed) return
    renameMutation.mutate({ id: editingId, name: trimmed })
  }, [editingDraft, editingId, renameMutation])

  const handleRenameCancel = useCallback(() => {
    setEditingId(null)
    setEditingDraft('')
  }, [])

  const handleOpen = useCallback(
    (id: number) => {
      activateMutation.mutate(id)
    },
    [activateMutation],
  )

  const handleNewSnapshot = useCallback(() => {
    const name = buildDefaultName(snapshots)
    createMutation.mutate(name)
  }, [createMutation, snapshots])

  useEffect(() => {
    if (highlightId == null || Number.isNaN(highlightId)) return
    if (!snapshots.some((s) => s.id === highlightId)) return
    const node = highlightedRowRef.current
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      next.delete('highlight')
      setSearchParams(next, { replace: true })
    }, 4000)
    return () => window.clearTimeout(timeout)
  }, [highlightId, snapshots, searchParams, setSearchParams])

  return (
    <div className="snapshots-browser">
      <Layer className="snapshots-browser__header">
        <div className="snapshots-browser__title">
          <h1>Snapshots</h1>
          <p>Browse, rename, duplicate, and delete saved snapshots.</p>
        </div>
        <div className="snapshots-browser__actions">
          <Button
            kind="primary"
            renderIcon={Add}
            onClick={handleNewSnapshot}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating…' : 'New Snapshot'}
          </Button>
        </div>
      </Layer>

      <Tile className="snapshots-browser__tile">
        {listQuery.isLoading ? (
          <InlineLoading description="Loading snapshots…" />
        ) : listQuery.isError ? (
          <p className="snapshots-browser__error">Failed to load snapshots.</p>
        ) : snapshots.length === 0 ? (
          <div className="snapshots-browser__empty">
            <p>No snapshots yet.</p>
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={handleNewSnapshot}
              disabled={createMutation.isPending}
            >
              Create first snapshot
            </Button>
          </div>
        ) : (
          <DataTable rows={tableRows} headers={Array.from(HEADERS)} isSortable useZebraStyles>
            {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
              <TableContainer {...getTableContainerProps()} className="snapshots-browser__table-container">
                <TableToolbar {...getToolbarProps()}>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      value={searchQuery}
                      onChange={(event) => {
                        if (typeof event === 'string') {
                          setSearchQuery(event)
                          return
                        }
                        const target = (event as { target?: HTMLInputElement } | undefined)?.target
                        setSearchQuery(target?.value ?? '')
                      }}
                      placeholder="Search snapshots…"
                    />
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()} aria-label="Snapshots">
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => {
                        const { key: _k, ...hProps } = getHeaderProps({ header })
                        return (
                          <TableHeader key={header.key} {...hProps}>
                            {header.header}
                          </TableHeader>
                        )
                      })}
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      const snapshotId = Number(row.id)
                      const snapshot = filtered.find((s) => s.id === snapshotId)
                      if (!snapshot) return null
                      const { key: _k, ...rowProps } = getRowProps({ row })
                      const isEditing = editingId === snapshotId
                      const isHighlighted = highlightId === snapshotId
                      return (
                        <TableRow
                          key={row.id}
                          {...rowProps}
                          ref={isHighlighted ? highlightedRowRef : undefined}
                          className={[rowProps.className, isHighlighted ? 'snapshots-browser__row--highlighted' : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {row.cells.map((cell) => {
                            if (cell.info.header === 'name' && isEditing) {
                              return (
                                <TableCell key={cell.id}>
                                  <div className="snapshots-browser__rename">
                                    <TextInput
                                      id={`snapshot-rename-${snapshotId}`}
                                      labelText="Snapshot name"
                                      hideLabel
                                      size="sm"
                                      value={editingDraft}
                                      onChange={(event) => setEditingDraft(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault()
                                          handleRenameSubmit()
                                        } else if (event.key === 'Escape') {
                                          event.preventDefault()
                                          handleRenameCancel()
                                        }
                                      }}
                                      autoFocus
                                      disabled={renameMutation.isPending}
                                    />
                                    <Button
                                      size="sm"
                                      kind="primary"
                                      onClick={handleRenameSubmit}
                                      disabled={renameMutation.isPending || !editingDraft.trim()}
                                    >
                                      {renameMutation.isPending ? 'Saving…' : 'Save'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      kind="ghost"
                                      onClick={handleRenameCancel}
                                      disabled={renameMutation.isPending}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </TableCell>
                              )
                            }
                            if (cell.info.header === 'program') {
                              const value = cell.value
                              if (typeof value !== 'number') {
                                return <TableCell key={cell.id}>—</TableCell>
                              }
                              const bindingsHref = `/midi/bindings?consumer_type=snapshot&consumer_id=${snapshotId}`
                              return (
                                <TableCell key={cell.id}>
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    className="snapshots-browser__program-link"
                                    onClick={() => navigate(bindingsHref)}
                                    title={`View MIDI bindings for this snapshot (Program #${value})`}
                                    aria-label={`View MIDI bindings for snapshot, currently bound to Program #${value}`}
                                  >
                                    <Tag type="cool-gray">#{value}</Tag>
                                  </Button>
                                </TableCell>
                              )
                            }
                            return <TableCell key={cell.id}>{String(cell.value ?? '—')}</TableCell>
                          })}
                          <TableCell>
                            <div className="snapshots-browser__row-actions">
                              {/* T2454-D: per-row Pin button — cyan-fill on
                                  pinned, disabled tooltip on cap-reached. */}
                              <SnapshotPinButton snapshotId={snapshotId} />
                              <Button
                                size="sm"
                                kind="ghost"
                                renderIcon={Launch}
                                iconDescription="Open"
                                hasIconOnly
                                onClick={() => handleOpen(snapshotId)}
                                disabled={activateMutation.isPending}
                              />
                              <Button
                                size="sm"
                                kind="ghost"
                                renderIcon={Edit}
                                iconDescription="Rename"
                                hasIconOnly
                                onClick={() => handleRenameStart(snapshot)}
                                disabled={isEditing}
                              />
                              <Button
                                size="sm"
                                kind="ghost"
                                renderIcon={Copy}
                                iconDescription="Duplicate"
                                hasIconOnly
                                onClick={() => duplicateMutation.mutate(snapshotId)}
                                disabled={duplicateMutation.isPending}
                              />
                              <Button
                                size="sm"
                                kind="ghost"
                                renderIcon={TrashCan}
                                iconDescription="Delete"
                                hasIconOnly
                                onClick={() => setPendingDelete(snapshot)}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Tile>

      <Modal
        open={pendingDelete != null}
        modalHeading="Delete snapshot?"
        modalLabel="Snapshots"
        primaryButtonText={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        secondaryButtonText="Cancel"
        danger
        onRequestClose={() => setPendingDelete(null)}
        onRequestSubmit={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
        primaryButtonDisabled={deleteMutation.isPending || !pendingDelete}
      >
        {pendingDelete ? (
          <p>
            Permanently delete <strong>{pendingDelete.name}</strong>? This cannot be undone.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}

export default SnapshotsBrowserPage
