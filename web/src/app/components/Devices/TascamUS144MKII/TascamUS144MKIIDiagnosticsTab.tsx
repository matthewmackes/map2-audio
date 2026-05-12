// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Diagnostics tab. Shows the kernel-module path, USB topology, and
// links into the broader audio-diagnostics surface for xrun / jitter data.

import { Link, StructuredListBody, StructuredListCell, StructuredListHead, StructuredListRow, StructuredListWrapper } from '@carbon/react'

import type { TascamCapabilitiesPayload, TascamStatusPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIDiagnosticsTabProps {
  status?: TascamStatusPayload
  capabilities?: TascamCapabilitiesPayload
}

export function TascamUS144MKIIDiagnosticsTab({
  status,
  capabilities,
}: TascamUS144MKIIDiagnosticsTabProps) {
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
            <StructuredListCell>Kernel module</StructuredListCell>
            <StructuredListCell>{capabilities?.kernel_module ?? '—'}</StructuredListCell>
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
            <StructuredListCell>Sample format</StructuredListCell>
            <StructuredListCell>{capabilities?.format ?? '—'}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Tier-1 sample rate</StructuredListCell>
            <StructuredListCell>{capabilities?.sample_rate ?? '—'} Hz</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Tier-1 buffer size</StructuredListCell>
            <StructuredListCell>{capabilities?.buffer_size ?? '—'} samples</StructuredListCell>
          </StructuredListRow>
        </StructuredListBody>
      </StructuredListWrapper>
      <p>
        For platform-wide xrun / jitter data see{' '}
        <Link href="/audio-diagnostics">/audio-diagnostics</Link>.
      </p>
    </div>
  )
}
