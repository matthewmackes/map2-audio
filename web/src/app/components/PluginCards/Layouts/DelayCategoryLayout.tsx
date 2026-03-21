/**
 * DelayCategoryLayout — AXE-FX Edit structural parity for delay effects
 *
 * Standard layout: Tap Grid → Time → Character → Mix → Accordion(Advanced) → Footer
 * Used by: NativeDelayCard, TooB DelayCard
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface DelayCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  cardWidth?: number
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* Time section */
  delayTimeL?: ParamSlot
  delayTimeR?: ParamSlot
  sync?: { enabled: boolean; onToggle: () => void }
  tapTempo?: { onTap: () => void; bpm?: number }
  link?: { linked: boolean; onToggle: () => void }

  /* Character section */
  feedback?: ParamSlot
  tone?: ParamSlot
  modRate?: ParamSlot
  modDepth?: ParamSlot

  /* Mix section */
  mix?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function DelayCategoryLayout({
  plugin,
  accentColor = '#45b7d1',
  compact = false,
  cardWidth,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  delayTimeL,
  delayTimeR,
  sync,
  tapTempo,
  link,
  feedback,
  tone,
  modRate,
  modDepth,
  mix,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  presets,
  extraContent,
}: DelayCategoryLayoutProps) {
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
      cardHeight={520}
      cardWidth={cardWidth}
    >
      {/* Time Section */}
      <CarbonParameterSection title="Time" accentColor={accentColor}>
        <div className="carbon-param-row">
          {renderKnob(delayTimeL)}
          {renderKnob(delayTimeR)}
        </div>
        <div className="carbon-param-row" style={{ marginTop: 8 }}>
          {sync && (
            <button
              className={`carbon-toggle-btn ${sync.enabled ? 'active' : ''}`}
              onClick={sync.onToggle}
              style={sync.enabled ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              Sync
            </button>
          )}
          {link && (
            <button
              className={`carbon-toggle-btn ${link.linked ? 'active' : ''}`}
              onClick={link.onToggle}
              style={link.linked ? { background: accentColor, borderColor: accentColor } : undefined}
            >
              Link L/R
            </button>
          )}
          {tapTempo && (
            <button className="carbon-toggle-btn" onClick={tapTempo.onTap}>
              Tap {tapTempo.bpm ? `(${tapTempo.bpm} BPM)` : ''}
            </button>
          )}
        </div>
      </CarbonParameterSection>

      {/* Character Section */}
      {(feedback || tone || modRate || modDepth) && (
        <CarbonParameterSection title="Character" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(feedback)}
            {renderKnob(tone, 'small')}
          </div>
          {(modRate || modDepth) && (
            <div className="carbon-param-row" style={{ marginTop: 8 }}>
              {renderKnob(modRate, 'small')}
              {renderKnob(modDepth, 'small')}
            </div>
          )}
        </CarbonParameterSection>
      )}

      {/* Mix Section */}
      {mix && (
        <CarbonParameterSection title="Mix" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(mix)}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default DelayCategoryLayout
