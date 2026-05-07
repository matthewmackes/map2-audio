/**
 * T2459-H3-CFG Phase 5 slice 3 — Discovery Wizard panel.
 *
 * What's shipped here (slice 3 — read + reset only):
 *   - Render the per-installation override (`~/.map2/devices/...yaml`) if it
 *     exists, with the full captured-bindings table.
 *   - Render a "no bindings captured yet" empty state if not.
 *   - "Reset to defaults" button → DELETE /api/devices/.../override (idempotent).
 *
 * Deferred to a follow-up backend slice:
 *   - "Start Discovery Wizard" interactive flow (POST /discovery/start +
 *     SSE/poll for prompt → step the operator through each control). The
 *     backend session-manager routes are listed in the route-module docstring
 *     but not yet implemented; the UI surfaces a clear placeholder so
 *     operators don't think it's broken.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Heading,
  InlineLoading,
  InlineNotification,
  Layer,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react'
import { useState } from 'react'

import meloaudioCommanderApi, {
  type CommanderBindingResponse,
  type CommanderOverrideResponse,
} from '../../../map2/clients/meloaudioCommander'

interface DiscoveryPanelProps {
  /** True if the connected device supports Discovery Wizard (stock or custom). */
  supportsDiscoveryWizard: boolean
}

interface BindingRow {
  id: string
  control: string
  status: string
  midino: number
  channel: number
  raw_value: string
}

const HEADERS = [
  { key: 'control', header: 'Control' },
  { key: 'status', header: 'Status' },
  { key: 'midino', header: 'Note / CC' },
  { key: 'channel', header: 'Ch' },
  { key: 'raw_value', header: 'Raw' },
]

function rowsForOverride(
  bindings: CommanderBindingResponse[] | undefined,
): BindingRow[] {
  if (!bindings) return []
  return bindings.map((b, idx) => ({
    id: `${b.control}-${idx}`,
    control: b.control,
    status: b.status,
    midino: b.midino,
    channel: b.channel,
    raw_value: b.raw_value === null || b.raw_value === undefined ? '—' : `${b.raw_value}`,
  }))
}

export function MeloAudioCommanderDiscoveryPanel({
  supportsDiscoveryWizard,
}: DiscoveryPanelProps) {
  const queryClient = useQueryClient()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const overrideQuery = useQuery({
    queryKey: ['meloaudio-commander', 'override'],
    queryFn: () => meloaudioCommanderApi.getOverride(),
    refetchOnWindowFocus: false,
  })

  const resetMutation = useMutation({
    mutationFn: () => meloaudioCommanderApi.deleteOverride(),
    onSuccess: () => {
      setShowResetConfirm(false)
      setMutationError(null)
      queryClient.invalidateQueries({
        queryKey: ['meloaudio-commander', 'override'],
      })
    },
    onError: (err) => setMutationError((err as Error).message),
  })

  const data: CommanderOverrideResponse | undefined = overrideQuery.data
  const rows = rowsForOverride(data?.bindings)

  return (
    <Tile className="meloaudio-commander-configurator__discovery">
      <header className="meloaudio-commander-configurator__discovery-header">
        <Heading className="meloaudio-commander-configurator__discovery-title">
          Stock-firmware Discovery Wizard
        </Heading>
        {data?.has_override ? (
          <Tag type="green" size="sm">
            Override loaded
          </Tag>
        ) : (
          <Tag type="cool-gray" size="sm">
            Using device-pack defaults
          </Tag>
        )}
      </header>

      <p className="meloaudio-commander-configurator__discovery-copy">
        Stock firmware emits different CC numbers depending on the active mode
        (Standard, Axe-Fx II/III, Helix, GT-1000…). Run the Discovery Wizard to
        capture this installation’s bindings to{' '}
        <code>~/.map2/devices/meloaudio-commander-discovered.yaml</code>. MAP2
        merges the override over the device-pack defaults at runtime.
      </p>

      {!supportsDiscoveryWizard ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Discovery Wizard not available"
          subtitle="Plug in the Commander (stock or custom firmware) and reload. The wizard requires a device on the USB bus."
        />
      ) : null}

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Interactive wizard ships in the next backend slice"
        subtitle="Slice 3 ships override read + reset. The interactive 'press each switch' flow lands when the backend session-manager routes go live (slice 2 of the route module)."
      />

      {overrideQuery.isLoading ? (
        <InlineLoading description="Loading override…" />
      ) : null}

      {overrideQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load override"
          subtitle="The override file is malformed or the backend errored. Open the file and fix it, or reset to defaults below."
        />
      ) : null}

      {mutationError ? (
        <InlineNotification
          kind="error"
          lowContrast
          title="Reset failed"
          subtitle={mutationError}
          onClose={() => setMutationError(null)}
        />
      ) : null}

      {data?.has_override ? (
        <>
          <dl className="meloaudio-commander-configurator__discovery-meta">
            {data.captured_at_utc ? (
              <>
                <dt>Captured</dt>
                <dd>{data.captured_at_utc}</dd>
              </>
            ) : null}
            {data.device_serial ? (
              <>
                <dt>Device serial</dt>
                <dd>{data.device_serial}</dd>
              </>
            ) : null}
            {data.notes ? (
              <>
                <dt>Notes</dt>
                <dd>{data.notes}</dd>
              </>
            ) : null}
            {data.file_path ? (
              <>
                <dt>File</dt>
                <dd><code>{data.file_path}</code></dd>
              </>
            ) : null}
          </dl>

          <Layer level={2}>
            <DataTable rows={rows} headers={HEADERS}>
              {({ rows: dtRows, headers: dtHeaders, getHeaderProps, getRowProps, getTableProps }) => (
                <TableContainer
                  title="Captured bindings"
                  description={`${rows.length} control${rows.length === 1 ? '' : 's'} mapped`}
                >
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {dtHeaders.map((header) => (
                          <TableHeader {...getHeaderProps({ header })} key={header.key}>
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dtRows.map((row) => (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          </Layer>

          <div className="meloaudio-commander-configurator__discovery-actions">
            <Button
              kind="danger--tertiary"
              onClick={() => setShowResetConfirm(true)}
              disabled={resetMutation.isPending}
            >
              Reset to defaults
            </Button>
          </div>
        </>
      ) : (
        !overrideQuery.isLoading && !overrideQuery.isError ? (
          <p className="meloaudio-commander-configurator__discovery-empty">
            No bindings captured yet. MAP2 is using the bundled device-pack
            defaults — these may or may not match your unit’s active mode.
          </p>
        ) : null
      )}

      <Modal
        open={showResetConfirm}
        modalHeading="Reset Commander bindings?"
        primaryButtonText="Reset"
        secondaryButtonText="Cancel"
        danger
        onRequestClose={() => setShowResetConfirm(false)}
        onRequestSubmit={() => resetMutation.mutate()}
        primaryButtonDisabled={resetMutation.isPending}
      >
        <p>
          This deletes the per-installation override file. MAP2 will fall back to
          the bundled device-pack defaults. To re-capture, run the Discovery
          Wizard again. This action can’t be undone.
        </p>
      </Modal>
    </Tile>
  )
}

export default MeloAudioCommanderDiscoveryPanel
