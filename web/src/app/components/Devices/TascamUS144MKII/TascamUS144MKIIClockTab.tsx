// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Clock tab. Currently declares the two clock sources the device
// pack advertises. The backend clock-source change endpoint is filed as a
// T2515 follow-up; the panel is wired with a placeholder Inline message so
// operators understand the state.

import { InlineNotification, RadioButton, RadioButtonGroup } from '@carbon/react'

const SOURCES = [
  { id: 'internal_48k', label: 'Internal 48 kHz (default)' },
  { id: 'spdif_in', label: 'S/PDIF input' },
] as const

export function TascamUS144MKIIClockTab() {
  return (
    <div className="stack">
      <RadioButtonGroup name="tascam-clock-source" valueSelected="internal_48k" orientation="vertical" disabled>
        {SOURCES.map((s) => (
          <RadioButton key={s.id} id={`tascam-clock-${s.id}`} value={s.id} labelText={s.label} />
        ))}
      </RadioButtonGroup>
      <InlineNotification
        kind="info"
        lowContrast
        title="Clock-source switching is read-only in tier-1 ship"
        subtitle="The US-144MKII driver requires PCM streams to be stopped before any clock-source or sample-rate change. The transactional change endpoint ships in a T2515 follow-up; tier-1 boot pins to internal 48 kHz to match the platform-wide Tier A locks."
        hideCloseButton
      />
    </div>
  )
}
