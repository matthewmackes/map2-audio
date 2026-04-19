import {
  Button,
  DataTable,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import type { MaschineEncoderMap } from '../../../map2/types'

const ENCODER_HEADERS = [
  { key: 'encoder', header: 'Encoder' },
  { key: 'parameter', header: 'Parameter' },
  { key: 'current', header: 'Current Value' },
  { key: 'actions', header: 'Actions' },
] as const

const ENCODER_ORDER = ['enc1', 'enc2', 'enc3', 'enc4', 'enc5', 'enc6', 'enc7', 'enc8', 'vol', 'tempo', 'swing'] as const

export function MaschineEncoderMapPanel({ encoderMap }: { encoderMap: MaschineEncoderMap | null }) {
  const encoderRows = ENCODER_ORDER.map((key) => {
    const entry = encoderMap?.[key] ?? null
    return {
      id: key,
      encoder: key.toUpperCase(),
      parameter: entry?.label ?? entry?.param_id ?? 'Unmapped',
      current: entry?.block_id ?? (entry?.fixed ? 'Fixed' : 'Pending'),
      actions: entry?.fixed ? 'Fixed' : 'Map / Clear',
      fixed: Boolean(entry?.fixed || key === 'enc1' || key === 'vol' || key === 'tempo'),
    }
  })

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-encoder-map-panel">
      <div className="maschine-page__panel-head">
        <h2>Encoder Map</h2>
        <Tag type="cool-gray">{encoderRows.length} controls</Tag>
      </div>
      <DataTable rows={encoderRows} headers={[...ENCODER_HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Maschine encoder ownership"
            description="Enc1, Vol, and Tempo are fixed by contract; remaining rows reflect the persisted snapshot encoder map."
          >
            <Table {...getTableProps()} size="sm" aria-label="Maschine encoder map">
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
                  const sourceRow = encoderRows.find((candidate) => candidate.id === row.id)
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'actions') {
                          return (
                            <TableCell key={cell.id}>
                              {sourceRow?.fixed
                                ? <Tag type="warm-gray">Fixed</Tag>
                                : <Button kind="ghost" size="sm">Map</Button>}
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'encoder') {
                          return (
                            <TableCell key={cell.id}>
                              <strong>{String(cell.value)}</strong>
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
    </Layer>
  )
}

export default MaschineEncoderMapPanel
