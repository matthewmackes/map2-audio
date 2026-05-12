// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Status tab. Driver + USB enumeration state at a glance.

import { Button, StructuredListBody, StructuredListCell, StructuredListHead, StructuredListRow, StructuredListWrapper, Tag } from '@carbon/react'
import { Reset } from '@carbon/icons-react'

import type { TascamStatusPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIStatusTabProps {
  status?: TascamStatusPayload
  loading: boolean
}

function stageTag(status?: TascamStatusPayload) {
  if (!status) return <Tag type="cool-gray">unknown</Tag>
  if (status.enumeration_stage === 'operational') return <Tag type="green">Operational</Tag>
  if (status.enumeration_stage === 'boot_mode') return <Tag type="warm-gray">Boot mode</Tag>
  return <Tag type="red">Disconnected</Tag>
}

async function resetUsb(): Promise<void> {
  const resp = await fetch('/api/v1/devices/tascam-us144mkii/reset?confirm=true', { method: 'POST' })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body?.detail?.message ?? `reset failed: HTTP ${resp.status}`)
  }
}

export function TascamUS144MKIIStatusTab({ status, loading }: TascamUS144MKIIStatusTabProps) {
  return (
    <div className="stack">
      <StructuredListWrapper>
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Property</StructuredListCell>
            <StructuredListCell head>Value</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          <StructuredListRow>
            <StructuredListCell>Device</StructuredListCell>
            <StructuredListCell>{status?.canonical_name ?? '—'}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Enumeration stage</StructuredListCell>
            <StructuredListCell>{stageTag(status)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Kernel module loaded</StructuredListCell>
            <StructuredListCell>
              {status?.module_loaded ? <Tag type="green">snd-usb-us144mkii</Tag> : <Tag type="red">not loaded</Tag>}
            </StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Operational VID:PID</StructuredListCell>
            <StructuredListCell>{status?.vid_pid ?? '—'}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Boot/loader VID:PID</StructuredListCell>
            <StructuredListCell>{status?.boot_vid_pid ?? '—'}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>USB sysfs path</StructuredListCell>
            <StructuredListCell>{status?.operational_path ?? '—'}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Sample rate (tier-1)</StructuredListCell>
            <StructuredListCell>{status?.tier1_sample_rate_hz ?? '—'} Hz</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Buffer size (tier-1)</StructuredListCell>
            <StructuredListCell>{status?.tier1_buffer_samples ?? '—'} samples</StructuredListCell>
          </StructuredListRow>
        </StructuredListBody>
      </StructuredListWrapper>
      <div>
        <Button
          kind="ghost"
          renderIcon={Reset}
          disabled={loading || !status}
          onClick={() => {
            void resetUsb()
          }}
        >
          Reset USB port
        </Button>
      </div>
    </div>
  )
}
