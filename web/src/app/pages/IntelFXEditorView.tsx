/**
 * IntelFXEditorView - Parameter editor grouped by effect block.
 */

import {
  Accordion,
  AccordionItem,
  Checkbox,
  InlineLoading,
  Layer,
  Select,
  SelectItem,
  Tag,
} from '@carbon/react'
import { useMemo, useState, type CSSProperties } from 'react'

import { ParameterKnob } from '../components/ParameterControl'
import type { IntelFXRegistryParam } from '../../map2/intelfxApi'
import { useIntelFXPageContext } from './IntelFXPage'
import './IntelFXEditorView.css'

interface BlockGroup {
  blockId: string
  label: string
  color: string
  params: IntelFXRegistryParam[]
}

const BLOCK_COLORS: Record<string, string> = {
  hush: '#6b7280',
  compressor: '#ef4444',
  wah: '#f59e0b',
  eq: '#22c55e',
  pitch: '#06b6d4',
  chorus: '#ec4899',
  flanger: '#8b5cf6',
  phaser: '#a855f7',
  tremolo: '#f97316',
  delay: '#3b82f6',
  reverb: '#14b8a6',
  program: '#64748b',
  system: '#94a3b8',
  global: '#78716c',
  midi: '#a1a1aa',
}

const BLOCK_ORDER = [
  'hush',
  'compressor',
  'wah',
  'eq',
  'pitch',
  'chorus',
  'flanger',
  'phaser',
  'tremolo',
  'delay',
  'reverb',
] as const

function groupParamsByBlock(params: IntelFXRegistryParam[] | undefined): BlockGroup[] {
  if (!params || params.length === 0) {
    return []
  }

  const groups: Record<string, IntelFXRegistryParam[]> = {}
  for (const param of params) {
    const block = param.block || 'other'
    if (!groups[block]) {
      groups[block] = []
    }
    groups[block].push(param)
  }

  const orderedBlockIds = [
    ...BLOCK_ORDER.filter((blockId) => groups[blockId]),
    ...Object.keys(groups).filter((blockId) => !BLOCK_ORDER.includes(blockId as typeof BLOCK_ORDER[number])).sort(),
  ]

  return orderedBlockIds.map((blockId) => ({
    blockId,
    label: blockId.charAt(0).toUpperCase() + blockId.slice(1),
    color: BLOCK_COLORS[blockId] ?? '#64748b',
    params: groups[blockId],
  }))
}

export function IntelFXEditorView() {
  const { intelfx } = useIntelFXPageContext()
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())

  const blockGroups = useMemo(
    () => groupParamsByBlock(intelfx.registry?.params),
    [intelfx.registry?.params],
  )
  const totalParams = useMemo(
    () => blockGroups.reduce((total, group) => total + group.params.length, 0),
    [blockGroups],
  )

  const handleParamChange = (paramId: string, value: number) => {
    void intelfx.setParam(paramId, value).catch((err) => {
      console.error('Failed to set IntelFX param:', err)
    })
  }

  if (!intelfx.registry) {
    return (
      <div className="intelfx-editor-page intelfx-editor-page--loading">
        <InlineLoading status="active" description="Loading IntelFX registry..." />
      </div>
    )
  }

  if (blockGroups.length === 0) {
    return (
      <div className="intelfx-editor-page">
        <Layer className="intelfx-editor-page__empty">No parameters available in the IntelFX registry.</Layer>
      </div>
    )
  }

  return (
    <div className="intelfx-editor-page">
      <Layer className="intelfx-editor-page__hero">
        <div className="intelfx-editor-page__hero-copy">
          <h2 className="intelfx-editor-page__title">Parameter editor</h2>
          <p className="intelfx-editor-page__subtitle">Edit IntelFX parameters by effect block with grouped controls.</p>
        </div>
        <div className="intelfx-editor-page__hero-tags">
          <Tag type="blue">{blockGroups.length} blocks</Tag>
          <Tag type="gray">{totalParams} params</Tag>
        </div>
      </Layer>

      <Accordion align="start" className="intelfx-editor-page__accordion">
        {blockGroups.map((group) => {
          const isOpen = openSections.has(group.blockId)

          return (
            <AccordionItem
              key={group.blockId}
              open={isOpen}
              onHeadingClick={({ isOpen: currentlyOpen }) => {
                setOpenSections((previous) => {
                  const next = new Set(previous)
                  if (currentlyOpen) {
                    next.delete(group.blockId)
                  } else {
                    next.add(group.blockId)
                  }
                  return next
                })
              }}
              title={
                <span className="intelfx-editor-page__item-title">
                  <span className="intelfx-editor-page__item-dot" style={{ background: group.color }} aria-hidden />
                  <span className="intelfx-editor-page__item-label">{group.label}</span>
                  <Tag type="cool-gray">{group.params.length}</Tag>
                </span>
              }
            >
              <div className="intelfx-editor-page__item-panel" style={{ '--intelfx-editor-accent': group.color } as CSSProperties}>
                <div className="intelfx-editor-page__controls">
                  {group.params.map((param) => {
                    const currentValue = Number(intelfx.shadow[param.id] ?? param.default ?? param.range.min)

                    if (param.type === 'bool' || param.type === 'boolean') {
                      return (
                        <div key={param.id} className="intelfx-editor-page__bool-control">
                          <Checkbox
                            id={`intelfx-editor-bool-${param.id}`}
                            labelText={param.display_name}
                            checked={currentValue > 0}
                            onChange={(event) => handleParamChange(param.id, event.target.checked ? 1 : 0)}
                          />
                        </div>
                      )
                    }

                    if (param.type === 'enum' || param.widget === 'select') {
                      const options: number[] = []
                      for (let value = param.range.min; value <= param.range.max; value++) {
                        options.push(value)
                      }

                      return (
                        <div key={param.id} className="intelfx-editor-page__select-control">
                          <Select
                            id={`intelfx-editor-select-${param.id}`}
                            labelText={param.display_name}
                            value={`${Math.round(currentValue)}`}
                            onChange={(event) => handleParamChange(param.id, Number(event.target.value))}
                            size="sm"
                          >
                            {options.map((option) => (
                              <SelectItem key={option} value={`${option}`} text={`${option}`} />
                            ))}
                          </Select>
                        </div>
                      )
                    }

                    return (
                      <ParameterKnob
                        key={param.id}
                        label={param.display_name}
                        value={currentValue}
                        min={param.range.min}
                        max={param.range.max}
                        step={param.type === 'int' ? 1 : undefined}
                        unit={param.units || ''}
                        accentColor={group.color}
                        onChange={(value) => handleParamChange(param.id, value)}
                        size="small"
                        isLogarithmic={param.log_taper}
                      />
                    )
                  })}
                </div>
              </div>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}

export default IntelFXEditorView
