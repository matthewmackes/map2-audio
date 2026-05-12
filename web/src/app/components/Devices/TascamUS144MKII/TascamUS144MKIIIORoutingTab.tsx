// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — I/O Routing tab. Renders the declared 4x4 channel layout.

import { Tag } from '@carbon/react'

import type { TascamCapabilitiesPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIIORoutingTabProps {
  capabilities?: TascamCapabilitiesPayload
}

interface ChannelRow {
  index: number
  direction: 'input' | 'output'
  kind: 'analog' | 'spdif'
  label: string
}

function buildRows(caps?: TascamCapabilitiesPayload): ChannelRow[] {
  if (!caps) return []
  const rows: ChannelRow[] = []
  caps.analog_send_channels.forEach((idx, i) => {
    rows.push({
      index: idx,
      direction: 'output',
      kind: 'analog',
      label: `Analog OUT ${i === 0 ? 'L' : 'R'} (LINE OUT)`,
    })
  })
  caps.spdif_send_channels.forEach((idx, i) => {
    rows.push({
      index: idx,
      direction: 'output',
      kind: 'spdif',
      label: `S/PDIF OUT ${i === 0 ? 'L' : 'R'} (coax)`,
    })
  })
  caps.analog_return_channels.forEach((idx, i) => {
    rows.push({
      index: idx,
      direction: 'input',
      kind: 'analog',
      label: `Analog IN ${i === 0 ? 'L' : 'R'} (combo XLR/TRS)`,
    })
  })
  caps.spdif_return_channels.forEach((idx, i) => {
    rows.push({
      index: idx,
      direction: 'input',
      kind: 'spdif',
      label: `S/PDIF IN ${i === 0 ? 'L' : 'R'} (coax)`,
    })
  })
  return rows
}

export function TascamUS144MKIIIORoutingTab({ capabilities }: TascamUS144MKIIIORoutingTabProps) {
  const rows = buildRows(capabilities)
  if (rows.length === 0) {
    return <div>Loading channel map…</div>
  }

  const outputs = rows.filter((r) => r.direction === 'output')
  const inputs = rows.filter((r) => r.direction === 'input')

  return (
    <div className="stack">
      <section>
        <h4>Outputs (playback)</h4>
        <ul className="cds--list--unordered">
          {outputs.map((row) => (
            <li key={`out-${row.index}`}>
              <Tag type={row.kind === 'spdif' ? 'magenta' : 'blue'}>ch&nbsp;{row.index}</Tag> {row.label}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Inputs (capture)</h4>
        <ul className="cds--list--unordered">
          {inputs.map((row) => (
            <li key={`in-${row.index}`}>
              <Tag type={row.kind === 'spdif' ? 'magenta' : 'blue'}>ch&nbsp;{row.index}</Tag> {row.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
