/**
 * CarbonCardShell — Carbon Design System compliant card shell
 *
 * Replaces per-card bespoke layouts with a standardized shell that
 * provides consistent header, visualization area, content, accordion
 * advanced sections, and metering footer across all effect categories.
 */

import { useState, useCallback, type ReactNode } from 'react'
import {
  Tag,
  Toggle,
  OverflowMenu,
  OverflowMenuItem,
  Accordion,
  AccordionItem,
} from '@carbon/react'
import {
  Save,
  FolderOpen,
  Copy,
  Reset,
  SettingsAdjust,
} from '@carbon/icons-react'
import type { Plugin } from '../../../../map2/types'
import { getCategoryConfig, CATEGORY_CARD_DIMENSIONS } from '../types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../../map2/displayNames'
import { getEffectIcon } from '../../icons/effectIcons'
import './carbonCardStyles.css'

const CARD_WIDTH_SCALE = 2
const CARD_HEIGHT_SCALE = 1.5
const DEFAULT_CARD_WIDTH = 420
const DEFAULT_CARD_HEIGHT = 480

/** Section definition for accordion-based advanced controls */
export interface AdvancedSection {
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}

interface CarbonCardShellProps {
  plugin: Plugin
  children: ReactNode
  accentColor?: string
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onSavePreset?: () => void
  onLoadPreset?: () => void
  onCopyParams?: () => void
  onResetParams?: () => void
  onOpenMidiMappings?: () => void
  visualization?: ReactNode
  advancedSections?: AdvancedSection[]
  footer?: ReactNode
  compact?: boolean
  className?: string
  /** Override category card height (px) */
  cardHeight?: number
  /** Override card width for dense cards that need additional horizontal room */
  cardWidth?: number
}

export function CarbonCardShell({
  plugin,
  children,
  accentColor: providedAccent,
  bypassed = false,
  onBypassToggle,
  onSavePreset,
  onLoadPreset,
  onCopyParams,
  onResetParams,
  onOpenMidiMappings,
  visualization,
  advancedSections,
  footer,
  compact = false,
  className = '',
  cardHeight,
  cardWidth,
}: CarbonCardShellProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const baseHeight = cardHeight || CATEGORY_CARD_DIMENSIONS[plugin.category] || DEFAULT_CARD_HEIGHT
  const resolvedHeight = Math.round(baseHeight * CARD_HEIGHT_SCALE)
  const resolvedWidth = Math.round((cardWidth || DEFAULT_CARD_WIDTH) * CARD_WIDTH_SCALE)

  const handleBypassToggle = useCallback(() => {
    onBypassToggle?.(!bypassed)
  }, [bypassed, onBypassToggle])

  const hasOverflowActions = onOpenMidiMappings || onCopyParams || onResetParams

  return (
    <div
      className={`carbon-card ${bypassed ? 'bypassed' : ''} ${className}`}
      style={{
        '--accent-color': accentColor,
        '--accent-bg': catConfig.bg,
        '--category-card-width': `${resolvedWidth}px`,
        '--category-card-height': `${resolvedHeight}px`,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="carbon-card-header">
        <div className="carbon-card-header-left">
          {onBypassToggle && (
            <Toggle
              id={`bypass-${plugin.uri}`}
              size="sm"
              toggled={!bypassed}
              onToggle={() => handleBypassToggle()}
              labelA=""
              labelB=""
              hideLabel
              aria-label="Bypass"
            />
          )}
          <div className="carbon-card-header-title">
            <h3 className="carbon-card-header-name">{displayName}</h3>
            {!compact && (
              <span className="carbon-card-header-subtitle">
                {sanitizeRestrictedDisplayText(plugin.author) || 'MAP2'}
              </span>
            )}
          </div>
        </div>

        <div className="carbon-card-header-right">
          <Tag type="outline" size="sm" style={{ color: accentColor, borderColor: accentColor }}>
            {plugin.category}
          </Tag>

          {onLoadPreset && (
            <button className="carbon-card-icon-btn" onClick={onLoadPreset} title="Load Preset">
              <FolderOpen size={16} />
            </button>
          )}
          {onSavePreset && (
            <button className="carbon-card-icon-btn" onClick={onSavePreset} title="Save Preset">
              <Save size={16} />
            </button>
          )}

          {hasOverflowActions && (
            <OverflowMenu size="sm" flipped aria-label="More options">
              {onOpenMidiMappings && (
                <OverflowMenuItem
                  itemText="MIDI Mappings"
                  onClick={onOpenMidiMappings}
                />
              )}
              {onCopyParams && (
                <OverflowMenuItem
                  itemText="Copy Parameters"
                  onClick={onCopyParams}
                />
              )}
              {onResetParams && (
                <OverflowMenuItem
                  itemText="Reset to Default"
                  onClick={onResetParams}
                  hasDivider
                />
              )}
            </OverflowMenu>
          )}
        </div>
      </div>

      {/* Visualization */}
      {visualization && (
        <div className="carbon-card-visualization">
          {visualization}
        </div>
      )}

      {/* Main Content (primary parameter sections) */}
      <div className="carbon-card-content">
        {children}
      </div>

      {/* Advanced Sections (Carbon Accordion) */}
      {advancedSections && advancedSections.length > 0 && (
        <div className="carbon-card-advanced">
          <Accordion>
            {advancedSections.map(section => (
              <AccordionItem
                key={section.id}
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {section.icon}
                    {section.title}
                  </span>
                }
                open={section.defaultOpen}
              >
                {section.children}
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="carbon-card-footer">
          {footer}
        </div>
      )}
    </div>
  )
}

export default CarbonCardShell
