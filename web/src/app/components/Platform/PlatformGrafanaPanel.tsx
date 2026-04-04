import { useEffect, useMemo, useState } from 'react'
import { Tag, Tile } from '@carbon/react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import './PlatformGrafanaPanel.css'
import {
  appendPlatformGrafanaHistory,
  PLATFORM_GRAFANA_HISTORY_BUCKET_MS,
  PLATFORM_GRAFANA_HISTORY_WINDOW_MS,
  type PlatformGrafanaHistoryPoint,
} from './platformGrafanaHistory'

export interface PlatformGrafanaSeriesDefinition {
  key: string
  label: string
  value: number | null | undefined
  color: string
  formatValue?: (value: number) => string
}

export interface PlatformGrafanaPanelDefinition {
  id: string
  title: string
  description: string
  series: PlatformGrafanaSeriesDefinition[]
  yAxisDomain?: [number | 'auto', number | 'auto']
  emptyCopy?: string
}

function defaultFormatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function renderTooltipValue(value: number | string, name: string, entry?: { payload?: PlatformGrafanaSeriesDefinition }) {
  if (typeof value !== 'number' || !entry?.payload) {
    return [String(value), name]
  }

  const formatter = entry.payload.formatValue ?? defaultFormatValue
  return [formatter(value), entry.payload.label]
}

const isTestEnvironment = process.env.NODE_ENV === 'test'

function PlatformGrafanaCard({
  panel,
  history,
}: {
  panel: PlatformGrafanaPanelDefinition
  history: PlatformGrafanaHistoryPoint[]
}) {
  const hasData = history.length > 0

  return (
    <Tile className="platform-grafana-panel">
      <div className="platform-grafana-panel__head">
        <div>
          <p className="platform-grafana-panel__eyebrow">Grafana View</p>
          <h3 className="platform-grafana-panel__title">{panel.title}</h3>
          <p className="platform-grafana-panel__description">{panel.description}</p>
        </div>
        <Tag type="cool-gray">24h</Tag>
      </div>

      {hasData ? (
        <div className="platform-grafana-panel__chart">
          <ResponsiveContainer
            width={isTestEnvironment ? 640 : '100%'}
            height={isTestEnvironment ? 208 : '100%'}
            minWidth={320}
            minHeight={208}
          >
            <LineChart data={history} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid stroke="var(--cds-border-subtle)" strokeDasharray="4 4" />
              <XAxis
                dataKey="label"
                stroke="var(--cds-text-helper)"
                tick={{ fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                domain={panel.yAxisDomain ?? ['auto', 'auto']}
                stroke="var(--cds-text-helper)"
                tick={{ fontSize: 11 }}
                width={40}
              />
              <Tooltip
                formatter={renderTooltipValue}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as PlatformGrafanaHistoryPoint | undefined
                  return point ? new Date(point.timestamp).toLocaleString() : ''
                }}
                contentStyle={{
                  backgroundColor: 'var(--cds-layer)',
                  border: '1px solid var(--cds-border-subtle)',
                  borderRadius: '0',
                }}
              />
              <Legend />
              {panel.series.map((series) => (
                <Line
                  key={series.key}
                  name={series.label}
                  dataKey={series.key}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="platform-grafana-panel__empty">{panel.emptyCopy ?? 'Waiting for enough telemetry to draw a 24-hour trend window.'}</div>
      )}

      <div className="platform-grafana-panel__legend">
        {panel.series.map((series) => (
          <span key={series.key} className="platform-grafana-panel__legend-item">
            <span className="platform-grafana-panel__legend-swatch" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </Tile>
  )
}

export function PlatformGrafanaPanelDeck({
  panels,
  className,
}: {
  panels: PlatformGrafanaPanelDefinition[]
  className?: string
}) {
  const [historyByPanelId, setHistoryByPanelId] = useState<Record<string, PlatformGrafanaHistoryPoint[]>>({})
  const signature = useMemo(
    () => JSON.stringify(
      panels.map((panel) => ({
        id: panel.id,
        series: panel.series.map((series) => ({
          key: series.key,
          value: Number.isFinite(series.value ?? Number.NaN) ? Number(series.value) : null,
        })),
      })),
    ),
    [panels],
  )
  const sampledPanels = useMemo(() => panels, [signature])

  useEffect(() => {
    if (sampledPanels.length === 0) {
      return
    }

    const now = Date.now()
    setHistoryByPanelId((current) => {
      const next: Record<string, PlatformGrafanaHistoryPoint[]> = {}

      sampledPanels.forEach((panel) => {
        const previous = current[panel.id] ?? []
        next[panel.id] = appendPlatformGrafanaHistory(
          previous,
          panel.series.map((series) => ({ key: series.key, value: series.value })),
          now,
          PLATFORM_GRAFANA_HISTORY_WINDOW_MS,
          PLATFORM_GRAFANA_HISTORY_BUCKET_MS,
        )
      })

      return next
    })
  }, [sampledPanels, signature])

  if (panels.length === 0) {
    return null
  }

  return (
    <div className={className ?? 'platform-grafana-panel__deck'}>
      {panels.map((panel) => (
        <PlatformGrafanaCard
          key={panel.id}
          panel={panel}
          history={historyByPanelId[panel.id] ?? []}
        />
      ))}
    </div>
  )
}
