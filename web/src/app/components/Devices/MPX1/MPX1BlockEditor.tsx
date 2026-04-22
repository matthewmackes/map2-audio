import React, { useCallback, useMemo, useState } from 'react'

import type { MPX1RegistryParam } from '../../../../map2/mpx1Api'
import { useMPX1PageContext } from './MPX1Shell'
import { MPX1Knob } from './MPX1Knob'
import {
  buildMpx1EnumValues,
  clampMpx1Value,
  formatMpx1ParamValue,
  getMpx1ParamValue,
  groupMpx1ParamsByPage,
  mpx1AlgorithmKey,
} from './mpx1ParamUtils'
import { NumberInput } from '../../ParameterControl'
import './MPX1BlockEditor.css'

type EditorBlockId = 'reverb' | 'pitch' | 'delay' | 'chorus' | 'eq' | 'mod'

interface EditorBlock {
  id: EditorBlockId
  label: string
  color: string
}

const EDITOR_BLOCKS: EditorBlock[] = [
  { id: 'reverb', label: 'Reverb', color: '#f59e0b' },
  { id: 'pitch', label: 'Pitch', color: '#22d3ee' },
  { id: 'delay', label: 'Delay', color: '#60a5fa' },
  { id: 'chorus', label: 'Chorus', color: '#ec4899' },
  { id: 'eq', label: 'EQ', color: '#34d399' },
  { id: 'mod', label: 'Mod', color: '#a78bfa' },
]

function blockAlgorithmParamId(blockId: EditorBlockId): string {
  return `program.${blockId}.algorithm`
}

function BlockVisualization({
  block,
  mix,
  level,
}: {
  block: EditorBlockId
  mix: number
  level: number
}) {
  const safeMix = clampMpx1Value(mix, 0, 1)
  const safeLevel = clampMpx1Value(level, 0, 1)

  if (block === 'reverb') {
    const curveHeight = 56 - safeMix * 34
    const tailY = 14 + safeLevel * 42
    return (
      <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="Reverb decay visualization">
        <path d={`M6 68 C 40 ${curveHeight}, 130 ${tailY}, 214 ${tailY + 12}`} className="mpx1-editor__viz-line" />
        <path d={`M6 68 C 40 ${curveHeight + 12}, 130 ${tailY + 8}, 214 ${tailY + 16}`} className="mpx1-editor__viz-line soft" />
      </svg>
    )
  }

  if (block === 'delay') {
    return (
      <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="Delay tap visualization">
        {Array.from({ length: 8 }).map((_, index) => {
          const barHeight = 10 + (1 - index / 8) * (safeMix * 46)
          const x = 10 + index * 26
          return <rect key={index} x={x} y={70 - barHeight} width={12} height={barHeight} className="mpx1-editor__viz-bar" />
        })}
      </svg>
    )
  }

  if (block === 'eq') {
    const tilt = (safeMix - 0.5) * 18
    const boost = safeLevel * 24
    return (
      <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="EQ frequency response visualization">
        <path d={`M0 48 C 46 ${44 - tilt}, 86 ${52 + boost * 0.15}, 122 ${40 - boost * 0.45} C 160 ${22 + boost * 0.12}, 182 ${46 + tilt}, 220 ${43 - tilt * 0.5}`} className="mpx1-editor__viz-line" />
      </svg>
    )
  }

  if (block === 'chorus') {
    const amplitude = 10 + safeMix * 18
    return (
      <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="Chorus waveform visualization">
        <path
          d={Array.from({ length: 220 }).map((_, x) => {
            const y = 40 + Math.sin((x / 220) * Math.PI * 4) * amplitude
            return `${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(2)}`
          }).join(' ')}
          className="mpx1-editor__viz-line"
        />
      </svg>
    )
  }

  if (block === 'pitch') {
    const shift = Math.round((safeMix - 0.5) * 24)
    const keyIndex = clampMpx1Value(7 + shift, 0, 13)
    return (
      <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="Pitch keyboard overlay visualization">
        {Array.from({ length: 14 }).map((_, index) => (
          <rect
            key={index}
            x={8 + index * 14}
            y={18}
            width={12}
            height={44}
            className={`mpx1-editor__viz-key${index === keyIndex ? ' active' : ''}`}
          />
        ))}
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 220 80" className="mpx1-editor__viz-svg" aria-label="Modulation LFO visualization">
      <path
        d={Array.from({ length: 220 }).map((_, x) => {
          const phase = (x / 220) * Math.PI * (2 + safeLevel * 6)
          const y = 40 + Math.sin(phase) * (8 + safeMix * 22)
          return `${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(2)}`
        }).join(' ')}
        className="mpx1-editor__viz-line"
      />
    </svg>
  )
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
        className={`mpx1-editor__toggle${active ? ' is-active' : ''}`}
        onClick={() => onChange(active ? 0 : 1)}
      >
        <span className="mpx1-editor__toggle-name">{param.display_name}</span>
        <span className="mpx1-editor__toggle-value">{active ? 'On' : 'Off'}</span>
      </button>
    )
  }

  if (param.type === 'enum' || param.widget === 'select') {
    const options = buildMpx1EnumValues(param)
    return (
      <label className="mpx1-editor__select-wrap">
        <span className="mpx1-editor__label">{param.display_name}</span>
        <select value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))}>
          {options.map((option) => (
            <option key={option} value={option}>
              {`Algorithm ${option.toString().padStart(2, '0')}`}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (param.widget === 'slider' || param.type === 'linear') {
    return (
      <label className="mpx1-editor__slider-wrap">
        <span className="mpx1-editor__label">{param.display_name}</span>
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
        <span className="mpx1-editor__value">{formatMpx1ParamValue(param, value)}</span>
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
      formatter={(next) => formatMpx1ParamValue(param, next)}
      onChange={onChange}
    />
  )
}

export function MPX1BlockEditor() {
  const { mpx1, setLcdText } = useMPX1PageContext()
  const [activeBlock, setActiveBlock] = useState<EditorBlockId>('reverb')

  const registryParams = mpx1.registry?.params ?? []

  const paramsById = useMemo(() => {
    const map = new Map<string, MPX1RegistryParam>()
    for (const param of registryParams) {
      map.set(param.id, param)
    }
    return map
  }, [registryParams])

  const blockParams = useMemo(
    () => registryParams.filter((param) => param.block === activeBlock),
    [activeBlock, registryParams]
  )

  const algorithmParam = useMemo(
    () => paramsById.get(blockAlgorithmParamId(activeBlock)) ?? blockParams.find((param) => param.algorithm === 'algorithm_selector') ?? null,
    [activeBlock, blockParams, paramsById]
  )

  const selectedAlgorithm = useMemo(() => {
    if (!algorithmParam) return 0
    return clampMpx1Value(
      Math.round(getMpx1ParamValue(algorithmParam, mpx1.shadow)),
      Math.round(Number(algorithmParam.range?.min ?? 0)),
      Math.round(Number(algorithmParam.range?.max ?? 0))
    )
  }, [algorithmParam, mpx1.shadow])

  const selectedAlgorithmKey = mpx1AlgorithmKey(selectedAlgorithm)

  const activeAlgorithmParams = useMemo(
    () => blockParams.filter((param) => param.algorithm === selectedAlgorithmKey),
    [blockParams, selectedAlgorithmKey]
  )

  const groupedPages = useMemo(
    () => groupMpx1ParamsByPage(activeAlgorithmParams),
    [activeAlgorithmParams]
  )

  const algorithmOptions = useMemo(() => {
    if (!algorithmParam) return [0]
    const min = Math.round(Number(algorithmParam.range?.min ?? 0))
    const max = Math.round(Number(algorithmParam.range?.max ?? 0))
    if (max < min) return [0]
    return Array.from({ length: max - min + 1 }, (_, index) => min + index)
  }, [algorithmParam])

  const selectedBlockMix = useMemo(() => {
    const param = activeAlgorithmParams.find((entry) => entry.id.endsWith('.mix'))
    if (!param) return 0.5
    const value = getMpx1ParamValue(param, mpx1.shadow)
    return clampMpx1Value((value - Number(param.range?.min ?? 0)) / Math.max(1, Number(param.range?.max ?? 127) - Number(param.range?.min ?? 0)), 0, 1)
  }, [activeAlgorithmParams, mpx1.shadow])

  const selectedBlockLevel = useMemo(() => {
    const param = activeAlgorithmParams.find((entry) => entry.id.endsWith('.level'))
    if (!param) return 0.5
    const value = getMpx1ParamValue(param, mpx1.shadow)
    return clampMpx1Value((value - Number(param.range?.min ?? 0)) / Math.max(1, Number(param.range?.max ?? 127) - Number(param.range?.min ?? 0)), 0, 1)
  }, [activeAlgorithmParams, mpx1.shadow])

  const isBlockBypassed = useCallback((blockId: EditorBlockId): boolean => {
    const selector = paramsById.get(blockAlgorithmParamId(blockId))
    const algorithmIndex = selector
      ? clampMpx1Value(
          Math.round(getMpx1ParamValue(selector, mpx1.shadow)),
          Math.round(Number(selector.range?.min ?? 0)),
          Math.round(Number(selector.range?.max ?? 0))
        )
      : 0
    const bypass = paramsById.get(`${blockId}.${mpx1AlgorithmKey(algorithmIndex)}.bypass`)
    if (!bypass) return false
    return getMpx1ParamValue(bypass, mpx1.shadow) >= 0.5
  }, [mpx1.shadow, paramsById])

  const handleParamChange = useCallback((param: MPX1RegistryParam, value: number) => {
    void mpx1.setParam(param.id, value).catch((err) => {
      console.error(`Failed to set MPX1 parameter ${param.id}:`, err)
    })
    setLcdText(`${param.display_name}: ${formatMpx1ParamValue(param, value)}`)
  }, [mpx1, setLcdText])

  const blockLabel = EDITOR_BLOCKS.find((block) => block.id === activeBlock)?.label ?? activeBlock

  return (
    <div className="mpx1-editor">
      <header className="mpx1-editor__block-strip">
        {EDITOR_BLOCKS.map((block) => {
          const bypassed = isBlockBypassed(block.id)
          return (
            <button
              key={block.id}
              type="button"
              className={`mpx1-editor__block-btn${activeBlock === block.id ? ' is-active' : ''}${bypassed ? ' is-bypassed' : ''}`}
              style={{ '--block-accent': block.color } as React.CSSProperties}
              onClick={() => setActiveBlock(block.id)}
            >
              <span className="mpx1-editor__block-dot" aria-hidden />
              <span>{block.label}</span>
            </button>
          )
        })}
      </header>

      <section className="mpx1-editor__workspace">
        <aside className="mpx1-editor__algorithms">
          <div className="mpx1-editor__panel-title">{blockLabel} Algorithms</div>
          <div className="mpx1-editor__algorithm-list">
            {algorithmOptions.map((option) => {
              const optionKey = mpx1AlgorithmKey(option)
              const optionParamCount = blockParams.filter((param) => param.algorithm === optionKey).length
              return (
                <label key={option} className={`mpx1-editor__algorithm-item${selectedAlgorithm === option ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="mpx1-algorithm"
                    checked={selectedAlgorithm === option}
                    onChange={() => {
                      if (algorithmParam) {
                        handleParamChange(algorithmParam, option)
                      }
                    }}
                  />
                  <span className="mpx1-editor__algorithm-name">{`Algorithm ${option.toString().padStart(2, '0')}`}</span>
                  <span className="mpx1-editor__algorithm-meta">{optionParamCount} params</span>
                </label>
              )
            })}
          </div>
        </aside>

        <div className="mpx1-editor__right-column">
          <div className="mpx1-editor__visualization">
            <div className="mpx1-editor__panel-title">{blockLabel} Visualizer</div>
            <BlockVisualization block={activeBlock} mix={selectedBlockMix} level={selectedBlockLevel} />
          </div>

          <div className="mpx1-editor__pages">
            {groupedPages.length === 0 && (
              <div className="mpx1-editor__empty">No parameters available for this algorithm in the current registry coverage.</div>
            )}

            {groupedPages.map((group) => (
              <section key={group.page} className="mpx1-editor__page-group">
                <div className="mpx1-editor__page-title">{group.page}</div>
                <div className="mpx1-editor__param-grid">
                  {group.params.map((param) => {
                    const currentValue = getMpx1ParamValue(param, mpx1.shadow)
                    return (
                      <ParamControl
                        key={param.id}
                        param={param}
                        value={currentValue}
                        onChange={(nextValue) => handleParamChange(param, nextValue)}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
