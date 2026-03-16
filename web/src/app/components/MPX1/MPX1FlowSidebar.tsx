/**
 * MPX1FlowSidebar — parameter editor panel shown when a block card is selected.
 *
 * Param helpers (clamp, algorithmKey, getParamValue, formatValue, groupParamsByPage,
 * ParamControl) are intentionally duplicated here from MPX1BlockEditor.tsx to
 * avoid cross-component coupling. A future refactor can consolidate them into a
 * shared mpx1ParamUtils.ts if needed.
 */

import React, { useCallback, useMemo } from 'react'
import { X } from '@phosphor-icons/react'

import type { MPX1RegistryParam, UseMPX1StateResult } from '../../../map2/mpx1Api'
import { MPX1Knob } from './MPX1Knob'
import type { BlockRoutingState } from './mpx1FlowRouting'
import { NumberInput } from '../Controls/NumberInput'

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function algorithmKey(index: number): string {
  return `alg_${Math.max(0, index).toString().padStart(2, '0')}`
}

function getParamValue(param: MPX1RegistryParam, shadow: Record<string, number>): number {
  const raw = shadow[param.id]
  if (Number.isFinite(raw)) return Number(raw)
  if (Number.isFinite(param.default)) return Number(param.default)
  return Number(param.range?.min ?? 0)
}

function formatValue(param: MPX1RegistryParam, value: number): string {
  const units = (param.units ?? '').toLowerCase()
  if (units.includes('hz')) {
    return Math.abs(value) >= 1000
      ? `${(value / 1000).toFixed(2)} kHz`
      : `${Math.round(value)} Hz`
  }
  if (units === 's' || units === 'sec' || units === 'seconds') {
    return Math.abs(value) < 1
      ? `${Math.round(value * 1000)} ms`
      : `${value.toFixed(2)} s`
  }
  if (units.includes('ms')) {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
  }
  if (units.includes('db')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  }
  if (units && units !== 'index' && units !== 'none') {
    return `${Math.round(value * 100) / 100} ${param.units}`
  }
  return `${Math.round(value * 100) / 100}`
}

function groupParamsByPage(
  params: MPX1RegistryParam[],
): Array<{ page: string; params: MPX1RegistryParam[] }> {
  const pages = new Map<string, MPX1RegistryParam[]>()
  for (const param of params) {
    const page = param.page || 'Parameters'
    const existing = pages.get(page) ?? []
    existing.push(param)
    pages.set(page, existing)
  }
  return Array.from(pages.entries()).map(([page, grouped]) => ({
    page,
    params: grouped.sort((a, b) => a.display_name.localeCompare(b.display_name)),
  }))
}

function buildEnumValues(param: MPX1RegistryParam): number[] {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 0)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [0]
  const count = max - min + 1
  if (count > 64) return [Math.round(min), Math.round(max)]
  return Array.from({ length: count }, (_, i) => Math.round(min + i))
}

interface ParamControlProps {
  param: MPX1RegistryParam
  value: number
  onChange: (value: number) => void
}

function ParamControl({ param, value, onChange }: ParamControlProps) {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 1)

  if (param.type === 'toggle' || param.type === 'bool' || param.type === 'boolean') {
    const active = value >= 0.5
    return (
      <button
        type="button"
        className={`mpx1-flow-sidebar__control mpx1-flow-sidebar__toggle${active ? ' is-active' : ''}`}
        onClick={() => onChange(active ? 0 : 1)}
      >
        <span className="mpx1-flow-sidebar__toggle-name">{param.display_name}</span>
        <span className="mpx1-flow-sidebar__toggle-value">{active ? 'On' : 'Off'}</span>
      </button>
    )
  }

  if (param.type === 'enum' || param.widget === 'select') {
    const options = buildEnumValues(param)
    return (
      <label className="mpx1-flow-sidebar__control mpx1-flow-sidebar__select-wrap">
        <span className="mpx1-flow-sidebar__label">{param.display_name}</span>
        <select
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {`Option ${opt.toString().padStart(2, '0')}`}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (param.widget === 'slider' || param.type === 'linear') {
    return (
      <label className="mpx1-flow-sidebar__control mpx1-flow-sidebar__slider-wrap">
        <span className="mpx1-flow-sidebar__label">{param.display_name}</span>
        <NumberInput
          label={param.display_name}
          value={value}
          min={min}
          max={max}
          step={Math.max(0.01, (max - min) / 200)}
          showLabel={false}
          showBounds={false}
          size="small"
          onChange={onChange}
        />
        <span className="mpx1-flow-sidebar__value">{formatValue(param, value)}</span>
      </label>
    )
  }

  return (
    <MPX1Knob
      label={param.display_name}
      value={value}
      min={min}
      max={max}
      step={Math.max(0.01, (max - min) / 200)}
      formatter={(v) => formatValue(param, v)}
      size={62}
      compact
      onChange={onChange}
    />
  )
}

// ── Public component ──────────────────────────────────────────────────────────

interface MPX1FlowSidebarProps {
  selectedBlock: BlockRoutingState | null
  mpx1: UseMPX1StateResult
  /** Called before setParam so the caller can push onto the undo stack */
  onParamChange: (paramId: string, prevValue: number, nextValue: number) => void
  onClose: () => void
  setLcdText: (text: string) => void
}

export function MPX1FlowSidebar({
  selectedBlock,
  mpx1,
  onParamChange,
  onClose,
  setLcdText,
}: MPX1FlowSidebarProps) {
  const registryParams = mpx1.registry?.params ?? []

  const paramsById = useMemo(() => {
    const map = new Map<string, MPX1RegistryParam>()
    for (const param of registryParams) map.set(param.id, param)
    return map
  }, [registryParams])

  const blockParams = useMemo(() => {
    if (!selectedBlock) return []
    return registryParams.filter((p) => p.block === selectedBlock.effectType)
  }, [selectedBlock, registryParams])

  const algorithmParam = useMemo(() => {
    if (!selectedBlock) return null
    const id = `program.${selectedBlock.effectType}.algorithm`
    return (
      paramsById.get(id) ??
      blockParams.find((p) => p.algorithm === 'algorithm_selector') ??
      null
    )
  }, [selectedBlock, blockParams, paramsById])

  const algorithmOptions = useMemo(() => {
    if (!algorithmParam) return [0]
    const min = Math.round(Number(algorithmParam.range?.min ?? 0))
    const max = Math.round(Number(algorithmParam.range?.max ?? 0))
    if (max < min) return [0]
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [algorithmParam])

  const currentAlgIndex = useMemo(() => {
    if (!algorithmParam || !selectedBlock) return 0
    return clamp(
      Math.round(getParamValue(algorithmParam, mpx1.shadow)),
      Math.round(Number(algorithmParam.range?.min ?? 0)),
      Math.round(Number(algorithmParam.range?.max ?? 0)),
    )
  }, [algorithmParam, selectedBlock, mpx1.shadow])

  const activeAlgKey = algorithmKey(currentAlgIndex)

  const activeParams = useMemo(
    () => blockParams.filter((p) => p.algorithm === activeAlgKey),
    [blockParams, activeAlgKey],
  )

  const groupedPages = useMemo(() => groupParamsByPage(activeParams), [activeParams])

  const handleParamChange = useCallback(
    (param: MPX1RegistryParam, nextValue: number) => {
      const prevValue = getParamValue(param, mpx1.shadow)
      onParamChange(param.id, prevValue, nextValue)
      void mpx1.setParam(param.id, nextValue).catch((err) => {
        console.error(`MPX1 flow sidebar setParam ${param.id}:`, err)
      })
      setLcdText(`${param.display_name}: ${formatValue(param, nextValue)}`)
    },
    [mpx1, onParamChange, setLcdText],
  )

  const handleAlgorithmChange = useCallback(
    (nextAlg: number) => {
      if (!algorithmParam || !selectedBlock) return
      const prevValue = getParamValue(algorithmParam, mpx1.shadow)
      onParamChange(algorithmParam.id, prevValue, nextAlg)
      void mpx1.setParam(algorithmParam.id, nextAlg).catch((err) => {
        console.error('MPX1 flow algorithm change:', err)
      })
      setLcdText(
        `${selectedBlock.label} → Algorithm ${nextAlg.toString().padStart(2, '0')}`,
      )
    },
    [algorithmParam, mpx1, onParamChange, selectedBlock, setLcdText],
  )

  if (!selectedBlock) {
    return (
      <div className="mpx1-flow-sidebar mpx1-flow-sidebar--empty">
        <p>Select a block to edit its parameters.</p>
      </div>
    )
  }

  return (
    <div
      className="mpx1-flow-sidebar"
      style={{ '--block-accent': selectedBlock.color } as React.CSSProperties}
    >
      <div className="mpx1-flow-sidebar__header">
        <span className="mpx1-flow-sidebar__block-dot" aria-hidden />
        <span className="mpx1-flow-sidebar__title">{selectedBlock.label}</span>
        <button
          type="button"
          className="mpx1-flow-sidebar__close"
          onClick={onClose}
          aria-label="Close parameter editor"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>

      {algorithmParam && (
        <div className="mpx1-flow-sidebar__algo-section">
          <div className="mpx1-flow-sidebar__algo-label">Algorithm</div>
          <select
            className="mpx1-flow-sidebar__algo-select"
            value={currentAlgIndex}
            onChange={(e) => handleAlgorithmChange(Number(e.target.value))}
          >
            {algorithmOptions.map((opt) => (
              <option key={opt} value={opt}>
                {`Algorithm ${opt.toString().padStart(2, '0')}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mpx1-flow-sidebar__params">
        {groupedPages.length === 0 && (
          <div className="mpx1-flow-sidebar__empty-msg">
            No parameters in registry for this algorithm.
          </div>
        )}
        {groupedPages.map((group) => (
          <section key={group.page} className="mpx1-flow-sidebar__page-group">
            <div className="mpx1-flow-sidebar__page-title">{group.page}</div>
            <div className="mpx1-flow-sidebar__param-grid">
              {group.params.map((param) => (
                <ParamControl
                  key={param.id}
                  param={param}
                  value={getParamValue(param, mpx1.shadow)}
                  onChange={(v) => handleParamChange(param, v)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
