import { useDeferredValue, useMemo, useState } from 'react'
import {
  Button,
  CodeSnippet,
  ComposedModal,
  DataTable,
  FileUploader,
  ModalBody,
  ModalFooter,
  ModalHeader,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
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
} from '@carbon/react'
import type { MidiHubPresetSummary } from '../../../map2/api'

type PresetTableProps = {
  presets: MidiHubPresetSummary[]
  defaultPresetId: string | null
  compareResult: Record<string, unknown> | null
  onCreate: (payload: { name: string; description: string }) => Promise<unknown>
  onRecall: (presetId: string) => Promise<unknown>
  onDelete: (presetId: string) => Promise<unknown>
  onExport: (presetId: string) => Promise<unknown>
  onToggleDefault: (presetId: string) => Promise<unknown>
  onCompare: (leftPresetId: string, rightPresetId: string) => Promise<unknown>
  onImport: (path: string) => Promise<unknown>
}

const HEADERS = [
  { key: 'name', header: 'Preset' },
  { key: 'presetId', header: 'Preset ID' },
  { key: 'description', header: 'Description' },
  { key: 'defaultState', header: 'Default' },
] as const

export function PresetTable({
  presets,
  defaultPresetId,
  compareResult,
  onCreate,
  onRecall,
  onDelete,
  onExport,
  onToggleDefault,
  onCompare,
  onImport,
}: PresetTableProps) {
  const [searchValue, setSearchValue] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leftPresetId, setLeftPresetId] = useState('')
  const [rightPresetId, setRightPresetId] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [importPath, setImportPath] = useState('')
  const deferredSearch = useDeferredValue(searchValue)

  const rows = useMemo(
    () =>
      presets.map((preset) => ({
        id: preset.preset_id,
        name: preset.name,
        presetId: preset.preset_id,
        description: preset.description || 'No description',
        defaultState: defaultPresetId === preset.preset_id ? 'Default' : 'Standard',
      })),
    [defaultPresetId, presets],
  )

  const filteredRows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => `${row.name} ${row.presetId} ${row.description}`.toLowerCase().includes(needle))
  }, [deferredSearch, rows])

  return (
    <div className="midi-hub-presets-section">
      <div className="midi-hub-presets-summary">
        <Tag type={presets.length > 0 ? 'green' : 'warm-gray'}>{`Presets ${presets.length}`}</Tag>
        {defaultPresetId ? <Tag type="blue">{`Default ${defaultPresetId}`}</Tag> : null}
      </div>

      <div className="midi-hub-presets-form-grid">
        <TextInput
          id="midi-hub-preset-name"
          labelText="Preset name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextInput
          id="midi-hub-preset-description"
          labelText="Description"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
      </div>

      <div className="midi-hub-presets-toolbar">
        <Button
          size="sm"
          kind="primary"
          disabled={!name.trim()}
          onClick={async () => {
            await onCreate({ name: name.trim(), description: description.trim() })
            setName('')
            setDescription('')
          }}
        >
          Save current state
        </Button>
        <Button size="sm" kind="secondary" onClick={() => setCompareOpen(true)} disabled={presets.length < 2}>
          Compare presets
        </Button>
      </div>

      <DataTable rows={filteredRows} headers={[...HEADERS]} isSortable useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Preset table"
            description="Recall and manage saved hub states before moving into transport or capture."
            className="midi-hub-presets-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value ?? '')}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="MIDI Hub presets">
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
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'defaultState') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={cell.value === 'Default' ? 'blue' : 'cool-gray'}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                      <TableCell>
                        <OverflowMenu
                          ariaLabel={`Preset actions for ${row.id}`}
                          flipped
                          iconDescription={`Preset actions for ${row.id}`}
                          size="sm"
                        >
                          <OverflowMenuItem itemText="Recall" onClick={() => void onRecall(row.id)} />
                          <OverflowMenuItem itemText="Export" onClick={() => void onExport(row.id)} />
                          <OverflowMenuItem
                            itemText={defaultPresetId === row.id ? 'Unset default' : 'Make default'}
                            onClick={() => void onToggleDefault(row.id)}
                          />
                          <OverflowMenuItem isDelete itemText="Delete" onClick={() => void onDelete(row.id)} />
                        </OverflowMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <div className="midi-hub-presets-import">
        <FileUploader
          labelTitle="Import preset file"
          labelDescription="Use a local preset export filename or paste the backend-visible import path below."
          buttonLabel="Browse preset file"
          filenameStatus="edit"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (file) setImportPath(file.name)
          }}
        />
        <TextInput
          id="midi-hub-preset-import-path"
          labelText="Import path"
          value={importPath}
          onChange={(event) => setImportPath(event.currentTarget.value)}
          placeholder="~/.map2/midi_hub_presets/exports/show-a.json"
        />
        <Button size="sm" kind="secondary" disabled={!importPath.trim()} onClick={() => void onImport(importPath.trim())}>
          Import preset
        </Button>
      </div>

      <ComposedModal open={compareOpen} size="lg" onClose={() => setCompareOpen(false)}>
        <ModalHeader title="Compare presets" />
        <ModalBody>
          <div className="midi-hub-presets-form-grid">
            <Select
              id="midi-hub-compare-left"
              labelText="Compare left"
              value={leftPresetId}
              onChange={(event) => setLeftPresetId(event.currentTarget.value)}
            >
              <SelectItem value="" text="Select left preset" />
              {presets.map((preset) => (
                <SelectItem key={`left-${preset.preset_id}`} value={preset.preset_id} text={`${preset.name} (${preset.preset_id})`} />
              ))}
            </Select>
            <Select
              id="midi-hub-compare-right"
              labelText="Compare right"
              value={rightPresetId}
              onChange={(event) => setRightPresetId(event.currentTarget.value)}
            >
              <SelectItem value="" text="Select right preset" />
              {presets.map((preset) => (
                <SelectItem key={`right-${preset.preset_id}`} value={preset.preset_id} text={`${preset.name} (${preset.preset_id})`} />
              ))}
            </Select>
          </div>
          {compareResult ? (
            <CodeSnippet className="midi-hub-presets-code-block" type="multi">
              {JSON.stringify(compareResult, null, 2)}
            </CodeSnippet>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setCompareOpen(false)}>
            Close
          </Button>
          <Button
            kind="primary"
            disabled={!leftPresetId || !rightPresetId}
            onClick={() => void onCompare(leftPresetId, rightPresetId)}
          >
            Run compare
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  )
}
