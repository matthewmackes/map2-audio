/**
 * EQCategoryLayout — AXE-FX Edit structural parity for EQ effects
 *
 * Standard layout: EQ Curve → Band Grid → Output → Accordion(Advanced)
 * Used by: ParametricEQCard
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface EQBandConfig {
  id: string
  enabled: boolean
  onToggleEnabled: () => void
  frequency: ParamSlot
  gain: ParamSlot
  q: ParamSlot
  type?: { value: string; options: string[]; onChange: (v: string) => void }
}

export interface EQCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* EQ bands */
  bands?: EQBandConfig[]

  /* Output */
  outputGain?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  extraContent?: ReactNode
}

export function EQCategoryLayout({
  plugin,
  accentColor = '#4ecdc4',
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  bands,
  outputGain,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  extraContent,
}: EQCategoryLayoutProps) {
  const renderKnob = (slot: ParamSlot, sz: 'small' | 'medium' = 'small') => (
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
    >
      {/* Band Grid */}
      {bands && bands.length > 0 && (
        <CarbonParameterSection title="Bands" accentColor={accentColor}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(bands.length, 4)}, 1fr)`, gap: 8 }}>
            {bands.map(band => (
              <div key={band.id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: 6,
                background: band.enabled ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderRadius: 4,
                opacity: band.enabled ? 1 : 0.4,
              }}>
                <button
                  className={`carbon-toggle-btn ${band.enabled ? 'active' : ''}`}
                  onClick={band.onToggleEnabled}
                  style={{
                    fontSize: 9,
                    padding: '2px 8px',
                    ...(band.enabled ? { background: accentColor, borderColor: accentColor } : {}),
                  }}
                >
                  {band.id}
                </button>
                {renderKnob(band.frequency)}
                {renderKnob(band.gain)}
                {renderKnob(band.q)}
                {band.type && (
                  <div className="carbon-preset-row" style={{ justifyContent: 'center' }}>
                    {band.type.options.map(opt => (
                      <button
                        key={opt}
                        className={`carbon-preset-btn ${band.type!.value === opt ? 'active' : ''}`}
                        onClick={() => band.type!.onChange(opt)}
                        style={{
                          fontSize: 8,
                          padding: '1px 4px',
                          ...(band.type!.value === opt ? { background: accentColor, borderColor: accentColor } : {}),
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CarbonParameterSection>
      )}

      {/* Output */}
      {outputGain && (
        <CarbonParameterSection title="Output" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(outputGain, 'medium')}
          </div>
        </CarbonParameterSection>
      )}

      {extraContent}
    </CarbonCardShell>
  )
}

export default EQCategoryLayout
