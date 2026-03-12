/**
 * IntelFXPanelView - Panel view with 11 effect blocks in a 2-column grid.
 *
 * Each block shows: name, bypass state, and key parameters as knobs.
 * Select a block header to expand or collapse the parameter area.
 */

import { ChevronDown, ChevronUp } from '@carbon/icons-react'
import { Button, Layer, Tag } from '@carbon/react'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'

import { ParameterKnob } from '../components/Controls/ParameterKnob'
import type { MPX1RegistryParam } from '../../map2/mpx1Api'
import { useIntelFXPageContext } from './IntelFXPage'
import './IntelFXPanelView.css'

interface EffectBlockDef {
  id: string
  label: string
  color: string
  bypassKey: string
}

const EFFECT_BLOCKS: EffectBlockDef[] = [
  { id: 'hush', label: 'HUSH', color: '#6b7280', bypassKey: 'HUSH' },
  { id: 'compressor', label: 'COMPRESSOR', color: '#ef4444', bypassKey: 'COMP' },
  { id: 'wah', label: 'WAH', color: '#f59e0b', bypassKey: 'WAH' },
  { id: 'eq', label: 'EQ', color: '#22c55e', bypassKey: 'EQ' },
  { id: 'pitch', label: 'PITCH', color: '#06b6d4', bypassKey: 'PIT' },
  { id: 'chorus', label: 'CHORUS', color: '#ec4899', bypassKey: 'CHO' },
  { id: 'flanger', label: 'FLANGER', color: '#8b5cf6', bypassKey: 'FLG' },
  { id: 'phaser', label: 'PHASER', color: '#a855f7', bypassKey: 'PHA' },
  { id: 'tremolo', label: 'TREMOLO', color: '#f97316', bypassKey: 'TRM' },
  { id: 'delay', label: 'DELAY', color: '#3b82f6', bypassKey: 'DLY' },
  { id: 'reverb', label: 'REVERB', color: '#14b8a6', bypassKey: 'REV' },
]

function getBlockParams(params: MPX1RegistryParam[] | undefined, blockId: string): MPX1RegistryParam[] {
  if (!params) return []
  return params.filter((param) => param.block === blockId || param.id.startsWith(`${blockId}.`))
}

export function IntelFXPanelView() {
  const { intelfx, bypassState, onToggleBypass, setLcdText } = useIntelFXPageContext()
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set())

  const registryParams = intelfx.registry?.params

  const blockParamsMap = useMemo(() => {
    const map: Record<string, MPX1RegistryParam[]> = {}
    for (const block of EFFECT_BLOCKS) {
      map[block.id] = getBlockParams(registryParams, block.id)
    }
    return map
  }, [registryParams])

  const engagedCount = useMemo(
    () =>
      EFFECT_BLOCKS.reduce((count, block) => {
        return count + ((bypassState[block.bypassKey as keyof typeof bypassState] ?? true) ? 1 : 0)
      }, 0),
    [bypassState],
  )

  const toggleExpand = useCallback((blockId: string) => {
    setExpandedBlocks((previous) => {
      const next = new Set(previous)
      if (next.has(blockId)) {
        next.delete(blockId)
      } else {
        next.add(blockId)
      }
      return next
    })
  }, [])

  const handleParamChange = useCallback(
    (paramId: string, value: number) => {
      void intelfx.setParam(paramId, value).catch((err) => {
        console.error('Failed to set IntelFX param:', err)
      })
    },
    [intelfx],
  )

  const handleBypassToggle = useCallback(
    (block: EffectBlockDef) => {
      const isEngaged = bypassState[block.bypassKey as keyof typeof bypassState] ?? true
      onToggleBypass(block.bypassKey as never)
      setLcdText(`${block.label} ${isEngaged ? 'BYPASSED' : 'ENGAGED'}`)
    },
    [bypassState, onToggleBypass, setLcdText],
  )

  return (
    <div className="intelfx-panel-page">
      <Layer className="intelfx-panel-page__hero">
        <div className="intelfx-panel-page__hero-copy">
          <h2 className="intelfx-panel-page__title">Effect panel</h2>
          <p className="intelfx-panel-page__subtitle">
            Manage bypass state and key parameters for each IntelFX effect block.
          </p>
        </div>
        <div className="intelfx-panel-page__hero-tags">
          <Tag type="blue">11 blocks</Tag>
          <Tag type={registryParams?.length ? 'green' : 'gray'}>{registryParams?.length ?? 0} params loaded</Tag>
          <Tag type="gray">{engagedCount} engaged</Tag>
        </div>
      </Layer>

      <div className="intelfx-panel-page__grid">
        {EFFECT_BLOCKS.map((block) => {
          const isEngaged = bypassState[block.bypassKey as keyof typeof bypassState] ?? true
          const isExpanded = expandedBlocks.has(block.id)
          const params = blockParamsMap[block.id] ?? []
          const visibleParams = isExpanded ? params : params.slice(0, 4)

          return (
            <section
              key={block.id}
              className={`intelfx-panel-page__block${isEngaged ? ' is-engaged' : ' is-bypassed'}`}
              style={{ '--intelfx-panel-accent': block.color } as CSSProperties}
            >
              <button
                type="button"
                className="intelfx-panel-page__block-header"
                onClick={() => toggleExpand(block.id)}
                aria-expanded={isExpanded}
                aria-label={`${block.label} block`}
              >
                <span className="intelfx-panel-page__block-dot" aria-hidden />
                <span className="intelfx-panel-page__block-title">{block.label}</span>
                <Tag type="gray">{params.length} params</Tag>
                {isExpanded ? (
                  <ChevronUp size={16} aria-hidden className="intelfx-panel-page__expand-icon" />
                ) : (
                  <ChevronDown size={16} aria-hidden className="intelfx-panel-page__expand-icon" />
                )}
              </button>

              <div className="intelfx-panel-page__block-controls">
                <Tag type={isEngaged ? 'green' : 'red'}>{isEngaged ? 'Engaged' : 'Bypassed'}</Tag>
                <Button size="sm" kind={isEngaged ? 'tertiary' : 'primary'} onClick={() => handleBypassToggle(block)}>
                  {isEngaged ? 'Bypass block' : 'Enable block'}
                </Button>
              </div>

              {visibleParams.length > 0 ? (
                <div className="intelfx-panel-page__params" role="group" aria-label={`${block.label} parameters`}>
                  {visibleParams.map((param) => {
                    const currentValue = Number(intelfx.shadow[param.id] ?? param.default ?? param.range.min)
                    return (
                      <ParameterKnob
                        key={param.id}
                        label={param.display_name}
                        value={currentValue}
                        min={param.range.min}
                        max={param.range.max}
                        step={param.type === 'int' ? 1 : undefined}
                        unit={param.units || ''}
                        accentColor={block.color}
                        onChange={(value) => handleParamChange(param.id, value)}
                        size="small"
                        disabled={!isEngaged}
                        isLogarithmic={param.log_taper}
                      />
                    )
                  })}
                </div>
              ) : (
                <p className="intelfx-panel-page__empty">No parameters registered for this block.</p>
              )}

              {!isExpanded && params.length > 4 ? (
                <Button
                  kind="ghost"
                  size="sm"
                  className="intelfx-panel-page__show-more"
                  onClick={() => toggleExpand(block.id)}
                >
                  Show {params.length - 4} more parameters
                </Button>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default IntelFXPanelView
