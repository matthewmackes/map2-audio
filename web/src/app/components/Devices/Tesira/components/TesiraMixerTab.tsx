import React, { useEffect, useMemo, useState } from 'react'
import { Renew } from '@carbon/icons-react'
import { Button, InlineNotification, Tag, TextInput, Tile } from '@carbon/react'
import { useSetCrosspoint, useSetCrosspointMute, useTesiraCrosspointMatrix } from '../hooks/useTesiraApi'
import { LoadingState } from '../../../shared/LoadingState'
import { NumberInput } from '../../../ParameterControl'
import './TesiraCarbonChrome.css'

interface TesiraMixerTabProps {
  deviceId: string
}

const DEFAULT_ROWS = 4
const DEFAULT_COLS = 4

function clampMatrixSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(32, Math.max(1, Math.round(value)))
}

function crosspointKey(row: number, col: number) {
  return `${row}:${col}`
}

export function TesiraMixerTab({ deviceId }: TesiraMixerTabProps) {
  const [instanceTag, setInstanceTag] = useState('RouterControl1')
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [gainDrafts, setGainDrafts] = useState<Record<string, number>>({})

  const matrix = useTesiraCrosspointMatrix(deviceId, instanceTag, rows, cols)
  const setCrosspoint = useSetCrosspoint()
  const setCrosspointMute = useSetCrosspointMute()

  const matrixRows = useMemo(() => matrix.data?.matrix ?? [], [matrix.data])
  const remoteGainDrafts = useMemo(() => {
    const next: Record<string, number> = {}
    for (let rowIdx = 0; rowIdx < rows; rowIdx += 1) {
      for (let colIdx = 0; colIdx < cols; colIdx += 1) {
        const cell = matrixRows[rowIdx]?.[colIdx]
        next[crosspointKey(rowIdx, colIdx)] = typeof cell?.gain_db === 'number' ? cell.gain_db : -60
      }
    }
    return next
  }, [matrixRows, rows, cols])
  const remoteGainSignature = useMemo(() => JSON.stringify(remoteGainDrafts), [remoteGainDrafts])

  useEffect(() => {
    setGainDrafts(remoteGainDrafts)
  }, [remoteGainSignature])

  const applyGain = (rowIdx: number, colIdx: number) => {
    const key = crosspointKey(rowIdx, colIdx)
    setCrosspoint.mutate({
      deviceId,
      tag: instanceTag,
      row: rowIdx + 1,
      col: colIdx + 1,
      gainDb: gainDrafts[key] ?? -60,
      rows,
      cols,
    })
  }

  const toggleMute = (rowIdx: number, colIdx: number, muted: boolean) => {
    setCrosspointMute.mutate({
      deviceId,
      tag: instanceTag,
      row: rowIdx + 1,
      col: colIdx + 1,
      muted: !muted,
      rows,
      cols,
    })
  }

  return (
    <div className="tesira-mixer-tab">
      <Tile className="tesira-mixer-tab__tile">
        <div className="tesira-mixer-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Crosspoint router</p>
            <h3 className="tesira-dashboard__title">Trim and mute Tesira matrix routes</h3>
            <p className="tesira-dashboard__summary">
              Inspect the live crosspoint matrix, stage gain trims per route, and toggle mutes without leaving the dedicated Tesira control path.
            </p>
          </div>
          <div className="tesira-mixer-tab__tags">
            <Tag type="cool-gray" size="sm">{instanceTag}</Tag>
            <Tag type="warm-gray" size="sm">{`${rows} × ${cols} routes`}</Tag>
          </div>
        </div>

        <div className="tesira-mixer-tab__controls">
          <TextInput
            id={`tesira-mixer-tag-${deviceId}`}
            labelText="Router tag"
            value={instanceTag}
            onChange={(event) => setInstanceTag(event.target.value)}
          />
          <NumberInput
            label="Inputs"
            min={1}
            max={32}
            step={1}
            value={rows}
            profile="integer"
            precision={0}
            size="small"
            showBounds={false}
            onChange={(value) => setRows(clampMatrixSize(value, rows))}
          />
          <NumberInput
            label="Outputs"
            min={1}
            max={32}
            step={1}
            value={cols}
            profile="integer"
            precision={0}
            size="small"
            showBounds={false}
            onChange={(value) => setCols(clampMatrixSize(value, cols))}
          />
          <div className="tesira-mixer-tab__actions">
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                matrix.refetch().catch(() => undefined)
              }}
              disabled={matrix.isLoading}
            >
              Refresh
            </Button>
          </div>
        </div>
      </Tile>

      {matrix.error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Matrix query failed"
          subtitle={(matrix.error as Error).message || 'Failed to read the Tesira crosspoint matrix.'}
        />
      ) : null}

      <Tile className="tesira-mixer-tab__tile">
        <div className="tesira-mixer-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Matrix</p>
            <h3 className="tesira-dashboard__title">Crosspoint gain and mute map</h3>
            <p className="tesira-dashboard__summary">
              Each cell reflects one input-to-output route. Stage the gain locally, then apply it to the Tesira runtime and mute or unmute the route directly.
            </p>
          </div>
        </div>

        {matrix.isLoading && !matrix.data ? (
          <div className="tesira-mixer-tab__loading">
            <LoadingState description="Loading Tesira crosspoint matrix" />
          </div>
        ) : (
          <div className="tesira-mixer-tab__table-wrap">
            <table className="tesira-quick-console__table tesira-mixer-tab__table" aria-label="Tesira crosspoint matrix">
              <thead>
                <tr>
                  <th scope="col">In \ Out</th>
                  {Array.from({ length: cols }, (_, colIdx) => (
                    <th key={colIdx} scope="col">{`Out ${colIdx + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }, (_, rowIdx) => (
                  <tr key={rowIdx}>
                    <th scope="row">{`In ${rowIdx + 1}`}</th>
                    {Array.from({ length: cols }, (_, colIdx) => {
                      const key = crosspointKey(rowIdx, colIdx)
                      const cell = matrixRows[rowIdx]?.[colIdx]
                      const gain = gainDrafts[key] ?? (typeof cell?.gain_db === 'number' ? cell.gain_db : -60)
                      const muted = Boolean(cell?.muted)
                      const inputNumber = rowIdx + 1
                      const outputNumber = colIdx + 1
                      return (
                        <td key={key}>
                          <div className="tesira-mixer-tab__cell">
                            <div className="tesira-mixer-tab__cell-header">
                              <Tag type="blue" size="sm">{`${gain.toFixed(1)} dB`}</Tag>
                              <Tag type={muted ? 'red' : 'green'} size="sm">
                                {muted ? 'Muted' : 'Live'}
                              </Tag>
                            </div>
                            <NumberInput
                              label={`Gain from input ${inputNumber} to output ${outputNumber}`}
                              className="tesira-mixer-tab__range"
                              min={-60}
                              max={12}
                              step={0.5}
                              value={gain}
                              unit="dB"
                              profile="gain-db"
                              precision={1}
                              size="small"
                              showLabel={false}
                              showBounds={false}
                              fullWidth
                              onChange={(value) => {
                                setGainDrafts((state) => ({ ...state, [key]: value }))
                              }}
                            />
                            <div className="tesira-mixer-tab__cell-actions">
                              <Button
                                size="sm"
                                kind="ghost"
                                aria-label={`Apply gain for input ${inputNumber} to output ${outputNumber}`}
                                disabled={setCrosspoint.isPending}
                                onClick={() => applyGain(rowIdx, colIdx)}
                              >
                                Apply
                              </Button>
                              <Button
                                size="sm"
                                kind={muted ? 'secondary' : 'tertiary'}
                                aria-label={`${muted ? 'Unmute' : 'Mute'} input ${inputNumber} to output ${outputNumber}`}
                                disabled={setCrosspointMute.isPending}
                                onClick={() => toggleMute(rowIdx, colIdx, muted)}
                              >
                                {muted ? 'Unmute' : 'Mute'}
                              </Button>
                            </div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  )
}
