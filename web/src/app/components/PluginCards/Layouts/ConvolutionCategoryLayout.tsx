/**
 * ConvolutionCategoryLayout — AXE-FX Edit structural parity for IR/convolution effects
 *
 * Standard layout: IR Display + Browser → Mix → Accordion(Advanced) → Footer
 * Used by: CabinetIRCard, ReverbIRCard
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../ParameterControl'
import { FolderOpen, ChevronLeft, ChevronRight } from '@carbon/icons-react'
import { getCategoryConfig } from '../types'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface ConvolutionCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* IR info */
  irName?: string
  assetLabel?: string
  assetStatus?: ReactNode
  assetFacts?: ReactNode
  onBrowseIR?: () => void
  onPrevIR?: () => void
  onNextIR?: () => void
  uploadControl?: ReactNode
  assetSupportText?: ReactNode

  /* Mix */
  mix?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  extraContent?: ReactNode
}

export function ConvolutionCategoryLayout({
  plugin,
  accentColor: providedAccent,
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  irName,
  assetLabel = 'Loaded asset',
  assetStatus,
  assetFacts,
  onBrowseIR,
  onPrevIR,
  onNextIR,
  uploadControl,
  assetSupportText,
  mix,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  extraContent,
}: ConvolutionCategoryLayoutProps) {
  const accentColor = providedAccent || getCategoryConfig(plugin.category).color
  const renderKnob = (slot: ParamSlot | undefined) => {
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
        accentColor={accentColor}
        size={compact ? 'small' : 'medium'}
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
      cardHeight={420}
    >
      {/* IR Browser Section */}
      <CarbonParameterSection title="Impulse Response" accentColor={accentColor}>
        <div className="carbon-asset-selector-stack">
          <div className="carbon-asset-selector">
            <div className="carbon-asset-selector-main">
              <div className="carbon-asset-selector-title-block">
                <p className="carbon-asset-selector-kicker">{assetLabel}</p>
                <div className="carbon-asset-selector-nav">
                  {onPrevIR && (
                    <button type="button" className="carbon-card-icon-btn" onClick={onPrevIR} title="Previous IR">
                      <ChevronLeft size={16} />
                    </button>
                  )}
                  <div
                    className={`carbon-asset-selector-value ${irName ? '' : 'empty'}`}
                    title={irName || 'No IR loaded'}
                  >
                    {irName || 'No IR loaded'}
                  </div>
                  {onNextIR && (
                    <button type="button" className="carbon-card-icon-btn" onClick={onNextIR} title="Next IR">
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
              {assetStatus}
              {assetFacts}
              {assetSupportText ? <p className="carbon-asset-selector-support">{assetSupportText}</p> : null}
            </div>
            <div className="carbon-asset-selector-actions">
              {onBrowseIR && (
                <button type="button" className="carbon-toggle-btn" onClick={onBrowseIR}>
                  <FolderOpen size={14} style={{ marginRight: 4 }} />
                  Select...
                </button>
              )}
              {uploadControl}
            </div>
          </div>
        </div>
      </CarbonParameterSection>

      {/* Mix */}
      {mix && (
        <CarbonParameterSection title="Mix" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(mix)}
          </div>
        </CarbonParameterSection>
      )}

      {extraContent}
    </CarbonCardShell>
  )
}

export default ConvolutionCategoryLayout
