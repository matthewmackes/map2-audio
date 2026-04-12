import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  InlineLoading,
  InlineNotification,
  Layer,
  Modal,
  Select,
  SelectItem,
  Table,
  TableBatchAction,
  TableBatchActions,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react'
import { CheckmarkFilled, Renew, TrashCan, WarningAltFilled } from '@carbon/icons-react'
import { pluginsApi } from '../../map2/api'
import type { Plugin } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { LoadingState } from './shared/LoadingState'
import './PluginManagementCard.css'

type SortKey = 'name' | 'author' | 'format'

const HEADERS = [
  { key: 'name', header: 'Name' },
  { key: 'author', header: 'Author' },
  { key: 'format', header: 'Format' },
  { key: 'category', header: 'Category' },
  { key: 'status', header: 'Status' },
  { key: 'uri', header: 'URI' },
]

function toRows(plugins: Plugin[]) {
  return plugins.map((plugin) => ({
    id: plugin.uri,
    name: getDisplayPluginName(plugin.name, plugin.uri),
    author: sanitizeRestrictedDisplayText(plugin.author) || 'Unknown',
    format: plugin.format || 'LV2',
    category: plugin.category || 'Uncategorized',
    status: 'Active',
    uri: plugin.uri,
  }))
}

export function PluginManagementCard() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [deleteCandidateUris, setDeleteCandidateUris] = useState<string[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['plugins', 'all'],
    queryFn: () => pluginsApi.discover(false),
  })

  const plugins = useMemo(() => {
    const list = data?.plugins ?? []
    const loweredSearch = searchTerm.trim().toLowerCase()

    const filtered = loweredSearch
      ? list.filter((plugin) =>
          getDisplayPluginName(plugin.name, plugin.uri).toLowerCase().includes(loweredSearch)
            || sanitizeRestrictedDisplayText(plugin.author).toLowerCase().includes(loweredSearch)
            || plugin.uri.toLowerCase().includes(loweredSearch),
        )
      : list.slice()

    filtered.sort((left, right) => {
      if (sortBy === 'author') {
        return sanitizeRestrictedDisplayText(left.author).localeCompare(sanitizeRestrictedDisplayText(right.author))
          || getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
      }

      if (sortBy === 'format') {
        return (left.format || '').localeCompare(right.format || '')
          || getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
      }

      return getDisplayPluginName(left.name, left.uri).localeCompare(getDisplayPluginName(right.name, right.uri))
    })

    return filtered
  }, [data?.plugins, searchTerm, sortBy])

  const rows = useMemo(() => toRows(plugins), [plugins])

  const deleteMutation = useMutation({
    mutationFn: async (uris: string[]) => {
      const failures: string[] = []

      for (const uri of uris) {
        try {
          await pluginsApi.delete(uri)
        } catch (mutationError: any) {
          failures.push(mutationError?.message || `Failed to delete ${uri}`)
        }
      }

      if (failures.length > 0) {
        throw new Error(failures.join(', '))
      }

      return uris
    },
    onSuccess: async () => {
      setDeleteCandidateUris([])
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await pluginsApi.discover(true)
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <Layer className="plugin-management-card__layer">
      <Tile className="plugin-management-card">
        <div className="plugin-management-card__header">
          <div>
            <h2 className="plugin-management-card__title">Plugin Management</h2>
            <p className="plugin-management-card__subtitle">{rows.length} plugins available for chain use</p>
          </div>
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Renew}
            disabled={isLoading || isRefreshing}
            onClick={() => void handleRefresh()}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh catalog'}
          </Button>
        </div>

        {deleteMutation.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Delete failed"
            subtitle={(deleteMutation.error as Error)?.message || 'One or more plugins could not be deleted.'}
          />
        ) : null}

        {deleteMutation.isSuccess ? (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title="Delete complete"
            subtitle="Selected plugins were removed from the local plugin catalog."
          />
        ) : null}

        {isLoading ? (
          <div className="plugin-management-card__loading">
            <LoadingState description="Loading plugins" />
          </div>
        ) : isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Unable to load plugins"
            subtitle={error instanceof Error ? error.message : 'Plugin discovery failed.'}
          />
        ) : (
          <DataTable rows={rows} headers={HEADERS} isSortable useZebraStyles>
            {({
              rows: tableRows,
              headers,
              getBatchActionProps,
              getHeaderProps,
              getRowProps,
              getSelectionProps,
              getTableProps,
              getTableContainerProps,
              getToolbarProps,
              selectedRows,
            }) => (
              <TableContainer
                {...getTableContainerProps()}
                title="Installed plugin inventory"
                description="Search, sort, and batch-delete plugins that are no longer required."
                className="plugin-management-card__table-container"
              >
                <TableToolbar {...getToolbarProps()}>
                  <TableBatchActions {...getBatchActionProps()}>
                    <TableBatchAction
                      renderIcon={TrashCan}
                      iconDescription="Delete selected plugins"
                      onClick={() => setDeleteCandidateUris(selectedRows.map((row) => row.id))}
                    >
                      Delete
                    </TableBatchAction>
                  </TableBatchActions>
                  <TableToolbarContent className="plugin-management-card__toolbar-content">
                    <TableToolbarSearch
                      persistent
                      value={searchTerm}
                      onChange={(_event, value) => setSearchTerm(value ?? '')}
                    />
                    <div className="plugin-management-card__sort">
                      <Select
                        id="plugin-management-sort"
                        labelText="Sort plugins"
                        value={sortBy}
                        size="sm"
                        onChange={(event) => setSortBy(event.target.value as SortKey)}
                      >
                        <SelectItem value="name" text="Sort by name" />
                        <SelectItem value="author" text="Sort by author" />
                        <SelectItem value="format" text="Sort by format" />
                      </Select>
                    </div>
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()} aria-label="Plugin management table">
                  <TableHead>
                    <TableRow>
                      <TableSelectAll {...getSelectionProps()} />
                      {headers.map((header) => {
                        const { key: _headerKey, ...headerProps } = getHeaderProps({ header })
                        return (
                          <TableHeader key={header.key} {...headerProps}>
                            {header.header}
                          </TableHeader>
                        )
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => {
                      const { key: _rowKey, ...rowProps } = getRowProps({ row })
                      return (
                        <TableRow key={row.id} {...rowProps}>
                          <TableSelectRow {...getSelectionProps({ row })} />
                          {row.cells.map((cell) => {
                          if (cell.info.header === 'status') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type="green" renderIcon={CheckmarkFilled}>
                                  Active
                                </Tag>
                              </TableCell>
                            )
                          }

                          if (cell.info.header === 'format') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type="blue">{String(cell.value)}</Tag>
                              </TableCell>
                            )
                          }

                          if (cell.info.header === 'uri') {
                            return (
                              <TableCell key={cell.id}>
                                <span className="plugin-management-card__uri" title={String(cell.value)}>
                                  {String(cell.value)}
                                </span>
                              </TableCell>
                            )
                          }

                            return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                          })}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}

        <Modal
          danger
          open={deleteCandidateUris.length > 0}
          modalHeading="Delete plugins"
          primaryButtonText={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          secondaryButtonText="Cancel"
          onRequestClose={() => setDeleteCandidateUris([])}
          onRequestSubmit={() => deleteMutation.mutate(deleteCandidateUris)}
          primaryButtonDisabled={deleteMutation.isPending}
        >
          <div className="plugin-management-card__modal-copy">
            <WarningAltFilled size={20} />
            <p>
              Permanently remove {deleteCandidateUris.length} plugin{deleteCandidateUris.length === 1 ? '' : 's'} from this system.
              This action cannot be undone.
            </p>
          </div>
        </Modal>
      </Tile>
    </Layer>
  )
}
