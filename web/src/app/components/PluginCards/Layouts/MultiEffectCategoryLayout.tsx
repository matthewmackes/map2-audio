/**
 * MultiEffectCategoryLayout — AXE-FX Edit structural parity for multi-effect processors
 *
 * Standard layout: Algorithm Display → Selector → Primary Controls → Accordion(Per-module) → Footer
 * Used by: EventideH9, ShoeGaze, PassionFX, H3000
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface AlgorithmOption {
  index: number
  name: string
  description?: string
}

export interface MultiEffectCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* Algorithm selector */
  algorithms?: AlgorithmOption[]
  currentAlgorithm?: number
  onAlgorithmChange?: (index: number) => void

  /* Primary controls */
  inputGain?: ParamSlot
  outputGain?: ParamSlot
  mix?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number
  clipping?: boolean

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function MultiEffectCategoryLayout({
  plugin,
  accentColor = '#ec4899',
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  algorithms,
  currentAlgorithm = 0,
  onAlgorithmChange,
  inputGain,
  outputGain,
  mix,
  inputLevel = 0,
  outputLevel = 0,
  clipping = false,
  advancedSections,
  presets,
  extraContent,
}: MultiEffectCategoryLayoutProps) {
  const renderKnob = (slot: ParamSlot | undefined, sz: 'small' | 'medium' | 'large' = 'medium') => {
    if (!slot) return null
    return (
      <ParameterKnob
        label={slot.label}
        value={slot.value}
        min={slot.min}
        max={slot.max}
        defaultValue={slot.defaultValue}
        step={slot.step}
        unit={slot.unit}
        onChange={slot.onChange}
        isLogarithmic={slot.isLogarithmic}
        valueFormatter={slot.valueFormatter}
        accentColor={accentColor}
        size={compact ? 'small' : sz}
        midi={slot.midi}
      />
    )
  }

  const footer = (
    <CarbonMeteringFooter inputLevel={inputLevel} outputLevel={outputLevel} clipping={clipping} />
  )

  return (
    <CarbonCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={bypassed}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      advancedSections={advancedSections}
      footer={footer}
      compact={compact}
      cardHeight={560}
    >
      {/* Algorithm Selector */}
      {algorithms && algorithms.length > 0 && (
        <CarbonParameterSection title="Algorithm" accentColor={accentColor}>
          <div className="carbon-param-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {algorithms.map(alg => (
              <button
                key={alg.index}
                className={`carbon-preset-btn ${currentAlgorithm === alg.index ? 'active' : ''}`}
                onClick={() => onAlgorithmChange?.(alg.index)}
                title={alg.description}
                style={currentAlgorithm === alg.index ? { background: accentColor, borderColor: accentColor } : undefined}
              >
                <span style={{ fontSize: 9, opacity: 0.7 }}>{alg.index}</span>
                <span style={{ fontSize: 10 }}>{alg.name}</span>
              </button>
            ))}
          </div>
          {algorithms[currentAlgorithm]?.description && (
            <div style={{ fontSize: 11, color: '#a8a8a8', marginTop: 8, lineHeight: 1.4 }}>
              {algorithms[currentAlgorithm].description}
            </div>
          )}
        </CarbonParameterSection>
      )}

      {/* Primary Controls */}
      {(inputGain || outputGain || mix) && (
        <CarbonParameterSection title="Level & Mix" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(inputGain, 'large')}
            {renderKnob(outputGain, 'large')}
            {renderKnob(mix, 'large')}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default MultiEffectCategoryLayout
