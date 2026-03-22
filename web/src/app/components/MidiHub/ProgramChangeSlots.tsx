import { useMemo, useState } from 'react'
import {
  Button,
  DataTable,
  Select,
  SelectItem,
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

type ProgramChangeSlotsProps = {
  slotEntries: Array<{ program: number; target: string }>
  targetOptions: Array<{ value: string; label: string }>
  presetNameById: Map<string, string>
  onAssign: (programNumber: string, targetId: string) => Promise<unknown>
  onRemove: (programNumber: number) => Promise<unknown>
}

const HEADERS = [
  { key: 'program', header: 'Program' },
  { key: 'target', header: 'Target' },
  { key: 'label', header: 'Resolved label' },
] as const

export function ProgramChangeSlots({
  slotEntries,
  targetOptions,
  presetNameById,
  onAssign,
  onRemove,
}: ProgramChangeSlotsProps) {
  const [programNumber, setProgramNumber] = useState('0')
  const [targetId, setTargetId] = useState('')

  const rows = useMemo(
    () =>
      slotEntries.map((slot) => ({
        id: String(slot.program),
        program: `PC ${slot.program}`,
        target: slot.target,
        label: slot.target.startsWith('chain:')
          ? `Chain ${slot.target.replace(/^chain:/, '')}`
          : presetNameById.get(slot.target) ?? slot.target,
      })),
    [presetNameById, slotEntries],
  )

  return (
    <div className="midi-hub-presets-section">
      <div className="midi-hub-presets-summary">
        <Tag type="cool-gray">{`PC slots ${slotEntries.length}`}</Tag>
      </div>

      <div className="midi-hub-presets-form-grid">
        <TextInput
          id="midi-hub-pc-program"
          labelText="Program change number"
          value={programNumber}
          onChange={(event) => setProgramNumber(event.currentTarget.value)}
        />
        <Select
          id="midi-hub-pc-target"
          labelText="Program change target"
          value={targetId}
          onChange={(event) => setTargetId(event.currentTarget.value)}
        >
          <SelectItem value="" text="Select target" />
          {targetOptions.map((target) => (
            <SelectItem key={target.value} value={target.value} text={target.label} />
          ))}
        </Select>
      </div>

      <div className="midi-hub-presets-toolbar">
        <Button size="sm" kind="secondary" disabled={!targetId.trim()} onClick={() => void onAssign(programNumber, targetId.trim())}>
          Assign program change
        </Button>
      </div>

      <DataTable rows={rows} headers={[...HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Program Change Slots"
            description="Bind incoming program changes to presets or named recall chains."
            className="midi-hub-presets-table"
          >
            <Table {...getTableProps()} aria-label="Program change slots">
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
                        <Button size="sm" kind="danger--tertiary" onClick={() => void onRemove(Number(row.id))}>
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
