// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DiagnosticsTab — T2459-G5 base shell.
//   The bench-wide aggregate route + per-device deep-link UI lands in
//   G8. This shell shows the rows from `/api/devices/diagnostics`
//   filtered to the current pack so the operator sees pack-degraded
//   state immediately.

import * as React from 'react'
import { InlineNotification, Tag, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from '@carbon/react'

import { useDeviceDiagnostics } from '../../hooks/useDeviceProfiles'

export interface DiagnosticsTabProps {
  packId: string
}

const SEVERITY_TONE: Record<'info' | 'warning' | 'error', string> = {
  info: 'gray',
  warning: 'warm-gray',
  error: 'red',
}

export function DiagnosticsTab({ packId }: DiagnosticsTabProps): React.JSX.Element {
  const { data, isLoading, error } = useDeviceDiagnostics()
  const rows = (data?.diagnostics ?? []).filter((r) => !r.pack_id || r.pack_id === packId)

  if (error) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Diagnostics unavailable"
          subtitle="GET /api/devices/diagnostics returned an error. Try again after the backend redeploys."
        />
      </div>
    )
  }

  if (isLoading) {
    return <div style={{ padding: '1rem 0' }}>Loading diagnostics…</div>
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title="No issues for this pack"
          subtitle="The bench-wide diagnostics view (lands in G8) lists every pack + controller-host event."
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <StructuredListWrapper aria-label={`Diagnostics for ${packId}`}>
        <StructuredListBody>
          <StructuredListRow head>
            <StructuredListCell head>Severity</StructuredListCell>
            <StructuredListCell head>Source</StructuredListCell>
            <StructuredListCell head>Code</StructuredListCell>
            <StructuredListCell head>Detail</StructuredListCell>
          </StructuredListRow>
          {rows.map((r, i) => (
            <StructuredListRow key={`${r.code}-${i}`}>
              <StructuredListCell>
                <Tag size="sm" type={SEVERITY_TONE[r.severity] as never}>{r.severity}</Tag>
              </StructuredListCell>
              <StructuredListCell><code>{r.source}</code></StructuredListCell>
              <StructuredListCell><code>{r.code}</code></StructuredListCell>
              <StructuredListCell>{r.detail}</StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </div>
  )
}
