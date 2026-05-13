// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceMeterSourceTag — Carbon Tag wrapper rendering the four-state
// meter-source signal for any device that reads through the
// /api/v1/devices/{id}/peak-meters route (T2519, tenth Continue run).
//
// Centralizing the Tag color/label policy here means every device's
// Status surface stays visually consistent — and any policy tweak
// (e.g. swap "Awaiting engine wire-up" for shorter copy) lands in one
// place rather than four.

import { Tag } from '@carbon/react'

import type { DeviceMeterSource } from '../../../hooks/useDeviceMeterSource'

export interface DeviceMeterSourceTagProps {
  source: DeviceMeterSource | undefined
  isError: boolean
  /**
   * Optional test-id override. Defaults to "device-meter-source-tag"
   * but each device's Status surface can pass a panel-scoped id so
   * RTL assertions stay clear.
   */
  testId?: string
}

export function DeviceMeterSourceTag({
  source,
  isError,
  testId,
}: DeviceMeterSourceTagProps) {
  const dataTestId = testId ?? 'device-meter-source-tag'

  if (isError) {
    return (
      <Tag type="red" data-testid={dataTestId}>
        Endpoint unavailable
      </Tag>
    )
  }
  if (source === 'engine') {
    return (
      <Tag type="green" data-testid={dataTestId}>
        Live
      </Tag>
    )
  }
  if (source === 'placeholder') {
    return (
      <Tag type="warm-gray" data-testid={dataTestId}>
        Awaiting engine wire-up
      </Tag>
    )
  }
  return (
    <Tag type="cool-gray" data-testid={dataTestId}>
      …
    </Tag>
  )
}
