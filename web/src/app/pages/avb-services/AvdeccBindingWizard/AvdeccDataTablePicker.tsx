/**
 * T2499-C Slice 4 — DataTable picker for tier-2 (2-9 entities) and the
 * filter-bar shell for tier-3 (≥10 entities). Replaces the placeholders
 * in the wizard shell.
 *
 * Sortable columns: name / vendor / role (talker/listener/bidir) /
 * stream counts. Auto-suggest highlights entities whose name carries a
 * heuristic that maps to a Brain input slot (e.g. "Mic" → input,
 * "Drum" → input, "Aux" → return). The heuristic is plain-text, not
 * a model — operators always see the full table and can override.
 */
import React, { useMemo, useState } from 'react'
import {
  DataTable,
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
  Search,
  Tag,
  Button,
} from '@carbon/react'

import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'

// ---------------------------------------------------------------------------
// Auto-suggest heuristic
// ---------------------------------------------------------------------------

const SUGGEST_KEYWORDS = [
  'mic',
  'microphone',
  'drum',
  'kick',
  'snare',
  'guitar',
  'bass',
  'vocal',
  'vox',
  'di',
  'aux',
  'return',
]

export function suggestForBrainInput(entity: AvbAvdeccEntity): boolean {
  const haystack = `${entity.entity_name || ''}`.toLowerCase()
  if (!haystack) return false
  // The operator's bench almost always tags talkers as the source of
  // performance audio — we don't auto-suggest pure listeners as Brain
  // inputs because they consume rather than produce.
  if (!entity.capabilities.is_audio_talker) return false
  return SUGGEST_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

// ---------------------------------------------------------------------------
// Row + role helpers
// ---------------------------------------------------------------------------

export type EntityRole = 'talker' | 'listener' | 'bidir' | 'idle'

export function entityRole(entity: AvbAvdeccEntity): EntityRole {
  const t = entity.capabilities.is_audio_talker
  const l = entity.capabilities.is_audio_listener
  if (t && l) return 'bidir'
  if (t) return 'talker'
  if (l) return 'listener'
  return 'idle'
}

interface PickerRow {
  id: string
  name: string
  vendor: string
  role: EntityRole
  talkers: number
  listeners: number
  suggested: boolean
  raw: AvbAvdeccEntity
}

function toRow(entity: AvbAvdeccEntity): PickerRow {
  return {
    id: entity.entity_id,
    name: entity.entity_name || entity.entity_id,
    vendor: extractVendorFromMac(entity.mac_address) || 'Unknown',
    role: entityRole(entity),
    talkers: entity.capabilities.talker_streams,
    listeners: entity.capabilities.listener_streams,
    suggested: suggestForBrainInput(entity),
    raw: entity,
  }
}

// "Vendor" inferred from the IEEE OUI prefix (first three octets) of
// the MAC. We carry a tiny lookup so the column has something to show
// without pulling in a giant OUI database.
const OUI_HINTS: Record<string, string> = {
  '0010fa': 'Apple/MOTU',
  '00135a': 'Biamp',
  '000a35': 'L-Acoustics',
  '00d088': 'QSC',
}

function extractVendorFromMac(mac: string): string | null {
  const normalized = mac.replace(/[:.-]/g, '').slice(0, 6).toLowerCase()
  return OUI_HINTS[normalized] ?? null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AvdeccDataTablePickerProps {
  entities: AvbAvdeccEntity[]
  onSelectEntity: (entity: AvbAvdeccEntity) => void
}

export function AvdeccDataTablePicker({
  entities,
  onSelectEntity,
}: AvdeccDataTablePickerProps): React.ReactElement {
  const [filter, setFilter] = useState('')

  const rows: PickerRow[] = useMemo(
    () => entities.map(toRow),
    [entities],
  )

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.name, row.vendor, row.role, row.id].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    )
  }, [rows, filter])

  // Suggested rows float to the top; within each group, alphabetical by name.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [filtered])

  const headers = [
    { key: 'name', header: 'Name' },
    { key: 'vendor', header: 'Vendor' },
    { key: 'role', header: 'Role' },
    { key: 'talkers', header: 'Talkers' },
    { key: 'listeners', header: 'Listeners' },
    { key: 'action', header: '' },
  ]

  return (
    <div data-testid="avdecc-data-table-picker">
      <div style={{ marginBottom: 12 }}>
        <Search
          id="avdecc-picker-filter"
          labelText="Filter entities"
          placeholder="name, vendor, role…"
          size="lg"
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          data-testid="avdecc-picker-filter"
        />
      </div>
      {sorted.length === 0 && (
        <p data-testid="avdecc-picker-no-match" style={{ margin: 0 }}>
          No entities match {JSON.stringify(filter)}.
        </p>
      )}
      {sorted.length > 0 && (
        <Table size="sm" data-testid="avdecc-picker-table">
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableHeader key={h.key}>{h.header}</TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => (
              <TableRow
                key={row.id}
                data-testid={`avdecc-picker-row-${row.id}`}
                data-suggested={row.suggested ? 'true' : 'false'}
              >
                <TableCell>
                  {row.name}
                  {row.suggested && (
                    <Tag size="sm" type="cyan" style={{ marginLeft: 8 }}>
                      Suggested
                    </Tag>
                  )}
                </TableCell>
                <TableCell>{row.vendor}</TableCell>
                <TableCell>
                  <RoleTag role={row.role} />
                </TableCell>
                <TableCell>{row.talkers}</TableCell>
                <TableCell>{row.listeners}</TableCell>
                <TableCell>
                  <Button
                    kind={row.suggested ? 'primary' : 'tertiary'}
                    size="sm"
                    onClick={() => onSelectEntity(row.raw)}
                    data-testid={`avdecc-picker-bind-${row.id}`}
                  >
                    Bind
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function RoleTag({ role }: { role: EntityRole }): React.ReactElement {
  const map: Record<EntityRole, { type: string; label: string }> = {
    talker: { type: 'green', label: 'Talker' },
    listener: { type: 'blue', label: 'Listener' },
    bidir: { type: 'purple', label: 'Bidir' },
    idle: { type: 'warm-gray', label: 'Idle' },
  }
  const { type, label } = map[role]
  return (
    <Tag size="sm" type={type as any}>
      {label}
    </Tag>
  )
}

export default AvdeccDataTablePicker
