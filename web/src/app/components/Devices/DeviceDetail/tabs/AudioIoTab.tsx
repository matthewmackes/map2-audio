// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// AudioIoTab — T2459-G5 placeholder shell.
//   Q17 (Audio I/O measure + history + baseline diff) lands in G6.
// Renders the loopback_ports declaration so operators can see the
// path-c contract is in place before G6 wires the Measure button.

import * as React from 'react'
import { Button, InlineNotification, StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell } from '@carbon/react'

import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'

export interface AudioIoTabProps {
  profile: DeviceProfileDetail
}

export function AudioIoTab({ profile }: AudioIoTabProps): React.JSX.Element {
  const doc = profile.document
  const loopback = doc.loopback_ports as { playback?: string; capture?: string } | undefined
  const hasLoopback = Boolean(loopback?.playback && loopback?.capture)

  if (!hasLoopback) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Audio I/O measurement not available"
          subtitle="This profile does not declare loopback_ports — path-c IR latency cannot be measured."
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <StructuredListWrapper aria-label="Loopback ports">
        <StructuredListBody>
          <StructuredListRow>
            <StructuredListCell>Playback</StructuredListCell>
            <StructuredListCell><code>{loopback?.playback}</code></StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell>Capture</StructuredListCell>
            <StructuredListCell><code>{loopback?.capture}</code></StructuredListCell>
          </StructuredListRow>
        </StructuredListBody>
      </StructuredListWrapper>
      <Button kind="primary" disabled aria-label="Measure latency (G6)">
        Measure latency (lands in G6)
      </Button>
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Coming in T2459-G6"
        subtitle="Live IR loopback measurement, history, and Compare-to-baseline diff land in the next subtask. The button + ProgressBar will replace this shell."
      />
    </div>
  )
}
