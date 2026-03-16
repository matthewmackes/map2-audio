import { useCallback, useMemo } from 'react'
import { Close } from '@carbon/icons-react'
import { Button } from '@carbon/react'

import type { IntelFXRegistryParam, UseIntelFXStateResult } from '../../../map2/intelfxApi'
import type { IntelFXBlockState } from './intelfxFlowRouting'
import { NumberInput } from '../Controls/NumberInput'

function getParamValue(param: IntelFXRegistryParam, shadow: Record<string, number>): number {
  const raw = shadow[param.id]
  if (Number.isFinite(raw)) return Number(raw)
  if (Number.isFinite(param.default)) return Number(param.default)
  return Number(param.range?.min ?? 0)
}

function formatValue(param: IntelFXRegistryParam, value: number): string {
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

function groupParamsByPage(params: IntelFXRegistryParam[]): Array<{ page: string; params: IntelFXRegistryParam[] }> {
  const pages = new Map<string, IntelFXRegistryParam[]>()
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

function buildEnumValues(param: IntelFXRegistryParam): number[] {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 0)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [0]
  const count = max - min + 1
  if (count > 64) return [Math.round(min), Math.round(max)]
  return Array.from({ length: count }, (_, i) => Math.round(min + i))
}

interface ParamControlProps {
  param: IntelFXRegistryParam
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
        className={`intelfx-flow-sidebar__control intelfx-flow-sidebar__toggle${active ? ' is-active' : ''}`}
        onClick={() => onChange(active ? 0 : 1)}
      >
        <span className="intelfx-flow-sidebar__toggle-name">{param.display_name}</span>
        <span className="intelfx-flow-sidebar__toggle-value">{active ? 'On' : 'Off'}</span>
      </button>
    )
  }

  if (param.type === 'enum' || param.widget === 'select') {
    const options = buildEnumValues(param)
    return (
      <label className="intelfx-flow-sidebar__control intelfx-flow-sidebar__select-wrap">
        <span className="intelfx-flow-sidebar__label">{param.display_name}</span>
        <select value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {`Option ${opt.toString().padStart(2, '0')}`}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="intelfx-flow-sidebar__control intelfx-flow-sidebar__slider-wrap">
      <span className="intelfx-flow-sidebar__label">{param.display_name}</span>
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
      <span className="intelfx-flow-sidebar__value">{formatValue(param, value)}</span>
    </label>
  )
}

interface IntelFXFlowSidebarProps {
  selectedBlock: IntelFXBlockState | null
  intelfx: UseIntelFXStateResult
  onParamChange: (paramId: string, prevValue: number, nextValue: number) => void
  onClose: () => void
  setStatusText: (text: string) => void
}

export function IntelFXFlowSidebar({
  selectedBlock,
  intelfx,
  onParamChange,
  onClose,
  setStatusText,
}: IntelFXFlowSidebarProps) {
  const registryParams = intelfx.registry?.params ?? []

  const blockParams = useMemo(() => {
    if (!selectedBlock) return []
    return registryParams.filter((p) => p.block === selectedBlock.effectType)
  }, [selectedBlock, registryParams])

  const groupedPages = useMemo(() => groupParamsByPage(blockParams), [blockParams])

  const handleParamChange = useCallback(
    (param: IntelFXRegistryParam, nextValue: number) => {
      const prevValue = getParamValue(param, intelfx.shadow)
      onParamChange(param.id, prevValue, nextValue)
      void intelfx.setParam(param.id, nextValue).catch((err) => {
        console.error(`IntelFX flow sidebar setParam ${param.id}:`, err)
      })
      setStatusText(`${param.display_name}: ${formatValue(param, nextValue)}`)
    },
    [intelfx, onParamChange, setStatusText],
  )

  if (!selectedBlock) {
    return (
      <div className="intelfx-flow-sidebar intelfx-flow-sidebar--empty">
        <p>Select a block to edit its parameters.</p>
      </div>
    )
  }

  return (
    <div className="intelfx-flow-sidebar" style={{ '--block-accent': selectedBlock.color } as React.CSSProperties}>
      <div className="intelfx-flow-sidebar__header">
        <span className="intelfx-flow-sidebar__block-dot" aria-hidden />
        <span className="intelfx-flow-sidebar__title">{selectedBlock.label}</span>
        <span className="intelfx-flow-sidebar__category">{selectedBlock.category}</span>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-sidebar__close"
          renderIcon={Close}
          iconDescription="Close parameter editor"
          onClick={onClose}
        />
      </div>

      <div className="intelfx-flow-sidebar__params">
        {groupedPages.length === 0 && (
          <div className="intelfx-flow-sidebar__empty-msg">
            No parameters in registry for this effect.
          </div>
        )}
        {groupedPages.map((group) => (
          <section key={group.page} className="intelfx-flow-sidebar__page-group">
            <div className="intelfx-flow-sidebar__page-title">{group.page}</div>
            <div className="intelfx-flow-sidebar__param-grid">
              {group.params.map((param) => (
                <ParamControl
                  key={param.id}
                  param={param}
                  value={getParamValue(param, intelfx.shadow)}
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

export default IntelFXFlowSidebar
