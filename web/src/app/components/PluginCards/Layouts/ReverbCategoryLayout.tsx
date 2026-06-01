/**
 * ReverbCategoryLayout — AXE-FX Edit structural parity for reverb effects
 *
 * Standard layout: Decay Curve → Space → Time → Tone → Mix → Accordion(Advanced) → Footer
 * Used by: LexiLoveCard, Dragonfly template fallbacks, ReverbIRCard, and reverb-template fallbacks
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../ParameterControl'
import { getCategoryConfig } from '../types'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface ReverbCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  cardWidth?: number
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* Space section */
  size?: ParamSlot
  width?: ParamSlot
  diffusion?: ParamSlot

  /* Time section */
  preDelay?: ParamSlot
  decay?: ParamSlot

  /* Tone section */
  damping?: ParamSlot
  highCut?: ParamSlot
  lowCut?: ParamSlot

  /* Mix section */
  mix?: ParamSlot
  dryLevel?: ParamSlot
  wetLevel?: ParamSlot
  earlyLevel?: ParamSlot
  lateLevel?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function ReverbCategoryLayout({
  plugin,
  accentColor: providedAccent,
  compact = false,
  cardWidth,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  size,
  width,
  diffusion,
  preDelay,
  decay,
  damping,
  highCut,
  lowCut,
  mix,
  dryLevel,
  wetLevel,
  earlyLevel,
  lateLevel,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  presets,
  extraContent,
}: ReverbCategoryLayoutProps) {
  const accentColor = providedAccent || getCategoryConfig(plugin.category).color
  const renderKnob = (slot: ParamSlot | undefined, sz: 'small' | 'medium' = 'medium') => {
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
    <CarbonMeteringFooter inputLevel={inputLevel} outputLevel={outputLevel} />
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
      cardHeight={500}
      cardWidth={cardWidth}
    >
      {/* Space Section */}
      {(size || width || diffusion) && (
        <CarbonParameterSection title="Space" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(size)}
            {renderKnob(width)}
            {renderKnob(diffusion, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {/* Time Section */}
      {(preDelay || decay) && (
        <CarbonParameterSection title="Time" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(preDelay)}
            {renderKnob(decay)}
          </div>
        </CarbonParameterSection>
      )}

      {/* Tone Section */}
      {(damping || highCut || lowCut) && (
        <CarbonParameterSection title="Tone" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(damping, 'small')}
            {renderKnob(highCut, 'small')}
            {renderKnob(lowCut, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {/* Mix Section */}
      {(mix || dryLevel || wetLevel || earlyLevel || lateLevel) && (
        <CarbonParameterSection title="Mix" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(mix)}
            {renderKnob(dryLevel, 'small')}
            {renderKnob(wetLevel, 'small')}
            {renderKnob(earlyLevel, 'small')}
            {renderKnob(lateLevel, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default ReverbCategoryLayout
