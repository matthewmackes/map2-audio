import { useEffect, useMemo, useState } from 'react'
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
  Tag,
  TextInput,
} from '@carbon/react'
import type { MidiHubPresetSummary } from '../../../map2/api'

type PresetChainEditorProps = {
  chains: Record<string, string[]>
  presets: MidiHubPresetSummary[]
  presetNameById: Map<string, string>
  presetDescriptionById: Map<string, string>
  onSaveChain: (chainId: string, presetIds: string[]) => Promise<unknown>
  onRunChain: (chainId: string, intervalMs: number, cycles?: number | null) => Promise<unknown>
  onStopChain: (chainId: string) => Promise<unknown>
}

const HEADERS = [
  { key: 'step', header: 'Step' },
  { key: 'preset', header: 'Preset' },
  { key: 'description', header: 'Description' },
] as const

function moveItem(items: string[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function PresetChainEditor({
  chains,
  presets,
  presetNameById,
  presetDescriptionById,
  onSaveChain,
  onRunChain,
  onStopChain,
}: PresetChainEditorProps) {
  const chainIds = useMemo(() => Object.keys(chains), [chains])
  const [selectedChainId, setSelectedChainId] = useState('')
  const [workingPresetIds, setWorkingPresetIds] = useState<string[]>([])
  const [newPresetId, setNewPresetId] = useState('')
  const [intervalMs, setIntervalMs] = useState('500')
  const [cycles, setCycles] = useState('')

  useEffect(() => {
    const initialChainId = selectedChainId || chainIds[0] || ''
    setSelectedChainId(initialChainId)
    setWorkingPresetIds(initialChainId ? [...(chains[initialChainId] ?? [])] : [])
  }, [chainIds, chains, selectedChainId])

  const rows = useMemo(
    () =>
      workingPresetIds.map((presetId, index) => ({
        id: `${presetId}-${index}`,
        presetId,
        step: index + 1,
        preset: presetNameById.get(presetId) ?? presetId,
        description: presetDescriptionById.get(presetId) ?? 'No description',
      })),
    [presetDescriptionById, presetNameById, workingPresetIds],
  )

  return (
    <div className="midi-hub-presets-section">
      <div className="midi-hub-presets-summary">
        <Tag type={chainIds.length > 0 ? 'green' : 'warm-gray'}>{`Chains ${chainIds.length}`}</Tag>
      </div>

      <div className="midi-hub-presets-form-grid">
        <TextInput
          id="midi-hub-chain-id"
          labelText="Preset chain"
          value={selectedChainId}
          onChange={(event) => {
            const nextChainId = event.currentTarget.value
            setSelectedChainId(nextChainId)
            setWorkingPresetIds(nextChainId ? [...(chains[nextChainId] ?? [])] : [])
          }}
          placeholder={chainIds[0] ?? 'show-open'}
        />
        <TextInput
          id="midi-hub-chain-add-preset"
          labelText="Add preset"
          value={newPresetId}
          onChange={(event) => setNewPresetId(event.currentTarget.value)}
          placeholder={presets[0]?.preset_id ?? 'baseline'}
        />
        <TextInput
          id="midi-hub-chain-interval"
          labelText="Interval (ms)"
          value={intervalMs}
          onChange={(event) => setIntervalMs(event.currentTarget.value)}
        />
        <TextInput
          id="midi-hub-chain-cycles"
          labelText="Cycles"
          value={cycles}
          onChange={(event) => setCycles(event.currentTarget.value)}
          placeholder="Optional"
        />
      </div>

      <div className="midi-hub-presets-toolbar">
        <Button
          size="sm"
          kind="secondary"
          disabled={!selectedChainId || !newPresetId.trim()}
          onClick={() => {
            if (!newPresetId.trim()) return
            setWorkingPresetIds((current) => [...current, newPresetId.trim()])
            setNewPresetId('')
          }}
        >
          Add to chain
        </Button>
        <Button
          size="sm"
          kind="primary"
          disabled={!selectedChainId}
          onClick={() => void onSaveChain(selectedChainId, workingPresetIds)}
        >
          Save chain order
        </Button>
        <Button
          size="sm"
          kind="secondary"
          disabled={!selectedChainId}
          onClick={() =>
            void onRunChain(
              selectedChainId,
              Math.max(25, Number.parseInt(intervalMs || '500', 10) || 500),
              cycles.trim() ? Math.max(1, Number.parseInt(cycles, 10) || 1) : null,
            )
          }
        >
          Run preset chain
        </Button>
        <Button size="sm" kind="danger--tertiary" disabled={!selectedChainId} onClick={() => void onStopChain(selectedChainId)}>
          Stop preset chain
        </Button>
      </div>

      <DataTable rows={rows} headers={[...HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Preset Chains"
            description="Stage the recall order and save the edited sequence back to the selected chain."
            className="midi-hub-presets-table"
          >
            <Table {...getTableProps()} aria-label="Preset chains">
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
                  <TableHeader>Order</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      ))}
                      <TableCell>
                        <div className="midi-hub-presets-inline-actions">
                          <Button
                            size="sm"
                            kind="ghost"
                            disabled={index === 0}
                            onClick={() => setWorkingPresetIds((current) => moveItem(current, index, index - 1))}
                          >
                            Move up
                          </Button>
                          <Button
                            size="sm"
                            kind="ghost"
                            disabled={index === rows.length - 1}
                            onClick={() => setWorkingPresetIds((current) => moveItem(current, index, index + 1))}
                          >
                            Move down
                          </Button>
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
    </div>
  )
}
