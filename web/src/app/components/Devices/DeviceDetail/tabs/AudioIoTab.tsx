// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// AudioIoTab — T2459-G6. Q17 Audio I/O measurement surface.
//
// Operator clicks "Measure latency" → POST /api/devices/measure-latency
// runs the path-c IR sweep and persists evidence under
// docs/fit-for-purpose-evidence/<YYYYMMDD>/<pack>/<model>/.
//
// History list reads back that directory tree via
// GET /api/devices/measure-latency/history. Compare-to-baseline picks
// any prior result and renders a delta vs. the most recent measurement.
//
// Hidden when the profile lacks loopback_ports (graceful degradation,
// matches T2459-A3 fail-soft).

import * as React from 'react'
import {
  Button,
  ProgressBar,
  InlineNotification,
  StructuredListWrapper,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  Tag,
  Select,
  SelectItem,
} from '@carbon/react'
import { useMutation } from '@tanstack/react-query'

import {
  measureLatency,
  type DeviceProfileDetail,
  type MeasureLatencyResult,
  type MeasureLatencyHistoryRow,
} from '../../../../../map2/clients/devices'
import { useMeasureLatencyHistory } from '../../hooks/useDeviceProfiles'

import './AudioIoTab.css'

export interface AudioIoTabProps {
  profile: DeviceProfileDetail
}

interface BaselineDiffRow {
  label: string
  current: number | null
  baseline: number | null
  delta: number | null
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n.toFixed(2)} ms`
}

function fmtDelta(n: number | null): React.ReactNode {
  if (n === null || Number.isNaN(n)) return <span>—</span>
  const sign = n > 0 ? '+' : ''
  const tone = n > 0.5 ? 'red' : n < -0.5 ? 'green' : 'cool-gray'
  return (
    <Tag size="sm" type={tone as never}>
      {sign}{n.toFixed(2)} ms
    </Tag>
  )
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

export function AudioIoTab({ profile }: AudioIoTabProps): React.JSX.Element {
  const doc = profile.document
  const loopback = doc.loopback_ports as { playback?: string; capture?: string } | undefined
  const hasLoopback = Boolean(loopback?.playback && loopback?.capture)

  const historyQuery = useMeasureLatencyHistory(profile.pack_id, profile.model)
  const [latest, setLatest] = React.useState<MeasureLatencyResult | null>(null)
  const [baselineEvidencePath, setBaselineEvidencePath] = React.useState<string | null>(null)

  const measure = useMutation<MeasureLatencyResult, Error, void>({
    mutationFn: () =>
      measureLatency({
        pack_id: profile.pack_id,
        model: profile.model,
        trials: 3,
        duration_ms: 500,
        tail_ms: 200,
      }),
    onSuccess: (result) => {
      setLatest(result)
      historyQuery.refetch()
    },
  })

  const history: MeasureLatencyHistoryRow[] = historyQuery.data?.history ?? []

  // Combine the in-memory latest result with the persisted history so
  // operators see what they just ran without waiting for the next
  // history refetch.
  const displayHistory = React.useMemo<MeasureLatencyHistoryRow[]>(() => {
    if (!latest) return history
    const synthetic: MeasureLatencyHistoryRow = {
      evidence_path: latest.evidence_path,
      timestamp: latest.timestamp,
      method: latest.method,
      mean_rtt_ms: latest.mean_rtt_ms,
      p95_rtt_ms: latest.p95_rtt_ms,
      jitter_p95_ms: latest.jitter_p95_ms,
      trial_count: latest.trials.length,
    }
    if (history.some((r) => r.evidence_path === synthetic.evidence_path)) {
      return history
    }
    return [synthetic, ...history]
  }, [latest, history])

  // Baseline diff: defaults to the second-most-recent (head excluded).
  const currentRow = displayHistory[0]
  const baselineRow = React.useMemo(() => {
    if (!baselineEvidencePath) {
      return displayHistory[1] ?? null
    }
    return displayHistory.find((r) => r.evidence_path === baselineEvidencePath) ?? null
  }, [displayHistory, baselineEvidencePath])

  const diffRows: BaselineDiffRow[] = React.useMemo(() => {
    if (!currentRow || !baselineRow) return []
    const safeDelta = (cur: number | null, base: number | null) =>
      cur !== null && base !== null ? cur - base : null
    return [
      {
        label: 'Mean RTT',
        current: currentRow.mean_rtt_ms,
        baseline: baselineRow.mean_rtt_ms,
        delta: safeDelta(currentRow.mean_rtt_ms, baselineRow.mean_rtt_ms),
      },
      {
        label: 'p95 RTT',
        current: currentRow.p95_rtt_ms,
        baseline: baselineRow.p95_rtt_ms,
        delta: safeDelta(currentRow.p95_rtt_ms, baselineRow.p95_rtt_ms),
      },
      {
        label: 'p95 jitter',
        current: currentRow.jitter_p95_ms,
        baseline: baselineRow.jitter_p95_ms,
        delta: safeDelta(currentRow.jitter_p95_ms, baselineRow.jitter_p95_ms),
      },
    ]
  }, [currentRow, baselineRow])

  if (!hasLoopback) {
    return (
      <div className="audio-io-tab">
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
    <div className="audio-io-tab">
      <section className="audio-io-tab__panel">
        <h3>Loopback ports</h3>
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
      </section>

      <section className="audio-io-tab__panel">
        <div className="audio-io-tab__measure-row">
          <Button
            kind="primary"
            disabled={measure.isPending}
            onClick={() => measure.mutate()}
            aria-label="Measure latency"
          >
            {measure.isPending ? 'Measuring…' : 'Measure latency'}
          </Button>
          {measure.isPending ? (
            <ProgressBar
              label="Path-c IR loopback sweep"
              helperText="Running 3 trials × 500 ms sweep + 200 ms tail"
              status="active"
            />
          ) : null}
        </div>

        {measure.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Measurement failed"
            subtitle={measure.error?.message ?? 'See backend logs.'}
          />
        ) : null}

        {currentRow ? (
          <div className="audio-io-tab__result">
            <h3>Most-recent measurement</h3>
            <StructuredListWrapper aria-label="Latest measurement">
              <StructuredListBody>
                <StructuredListRow>
                  <StructuredListCell>Mean RTT</StructuredListCell>
                  <StructuredListCell>{fmt(currentRow.mean_rtt_ms)}</StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>p95 RTT</StructuredListCell>
                  <StructuredListCell>{fmt(currentRow.p95_rtt_ms)}</StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>p95 jitter</StructuredListCell>
                  <StructuredListCell>{fmt(currentRow.jitter_p95_ms)}</StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>Method</StructuredListCell>
                  <StructuredListCell>
                    {currentRow.method ? (
                      <Tag size="sm" type={currentRow.method === 'jack' ? 'green' : 'cool-gray'}>
                        {currentRow.method}
                      </Tag>
                    ) : <span>—</span>}
                  </StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>When</StructuredListCell>
                  <StructuredListCell>{fmtTs(currentRow.timestamp)}</StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>Evidence</StructuredListCell>
                  <StructuredListCell><code>{currentRow.evidence_path}</code></StructuredListCell>
                </StructuredListRow>
              </StructuredListBody>
            </StructuredListWrapper>
          </div>
        ) : null}
      </section>

      {displayHistory.length > 1 ? (
        <section className="audio-io-tab__panel">
          <h3>Compare to baseline</h3>
          <Select
            id="audio-io-baseline-select"
            labelText="Baseline measurement"
            value={baselineRow?.evidence_path ?? ''}
            onChange={(e) => setBaselineEvidencePath(e.target.value || null)}
          >
            {displayHistory.slice(1).map((row) => (
              <SelectItem
                key={row.evidence_path}
                value={row.evidence_path}
                text={`${fmtTs(row.timestamp)} — mean ${fmt(row.mean_rtt_ms)}`}
              />
            ))}
          </Select>
          {diffRows.length > 0 ? (
            <StructuredListWrapper aria-label="Baseline diff">
              <StructuredListBody>
                <StructuredListRow head>
                  <StructuredListCell head>Metric</StructuredListCell>
                  <StructuredListCell head>Current</StructuredListCell>
                  <StructuredListCell head>Baseline</StructuredListCell>
                  <StructuredListCell head>Δ</StructuredListCell>
                </StructuredListRow>
                {diffRows.map((row) => (
                  <StructuredListRow key={row.label}>
                    <StructuredListCell>{row.label}</StructuredListCell>
                    <StructuredListCell>{fmt(row.current)}</StructuredListCell>
                    <StructuredListCell>{fmt(row.baseline)}</StructuredListCell>
                    <StructuredListCell>{fmtDelta(row.delta)}</StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          ) : null}
        </section>
      ) : null}

      <section className="audio-io-tab__panel">
        <h3>History ({displayHistory.length})</h3>
        {historyQuery.isLoading ? (
          <p>Loading history…</p>
        ) : displayHistory.length === 0 ? (
          <p className="audio-io-tab__empty">
            No measurements yet. Click Measure latency to record one.
          </p>
        ) : (
          <StructuredListWrapper aria-label="Measurement history">
            <StructuredListBody>
              <StructuredListRow head>
                <StructuredListCell head>When</StructuredListCell>
                <StructuredListCell head>Method</StructuredListCell>
                <StructuredListCell head>Mean</StructuredListCell>
                <StructuredListCell head>p95</StructuredListCell>
                <StructuredListCell head>Jitter</StructuredListCell>
                <StructuredListCell head>Evidence</StructuredListCell>
              </StructuredListRow>
              {displayHistory.map((row) => (
                <StructuredListRow key={row.evidence_path}>
                  <StructuredListCell>{fmtTs(row.timestamp)}</StructuredListCell>
                  <StructuredListCell>{row.method ?? '—'}</StructuredListCell>
                  <StructuredListCell>{fmt(row.mean_rtt_ms)}</StructuredListCell>
                  <StructuredListCell>{fmt(row.p95_rtt_ms)}</StructuredListCell>
                  <StructuredListCell>{fmt(row.jitter_p95_ms)}</StructuredListCell>
                  <StructuredListCell><code>{row.evidence_path}</code></StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        )}
      </section>
    </div>
  )
}
