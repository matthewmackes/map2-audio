import React, { useMemo, useState } from 'react'
import { CheckmarkFilled, Renew, WarningAltFilled } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Tag, TextInput, Tile } from '@carbon/react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTesiraFaults, useTesiraMeterHistory, useTesiraMeterPeak } from '../hooks/useTesiraApi'
import './TesiraCarbonChrome.css'

interface TesiraFaultsTabProps {
  deviceId: string
}

export function TesiraFaultsTab({ deviceId }: TesiraFaultsTabProps) {
  const [meterTag, setMeterTag] = useState('LevelControl1')
  const { data, isLoading, isError, refetch } = useTesiraFaults(deviceId)
  const meterHistory = useTesiraMeterHistory(deviceId, meterTag, 120)
  const meterPeak = useTesiraMeterPeak(deviceId, meterTag)

  const faults = data?.faults ?? []
  const chartData = useMemo(
    () => (meterHistory.data?.history ?? []).map((sample, index) => ({
      t: index,
      peak: sample.levels_dbu.length > 0 ? Math.max(...sample.levels_dbu) : -100,
    })),
    [meterHistory.data],
  )

  if (isLoading) {
    return (
      <div className="tesira-faults-tab__loading">
        <InlineLoading description="Loading Tesira faults" />
      </div>
    )
  }

  return (
    <div className="tesira-faults-tab">
      <Tile className="tesira-faults-tab__tile">
        <div className="tesira-faults-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Active faults</p>
            <h3 className="tesira-dashboard__title">Surface device health issues quickly</h3>
            <p className="tesira-dashboard__summary">
              Review current Tesira fault strings before reconnecting or changing the signal chain.
            </p>
          </div>
          <div className="tesira-faults-tab__actions">
            <Tag type={faults.length > 0 ? 'red' : 'green'} size="sm">
              {faults.length === 0 ? 'Healthy' : `${faults.length} active`}
            </Tag>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                refetch().catch(() => undefined)
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Failed to load fault list"
            subtitle="Retry after confirming the Tesira unit is reachable."
          />
        ) : faults.length === 0 ? (
          <div className="tesira-faults-tab__ok">
            <CheckmarkFilled size={18} aria-hidden="true" />
            <p className="tesira-faults-tab__ok-copy">No active faults</p>
          </div>
        ) : (
          <ul className="tesira-faults-tab__list">
            {faults.map((fault, index) => (
              <li key={`${index}-${fault}`} className="tesira-faults-tab__list-item">
                <WarningAltFilled size={16} aria-hidden="true" />
                <span>{fault}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile className="tesira-faults-tab__tile">
        <div className="tesira-faults-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Meter history</p>
            <h3 className="tesira-dashboard__title">Inspect recent signal peaks</h3>
            <p className="tesira-dashboard__summary">
              Pull recent meter history for a live instance tag to correlate overloads with fault activity.
            </p>
          </div>
          <div className="tesira-faults-tab__actions">
            <Tag type="cool-gray" size="sm">
              {meterPeak.data?.peak_dbu != null ? `Peak ${meterPeak.data.peak_dbu.toFixed(2)} dBu` : 'Peak unavailable'}
            </Tag>
          </div>
        </div>

        <div className="tesira-faults-tab__meter-toolbar">
          <TextInput
            id={`tesira-faults-meter-tag-${deviceId}`}
            labelText="Instance tag"
            value={meterTag}
            onChange={(event) => setMeterTag(event.target.value)}
          />
          <Button
            size="sm"
            kind="secondary"
            onClick={() => {
              meterHistory.refetch().catch(() => undefined)
              meterPeak.refetch().catch(() => undefined)
            }}
          >
            Refresh meter data
          </Button>
        </div>

        {meterHistory.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Meter history unavailable"
            subtitle={(meterHistory.error as Error).message || 'No history could be returned for this tag.'}
          />
        ) : meterHistory.isLoading ? (
          <div className="tesira-faults-tab__loading">
            <InlineLoading description="Loading meter history" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="tesira-presets-tab__empty">No meter samples available for this tag.</p>
        ) : (
          <div className="tesira-faults-tab__chart">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="t" hide />
                <YAxis domain={[-80, 20]} width={36} />
                <ChartTooltip />
                <Line type="monotone" dataKey="peak" stroke="var(--cds-support-error)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Tile>
    </div>
  )
}
