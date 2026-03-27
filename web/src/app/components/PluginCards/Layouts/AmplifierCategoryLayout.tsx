/**
 * AmplifierCategoryLayout — AXE-FX Edit structural parity for amplifier/distortion effects
 *
 * Standard layout: Tube/Model Viz → Input → Tone → Power → Accordion(Advanced) → Footer
 * Used by: TweedBassman, Peavey5150, NAMCard
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../ParameterControl'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface AmplifierCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode
  topContent?: ReactNode

  /* Input section */
  inputGain?: ParamSlot
  channel?: { value: string; options: string[]; onChange: (v: string) => void }
  bright?: { enabled: boolean; onToggle: () => void }

  /* Tone section */
  bass?: ParamSlot
  mid?: ParamSlot
  treble?: ParamSlot
  presence?: ParamSlot

  /* Power section */
  resonance?: ParamSlot
  bias?: ParamSlot
  sag?: ParamSlot
  masterVolume?: ParamSlot

  /* Output */
  outputGain?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function AmplifierCategoryLayout({
  plugin,
  accentColor = '#ff6b6b',
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  topContent,
  inputGain,
  channel,
  bright,
  bass,
  mid,
  treble,
  presence,
  resonance,
  bias,
  sag,
  masterVolume,
  outputGain,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  presets,
  extraContent,
}: AmplifierCategoryLayoutProps) {
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
      cardHeight={560}
    >
      {topContent}

      {/* Input Section */}
      {(inputGain || channel || bright) && (
        <CarbonParameterSection title="Input" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(inputGain)}
            {channel && (
              <div className="carbon-preset-row">
                {channel.options.map(opt => (
                  <button
                    key={opt}
                    className={`carbon-preset-btn ${channel.value === opt ? 'active' : ''}`}
                    onClick={() => channel.onChange(opt)}
                    style={channel.value === opt ? { background: accentColor, borderColor: accentColor } : undefined}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {bright && (
              <button
                className={`carbon-toggle-btn ${bright.enabled ? 'active' : ''}`}
                onClick={bright.onToggle}
                style={bright.enabled ? { background: accentColor, borderColor: accentColor } : undefined}
              >
                Bright
              </button>
            )}
          </div>
        </CarbonParameterSection>
      )}

      {/* Tone Section */}
      {(bass || mid || treble || presence) && (
        <CarbonParameterSection title="Tone" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(bass)}
            {renderKnob(mid)}
            {renderKnob(treble)}
            {renderKnob(presence, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {/* Power Section */}
      {(resonance || bias || sag || masterVolume) && (
        <CarbonParameterSection title="Power" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(masterVolume)}
            {renderKnob(resonance, 'small')}
            {renderKnob(bias, 'small')}
            {renderKnob(sag, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {/* Output */}
      {outputGain && (
        <CarbonParameterSection title="Output" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(outputGain)}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default AmplifierCategoryLayout
