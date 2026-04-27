// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// BindingsTab — T2459-G5 placeholder shell.
//   Q13 (live save + 8s Undo) and Q16 (Learn Wizard route hookup)
//   land in G7. This shell renders read-only binding rows from the
//   profile YAML so operators can see what's there.

import * as React from 'react'
import { InlineNotification, Button, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from '@carbon/react'
import { useNavigate } from 'react-router-dom'

import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'

export interface BindingsTabProps {
  profile: DeviceProfileDetail
}

interface ControlRow {
  status?: number | string
  midino?: number | string
  channel?: number | string
  target?: string
  action?: string
  script?: string
  description?: string
}

function readControls(doc: Record<string, unknown>): ControlRow[] {
  const raw = doc.controls
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      status: typeof r.status === 'number' || typeof r.status === 'string' ? r.status as number | string : undefined,
      midino: typeof r.midino === 'number' || typeof r.midino === 'string' ? r.midino as number | string : undefined,
      channel: typeof r.channel === 'number' || typeof r.channel === 'string' ? r.channel as number | string : undefined,
      target: typeof r.target === 'string' ? r.target : undefined,
      action: typeof r.action === 'string' ? r.action : undefined,
      script: typeof r.script === 'string' ? r.script : undefined,
      description: typeof r.description === 'string' ? r.description : undefined,
    }))
}

export function BindingsTab({ profile }: BindingsTabProps): React.JSX.Element {
  const navigate = useNavigate()
  const controls = readControls(profile.document)

  if (profile.kind !== 'midi' && profile.kind !== 'hid') {
    return (
      <div style={{ padding: '1rem 0' }}>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No bindings on audio profiles"
          subtitle="MIDI/HID bindings live on midi/hid profiles. Switch kind via the Hardware Store catalogue."
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Button
        kind="primary"
        onClick={() =>
          navigate(
            `/devices/profile/${encodeURIComponent(profile.pack_id)}/${encodeURIComponent(profile.model)}/learn`,
          )
        }
      >
        Open Learn Wizard
      </Button>
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Coming in T2459-G7"
        subtitle="Live binding edit + 8s Undo (Q13) and inline classification panel land in the next subtask. The Learn Wizard route exists today (T2459-D4)."
      />
      <StructuredListWrapper aria-label="Bindings">
        <StructuredListBody>
          <StructuredListRow head>
            <StructuredListCell head>Status</StructuredListCell>
            <StructuredListCell head>CC / midino</StructuredListCell>
            <StructuredListCell head>Target</StructuredListCell>
            <StructuredListCell head>Action / Script</StructuredListCell>
            <StructuredListCell head>Description</StructuredListCell>
          </StructuredListRow>
          {controls.length === 0 ? (
            <StructuredListRow>
              <StructuredListCell>—</StructuredListCell>
              <StructuredListCell>—</StructuredListCell>
              <StructuredListCell>—</StructuredListCell>
              <StructuredListCell>—</StructuredListCell>
              <StructuredListCell>(no bindings declared)</StructuredListCell>
            </StructuredListRow>
          ) : (
            controls.map((c, i) => (
              <StructuredListRow key={`${c.target ?? c.script ?? i}-${i}`}>
                <StructuredListCell><code>{String(c.status ?? '—')}</code></StructuredListCell>
                <StructuredListCell><code>{String(c.midino ?? '—')}</code></StructuredListCell>
                <StructuredListCell><code>{c.target ?? '—'}</code></StructuredListCell>
                <StructuredListCell><code>{c.script ?? c.action ?? '—'}</code></StructuredListCell>
                <StructuredListCell>{c.description ?? ''}</StructuredListCell>
              </StructuredListRow>
            ))
          )}
        </StructuredListBody>
      </StructuredListWrapper>
    </div>
  )
}
