// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Clock tab. Renders the clock-source options the backend
// advertises (T2515-6-CLOCK). Tier-1 ship pins to internal 48 kHz to
// match the platform-wide Tier A locks; the transactional clock-source
// change endpoint ships in a T2515 follow-up, so this tab is read-only
// until then. The disabled radio buttons + InlineNotification together
// communicate "we know about these options, we just can't change them
// from the UI yet" — better than hiding the menu entirely.

import { useQuery } from '@tanstack/react-query'

import { InlineLoading, InlineNotification, RadioButton, RadioButtonGroup, Tag } from '@carbon/react'

interface ClockSourceOption {
  id: string
  label: string
  description: string
  selectable: boolean
}

interface ClockSourceResponse {
  selected: string
  locked_for_tier1: boolean
  sample_rate_hz: number
  options: ClockSourceOption[]
}

export function TascamUS144MKIIClockTab() {
  const clockQuery = useQuery<ClockSourceResponse>({
    queryKey: ['tascam-us144mkii', 'clock-source'],
    queryFn: async () => {
      const resp = await fetch(
        '/api/v1/devices/tascam-us144mkii/clock-source',
      )
      if (!resp.ok) throw new Error(`clock-source HTTP ${resp.status}`)
      return resp.json()
    },
    staleTime: 5_000,
    retry: false,
  })

  if (clockQuery.isLoading) {
    return <InlineLoading description="Loading clock source…" />
  }

  if (clockQuery.isError || !clockQuery.data) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title="Clock-source state unavailable"
        subtitle="The /clock-source endpoint did not respond. The device pack still pins tier-1 to internal 48 kHz; this is a UI fetch issue, not a hardware issue."
      />
    )
  }

  const data = clockQuery.data
  return (
    <div className="stack" data-testid="tascam-clock-tab">
      <div>
        <Tag type="cool-gray" size="sm" data-testid="tascam-clock-rate-tag">
          {data.sample_rate_hz / 1000} kHz
        </Tag>
        {data.locked_for_tier1 ? (
          <Tag
            type="warm-gray"
            size="sm"
            data-testid="tascam-clock-locked-tag"
            style={{ marginLeft: '0.5rem' }}
          >
            Pinned for tier-1
          </Tag>
        ) : null}
      </div>
      <RadioButtonGroup
        name="tascam-clock-source"
        valueSelected={data.selected}
        orientation="vertical"
        disabled
      >
        {data.options.map((opt) => (
          <RadioButton
            key={opt.id}
            id={`tascam-clock-${opt.id}`}
            value={opt.id}
            labelText={`${opt.label}${opt.selectable ? '' : ' — read-only'}`}
          />
        ))}
      </RadioButtonGroup>
      <InlineNotification
        kind="info"
        lowContrast
        title="Clock-source switching is read-only in tier-1 ship"
        subtitle={
          'The US-144MKII driver requires PCM streams to be stopped before any clock-source or sample-rate change. The transactional change endpoint ships in a T2515 follow-up; tier-1 boot pins to internal 48 kHz to match the platform-wide Tier A locks.'
        }
        hideCloseButton
      />
    </div>
  )
}
