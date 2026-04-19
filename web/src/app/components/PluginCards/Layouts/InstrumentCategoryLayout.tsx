/**
 * InstrumentCategoryLayout — AXE-FX Edit structural parity for instruments
 *
 * Standard layout: Instrument Viz → Performance → Accordion(Advanced) → Footer
 * Used by: DrumMachineCard, SynthForgeCard, LooperCard, KeyboardSamplerCard
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

export interface InstrumentCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  cardWidth?: number
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* Performance section — generic slots */
  performanceParams?: ParamSlot[]

  /* Transport controls */
  transport?: ReactNode

  /* Output */
  outputLevel?: number
  inputLevel?: number

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function InstrumentCategoryLayout({
  plugin,
  accentColor: providedAccent,
  compact = false,
  cardWidth,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  performanceParams,
  transport,
  outputLevel = 0,
  inputLevel,
  advancedSections,
  presets,
  extraContent,
}: InstrumentCategoryLayoutProps) {
  const accentColor = providedAccent || getCategoryConfig(plugin.category).color
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
      cardHeight={560}
      cardWidth={cardWidth}
    >
      {/* Transport */}
      {transport && (
        <CarbonParameterSection title="Transport" accentColor={accentColor}>
          {transport}
        </CarbonParameterSection>
      )}

      {/* Performance Controls */}
      {performanceParams && performanceParams.length > 0 && (
        <CarbonParameterSection title="Performance" accentColor={accentColor}>
          <div className="carbon-param-row">
            {performanceParams.map(slot => (
              <ParameterKnob
                key={slot.label}
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
                size={compact ? 'small' : 'medium'}
                midi={slot.midi}
              />
            ))}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default InstrumentCategoryLayout
