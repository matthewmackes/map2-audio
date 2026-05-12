// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Metering tab. Reads from /api/v1/devices/tascam-us144mkii/meters
// when available, else surfaces a Carbon placeholder. Live metering wiring to
// the JUCE engine's ring-buffer metering pipeline is the responsibility of
// T2515 follow-up; the panel renders inputs/outputs declared by capabilities
// so the structure is already in place.

import { useQuery } from '@tanstack/react-query'

import { InlineNotification, Tag } from '@carbon/react'

import type { TascamCapabilitiesPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIMeteringTabProps {
  capabilities?: TascamCapabilitiesPayload
}

interface MeterPayload {
  input_peak_db: number[]
  output_peak_db: number[]
}

const REFETCH_MS = 250

export function TascamUS144MKIIMeteringTab({ capabilities }: TascamUS144MKIIMeteringTabProps) {
  const metersQuery = useQuery<MeterPayload>({
    queryKey: ['tascam-us144mkii', 'meters'],
    queryFn: async () => {
      const resp = await fetch('/api/v1/devices/tascam-us144mkii/meters')
      if (!resp.ok) throw new Error(`meters HTTP ${resp.status}`)
      return resp.json()
    },
    refetchInterval: REFETCH_MS,
    staleTime: 0,
    retry: false,
  })

  if (!capabilities) {
    return <div>Loading device profile…</div>
  }

  if (metersQuery.isError) {
    return (
      <InlineNotification
        kind="info"
        lowContrast
        title="Live metering not yet available on this device"
        subtitle="Input gain is set via the front-panel analog pots; the digital metering pipeline for this interface ships in a follow-up. Use the JUCE engine's master metering for now."
        hideCloseButton
      />
    )
  }

  const meters = metersQuery.data
  return (
    <div className="stack">
      <section>
        <h4>Inputs</h4>
        <ul className="cds--list--unordered">
          {capabilities.analog_return_channels.concat(capabilities.spdif_return_channels).map((idx, i) => {
            const isSpdif = i >= capabilities.analog_return_channels.length
            const peak = meters?.input_peak_db?.[i]
            return (
              <li key={`im-${idx}`}>
                <Tag type={isSpdif ? 'magenta' : 'blue'}>ch&nbsp;{idx}</Tag>{' '}
                {peak === undefined ? '— dBFS' : `${peak.toFixed(1)} dBFS`}
              </li>
            )
          })}
        </ul>
      </section>
      <section>
        <h4>Outputs</h4>
        <ul className="cds--list--unordered">
          {capabilities.analog_send_channels.concat(capabilities.spdif_send_channels).map((idx, i) => {
            const isSpdif = i >= capabilities.analog_send_channels.length
            const peak = meters?.output_peak_db?.[i]
            return (
              <li key={`om-${idx}`}>
                <Tag type={isSpdif ? 'magenta' : 'blue'}>ch&nbsp;{idx}</Tag>{' '}
                {peak === undefined ? '— dBFS' : `${peak.toFixed(1)} dBFS`}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
