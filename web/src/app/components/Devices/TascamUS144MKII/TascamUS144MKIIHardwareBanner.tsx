// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Always-visible reminder of the hardware-only front-panel controls. The
// US-144MKII's gain pots, +48 V switch, Hi-Z switch, MON MIX knob, LINE OUT
// level, and PHONES level are all analog and not software-readable. This
// banner is the operator's reminder so they don't waste time hunting for
// software knobs that don't exist.

import { Tag } from '@carbon/react'

import type { TascamStatusPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIHardwareBannerProps {
  status?: TascamStatusPayload
}

export function TascamUS144MKIIHardwareBanner({
  status,
}: TascamUS144MKIIHardwareBannerProps) {
  return (
    <div className="cds--inline-loading" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0' }}>
      <Tag type="cool-gray">Front-panel hardware (set on the unit)</Tag>
      <Tag type="cool-gray">+48 V phantom</Tag>
      <Tag type="cool-gray">Hi-Z ch 2</Tag>
      <Tag type="cool-gray">MON MIX</Tag>
      <Tag type="cool-gray">INPUT gain ×2</Tag>
      <Tag type="cool-gray">LINE OUT / PHONES level</Tag>
      {status?.vid_pid ? <Tag type="blue">{status.vid_pid}</Tag> : null}
      {status?.tier1_sample_rate_hz ? (
        <Tag type="blue">{status.tier1_sample_rate_hz / 1000} kHz</Tag>
      ) : null}
      {status?.tier1_buffer_samples ? (
        <Tag type="blue">{status.tier1_buffer_samples}-sample buffer</Tag>
      ) : null}
    </div>
  )
}
