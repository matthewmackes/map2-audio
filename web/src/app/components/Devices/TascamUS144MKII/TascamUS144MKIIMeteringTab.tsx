// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2515-5 — Metering tab. Reads from /api/v1/devices/tascam-us144mkii/meters.
// Post-T2515-Follow-up-METER-WIRE the endpoint always returns a structured
// payload with a `source` field ('placeholder' until the JUCE engine ring-
// buffer wire-up lands, then 'engine'). The tab renders per-channel rows
// either way, formatting the silence sentinel (-150 dBFS) as an em-dash so
// "no measurement yet" is visually distinct from a real -150 dB reading.

import { useQuery } from '@tanstack/react-query'

import { InlineNotification, Tag } from '@carbon/react'

import type { TascamCapabilitiesPayload } from './TascamUS144MKIIView'

export interface TascamUS144MKIIMeteringTabProps {
  capabilities?: TascamCapabilitiesPayload
}

interface MeterPayload {
  input_peak_db: number[]
  output_peak_db: number[]
  source: 'placeholder' | 'engine'
}

const REFETCH_MS = 250
// Threshold matched to the Python service's SILENCE_DBFS constant
// (app/services/devices/tascam_us144mkii_meters.py). Any value <= this
// renders as an em-dash, mirroring formatPeakDb's policy elsewhere in
// the platform.
const SILENCE_THRESHOLD_DBFS = -149.9

function formatPeakDb(db: number | undefined): string {
  if (db === undefined || !Number.isFinite(db) || db <= SILENCE_THRESHOLD_DBFS) {
    return '—'
  }
  return `${db.toFixed(1)} dBFS`
}

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
        kind="warning"
        lowContrast
        title="Metering endpoint unavailable"
        subtitle="The /meters route did not respond. Check the backend logs — the structure should always return at least a placeholder snapshot."
        hideCloseButton
      />
    )
  }

  const meters = metersQuery.data
  const isPlaceholder = meters?.source === 'placeholder'

  return (
    <div className="stack" data-testid="tascam-metering-tab">
      <div className="stack" style={{ flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
        <Tag
          type={isPlaceholder ? 'warm-gray' : 'green'}
          data-testid="tascam-meters-source-tag"
          size="sm"
        >
          {isPlaceholder ? 'Awaiting engine wire-up' : 'Live'}
        </Tag>
        {isPlaceholder ? (
          <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem' }}>
            Showing channel structure only — engine ring-buffer
            metering ships in a follow-up.
          </span>
        ) : null}
      </div>
      <section>
        <h4>Inputs</h4>
        <ul className="cds--list--unordered">
          {capabilities.analog_return_channels.concat(capabilities.spdif_return_channels).map((idx, i) => {
            const isSpdif = i >= capabilities.analog_return_channels.length
            const peak = meters?.input_peak_db?.[i]
            return (
              <li key={`im-${idx}`} data-testid={`tascam-meter-in-${idx}`}>
                <Tag type={isSpdif ? 'magenta' : 'blue'}>ch&nbsp;{idx}</Tag>{' '}
                {formatPeakDb(peak)}
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
              <li key={`om-${idx}`} data-testid={`tascam-meter-out-${idx}`}>
                <Tag type={isSpdif ? 'magenta' : 'blue'}>ch&nbsp;{idx}</Tag>{' '}
                {formatPeakDb(peak)}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
