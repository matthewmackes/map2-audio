import React, { useEffect, useMemo, useState } from 'react'
import { Renew } from '@carbon/icons-react'

import { useMPX1PageContext } from './MPX1Shell'
import { NumberInput } from '../../ParameterControl'
import './MPX1ModMatrix.css'

type CurveType = 'linear' | 'log' | 'exp' | 's_curve'

interface MatrixCell {
  source: string
  destination: string
  amount: number
  curve: CurveType
}

interface LfoConfig {
  rateHz: number
  depth: number
}

const STORAGE_KEY = 'map2.mpx1.mod_matrix.v1'

function keyForCell(source: string, destination: string): string {
  return `${source}=>${destination}`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function MPX1ModMatrix() {
  const { mpx1, setLcdText } = useMPX1PageContext()

  const sources = useMemo(() => {
    const list = mpx1.registry?.modifier_matrix?.sources ?? []
    return list.slice(0, 18)
  }, [mpx1.registry?.modifier_matrix?.sources])

  const destinations = useMemo(() => {
    const list = mpx1.registry?.modifier_matrix?.destinations ?? []
    return list.slice(0, 14)
  }, [mpx1.registry?.modifier_matrix?.destinations])

  const [cells, setCells] = useState<Record<string, MatrixCell>>({})
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null)
  const [lfoConfigs, setLfoConfigs] = useState<Record<string, LfoConfig>>({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return
    }
    try {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object') {
        setCells(parsed.cells ?? {})
        setLfoConfigs(parsed.lfoConfigs ?? {})
      }
    } catch {
      // ignore invalid payload
    }
  }, [])

  useEffect(() => {
    const payload = JSON.stringify({ cells, lfoConfigs })
    window.localStorage.setItem(STORAGE_KEY, payload)
  }, [cells, lfoConfigs])

  useEffect(() => {
    if (!selectedSource && sources.length > 0) {
      setSelectedSource(sources[0])
    }
  }, [selectedSource, sources])

  useEffect(() => {
    const interval = window.setInterval(() => setTick((prev) => prev + 1), 120)
    return () => window.clearInterval(interval)
  }, [])

  const selectedCell = selectedCellKey ? cells[selectedCellKey] ?? null : null

  const destinationMeter = useMemo(() => {
    const meter = new Map<string, number>()
    for (const destination of destinations) {
      meter.set(destination, 0)
    }

    Object.values(cells).forEach((cell) => {
      if (!meter.has(cell.destination)) return

      const lfo = lfoConfigs[cell.source] ?? { rateHz: 0.5, depth: 1 }
      const phase = (tick * lfo.rateHz) / 8
      const pulse = Math.abs(Math.sin(phase))
      const intensity = pulse * Math.abs(cell.amount) * clamp(lfo.depth, 0, 1)
      meter.set(cell.destination, Math.max(meter.get(cell.destination) ?? 0, intensity))
    })

    return meter
  }, [cells, destinations, lfoConfigs, tick])

  const toggleCell = (source: string, destination: string) => {
    const key = keyForCell(source, destination)
    setCells((prev) => {
      if (prev[key]) {
        const next = { ...prev }
        delete next[key]
        setSelectedCellKey(null)
        setLcdText(`MATRIX OFF • ${source} -> ${destination}`)
        return next
      }

      const nextCell: MatrixCell = {
        source,
        destination,
        amount: 0.5,
        curve: 'linear',
      }
      setSelectedCellKey(key)
      setLcdText(`MATRIX ON • ${source} -> ${destination}`)
      return {
        ...prev,
        [key]: nextCell,
      }
    })
  }

  const updateSelectedCell = (patch: Partial<MatrixCell>) => {
    if (!selectedCell) return
    const key = keyForCell(selectedCell.source, selectedCell.destination)
    setCells((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }))
  }

  const selectedSourceLfo = lfoConfigs[selectedSource] ?? { rateHz: 0.8, depth: 0.7 }

  const updateLfoConfig = (patch: Partial<LfoConfig>) => {
    if (!selectedSource) return
    setLfoConfigs((prev) => ({
      ...prev,
      [selectedSource]: {
        ...(prev[selectedSource] ?? { rateHz: 0.8, depth: 0.7 }),
        ...patch,
      },
    }))
  }

  return (
    <div className="mpx1-matrix">
      <header className="mpx1-matrix__header">
        <div className="mpx1-matrix__title">Internal Mod Matrix</div>
        <button type="button" className="mpx1-matrix__reset" onClick={() => setCells({})}>
          <Renew size={14} /> Clear Grid
        </button>
      </header>

      <div className="mpx1-matrix__workspace">
        <aside className="mpx1-matrix__sources">
          <div className="mpx1-matrix__section-title">Sources</div>
          <div className="mpx1-matrix__source-list">
            {sources.map((source) => (
              <button
                key={source}
                type="button"
                className={`mpx1-matrix__source-btn${selectedSource === source ? ' is-active' : ''}`}
                onClick={() => setSelectedSource(source)}
              >
                {source}
              </button>
            ))}
          </div>

          <div className="mpx1-matrix__lfo-editor">
            <div className="mpx1-matrix__section-title">LFO Editor</div>
            <label>
              Rate (Hz)
              <NumberInput
                label="LFO rate"
                value={selectedSourceLfo.rateHz}
                min={0.1}
                max={12}
                step={0.1}
                showLabel={false}
                showBounds={false}
                size="small"
                onChange={(value) => updateLfoConfig({ rateHz: clamp(value, 0.1, 12) })}
              />
              <span>{selectedSourceLfo.rateHz.toFixed(1)} Hz</span>
            </label>
            <label>
              Depth
              <NumberInput
                label="LFO depth"
                value={selectedSourceLfo.depth}
                min={0}
                max={1}
                step={0.01}
                showLabel={false}
                showBounds={false}
                size="small"
                onChange={(value) => updateLfoConfig({ depth: clamp(value, 0, 1) })}
              />
              <span>{Math.round(selectedSourceLfo.depth * 100)}%</span>
            </label>
          </div>
        </aside>

        <section className="mpx1-matrix__grid-wrap" aria-label="Modulation matrix">
          <div className="mpx1-matrix__grid" style={{ gridTemplateColumns: `160px repeat(${destinations.length}, minmax(96px, 1fr))` }}>
            <div className="mpx1-matrix__corner">Source / Destination</div>
            {destinations.map((destination) => (
              <div key={destination} className="mpx1-matrix__dest-head">
                <span>{destination}</span>
                <span
                  className="mpx1-matrix__dest-meter"
                  style={{ opacity: 0.2 + clamp(destinationMeter.get(destination) ?? 0, 0, 1) * 0.8 }}
                />
              </div>
            ))}

            {sources.map((source) => (
              <React.Fragment key={source}>
                <div className="mpx1-matrix__row-head">{source}</div>
                {destinations.map((destination) => {
                  const key = keyForCell(source, destination)
                  const cell = cells[key]
                  const amount = cell?.amount ?? 0
                  const isSelected = selectedCellKey === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`mpx1-matrix__cell${cell ? ' is-assigned' : ''}${amount < 0 ? ' is-negative' : ''}${isSelected ? ' is-selected' : ''}`}
                      style={{ '--cell-intensity': `${Math.abs(amount)}` } as React.CSSProperties}
                      onClick={() => {
                        if (cell) {
                          setSelectedCellKey(key)
                        } else {
                          toggleCell(source, destination)
                        }
                      }}
                      onDoubleClick={() => toggleCell(source, destination)}
                    >
                      {cell ? amount.toFixed(2) : ''}
                    </button>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </section>

        <aside className="mpx1-matrix__detail">
          <div className="mpx1-matrix__section-title">Cell Detail</div>
          {!selectedCell && <div className="mpx1-matrix__empty">Select an assigned cell to edit amount and curve.</div>}
          {selectedCell && (
            <div className="mpx1-matrix__detail-form">
              <div className="mpx1-matrix__detail-name">
                {selectedCell.source}
                {' -> '}
                {selectedCell.destination}
              </div>

              <label>
                Amount
                <NumberInput
                  label="Matrix amount"
                  value={selectedCell.amount}
                  min={-1}
                  max={1}
                  step={0.01}
                  showLabel={false}
                  showBounds={false}
                  size="small"
                  onChange={(value) => updateSelectedCell({ amount: clamp(value, -1, 1) })}
                />
                <span>{selectedCell.amount.toFixed(2)}</span>
              </label>

              <label>
                Curve
                <select
                  value={selectedCell.curve}
                  onChange={(event) => updateSelectedCell({ curve: event.target.value as CurveType })}
                >
                  <option value="linear">linear</option>
                  <option value="log">log</option>
                  <option value="exp">exp</option>
                  <option value="s_curve">s_curve</option>
                </select>
              </label>

              <button
                type="button"
                className="mpx1-matrix__remove"
                onClick={() => toggleCell(selectedCell.source, selectedCell.destination)}
              >
                Remove Assignment
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
