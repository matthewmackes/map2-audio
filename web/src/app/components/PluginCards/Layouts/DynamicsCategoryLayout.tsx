/**
 * DynamicsCategoryLayout — AXE-FX Edit structural parity for dynamics processors
 *
 * Standard layout: GR Meter + Transfer Curve → Dynamics → Timing → Output → Accordion(Advanced) → Footer
 * Used by: CompressorCard, CelestialCompressorCard, LimiterCard, GateCard
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { GainReductionMeter } from '../../Dynamics/GainReductionMeter'
import { TransferCurve } from '../Visualizations/TransferCurve'

/** Parameter slot for a knob in the layout */
export interface ParamSlot {
  label: string
  value: number
  min: number
  max: number
  defaultValue: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  isLogarithmic?: boolean
  valueFormatter?: (v: number) => string
  midi?: { pluginUri: string; paramIndex: number }
}

export interface DynamicsCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  /* Dynamics section params */
  threshold?: ParamSlot
  ratio?: ParamSlot
  knee?: ParamSlot

  /* Timing section params */
  attack?: ParamSlot
  release?: ParamSlot
  hold?: ParamSlot

  /* Output section params */
  makeupGain?: ParamSlot
  autoMakeup?: { enabled: boolean; onToggle: () => void }

  /* Metering */
  inputLevel?: number
  outputLevel?: number
  gainReduction?: number
  clipping?: boolean

  /* Transfer curve viz */
  showTransferCurve?: boolean

  /* Advanced sections (accordion) */
  advancedSections?: AdvancedSection[]

  /* Extra content before advanced sections */
  extraContent?: ReactNode

  /* Preset row */
  presets?: ReactNode
}

export function DynamicsCategoryLayout({
  plugin,
  accentColor = '#22c55e',
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  threshold,
  ratio,
  knee,
  attack,
  release,
  hold,
  makeupGain,
  autoMakeup,
  inputLevel = 0,
  outputLevel = 0,
  gainReduction = 0,
  clipping = false,
  showTransferCurve = true,
  advancedSections,
  extraContent,
  presets,
}: DynamicsCategoryLayoutProps) {
  const visualization = (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <GainReductionMeter gainReduction={gainReduction} height={compact ? 120 : 140} />
      {showTransferCurve && threshold && ratio && (
        <TransferCurve
          threshold={threshold.value}
          ratio={ratio.value}
          knee={knee?.value ?? 0}
          makeupGain={makeupGain?.value ?? 0}
          inputLevel={inputLevel}
          outputLevel={outputLevel}
          accentColor={accentColor}
          width={compact ? 200 : 260}
          height={compact ? 120 : 140}
        />
      )}
    </div>
  )

  const renderKnob = (slot: ParamSlot | undefined, size: 'small' | 'medium' = 'medium') => {
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
        size={compact ? 'small' : size}
        midi={slot.midi}
      />
    )
  }

  const footer = (
    <CarbonMeteringFooter
      inputLevel={inputLevel}
      outputLevel={outputLevel}
      gainReduction={gainReduction}
      clipping={clipping}
    />
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
      cardHeight={520}
    >
      {/* Dynamics Section */}
      {(threshold || ratio || knee) && (
        <CarbonParameterSection title="Dynamics" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(threshold)}
            {renderKnob(ratio)}
            {renderKnob(knee)}
          </div>
        </CarbonParameterSection>
      )}

      {/* Timing Section */}
      {(attack || release || hold) && (
        <CarbonParameterSection title="Timing" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(attack)}
            {renderKnob(release)}
            {renderKnob(hold)}
          </div>
        </CarbonParameterSection>
      )}

      {/* Output Section */}
      {(makeupGain || autoMakeup) && (
        <CarbonParameterSection title="Output" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(makeupGain)}
            {autoMakeup && (
              <button
                className={`carbon-toggle-btn ${autoMakeup.enabled ? 'active' : ''}`}
                onClick={autoMakeup.onToggle}
                style={autoMakeup.enabled ? { background: accentColor, borderColor: accentColor } : undefined}
              >
                Auto Makeup
              </button>
            )}
          </div>
        </CarbonParameterSection>
      )}

      {/* Presets */}
      {presets}

      {/* Extra content */}
      {extraContent}
    </CarbonCardShell>
  )
}

export default DynamicsCategoryLayout
