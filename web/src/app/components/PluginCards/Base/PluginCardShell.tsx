/**
 * PluginCardShell Component
 *
 * Common wrapper for all plugin cards providing:
 * - Header with plugin name, bypass toggle, preset selector
 * - Status indicators (connection, meters available)
 * - Consistent styling and layout
 */

import { useState, useCallback, type ReactNode } from 'react'
import { Tag, Toggle } from '@carbon/react'
import {
  CopyFile,
  FolderOpen,
  Launch,
  OverflowMenuVertical,
  Reset,
  Save,
  SettingsAdjust,
} from '@carbon/icons-react'
import type { Plugin } from '../../../../map2/types'
import { getCategoryConfig } from '../types'
import { getPluginDescription } from '../../../data/pluginDescriptions'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../../map2/displayNames'
import { getEffectIcon } from '../../icons/effectIcons'
import { useIsMobile } from '../../../hooks/useIsMobile'

interface PluginCardShellProps {
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
  onLaunch?: () => void
  showPresetControls?: boolean
  showBypass?: boolean
  showMoreMenu?: boolean
  compact?: boolean
  visualization?: ReactNode
  footer?: ReactNode
  customHeader?: ReactNode
  className?: string
}

export function PluginCardShell({
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
  onLaunch,
  showPresetControls = true,
  showBypass = true,
  showMoreMenu = true,
  compact = false,
  visualization,
  footer,
  customHeader,
  className = '',
}: PluginCardShellProps) {
  const [showMenu, setShowMenu] = useState(false)
  const isMobile = useIsMobile()
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const authorLabel = sanitizeRestrictedDisplayText(plugin.author) || 'MAP2 Audio'
  const parameterCount = plugin.parameters?.length ?? 0
  const description = sanitizeRestrictedDisplayText(getPluginDescription(plugin.name) || '')
  const WatermarkIcon = getEffectIcon(plugin.category)
  const hasWatermark = !compact && !isMobile

  const handleBypassToggle = useCallback(() => {
    onBypassToggle?.(!bypassed)
  }, [bypassed, onBypassToggle])

  return (
    <div
      className={`plugin-card-shell ${bypassed ? 'bypassed' : ''} ${compact ? 'compact' : ''} ${visualization ? 'has-visualization' : 'has-no-visualization'} ${hasWatermark ? 'has-watermark' : ''} ${className}`}
      style={{
        '--accent-color': accentColor,
        '--accent-bg': catConfig.bg,
        '--card-width': 'min(100%, 840px)',
        '--card-padding': '16px',
        '--card-gap': '12px',
        '--header-padding': '12px 16px',
        '--knob-size': '56px',
        '--font-scale': '1',
        '--viz-width-base': '392px',
        '--viz-height-base': '140px',
        containerType: 'inline-size',
        containerName: 'plugin-card',
      } as React.CSSProperties}
    >
      {hasWatermark && (
        <div
          className={`plugin-card-watermark ${visualization ? 'plugin-card-watermark--offset' : 'plugin-card-watermark--centered'}`}
          aria-hidden="true"
        >
          <WatermarkIcon
            style={{
              color: accentColor,
              fill: accentColor,
            }}
          />
        </div>
      )}

      {/* Header */}
      <div className="plugin-card-header">
        <div className="plugin-card-header-row">
          <div className="plugin-card-header-left">
            {showBypass && (
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
            <div className="plugin-card-title-section">
              <span className="plugin-card-eyebrow">Selected block audio</span>
              <h3 className="plugin-card-title">Audio Parameters</h3>
              <div className="plugin-card-subtitle">
                <span className="plugin-card-author">
                  {compact ? displayName : `${displayName} · ${authorLabel}`}
                </span>
              </div>
            </div>
          </div>

          <div className="plugin-card-header-right">
            {onLaunch && (
              <button
                className="plugin-card-btn"
                onClick={onLaunch}
                title="Open Full Editor"
                aria-label="Open Full Editor"
              >
                <Launch size={14} />
              </button>
            )}
            {showPresetControls && (
              <div className="plugin-card-preset-controls">
                {onLoadPreset && (
                  <button
                    className="plugin-card-btn"
                    onClick={onLoadPreset}
                    title="Load Preset"
                  >
                    <FolderOpen size={14} />
                  </button>
                )}
                {onSavePreset && (
                  <button
                    className="plugin-card-btn"
                    onClick={onSavePreset}
                    title="Save Preset"
                  >
                    <Save size={14} />
                  </button>
                )}
              </div>
            )}

            {showMoreMenu && (
              <div className="plugin-card-menu-container">
                <button
                  className="plugin-card-btn"
                  onClick={() => setShowMenu(!showMenu)}
                  title="More Options"
                >
                  <OverflowMenuVertical size={14} />
                </button>
                {showMenu && (
                  <div className="plugin-card-menu">
                    {onOpenMidiMappings && (
                      <button onClick={() => { onOpenMidiMappings(); setShowMenu(false); }}>
                        <SettingsAdjust size={12} /> MIDI Mappings
                      </button>
                    )}
                    {onCopyParams && (
                      <button onClick={() => { onCopyParams(); setShowMenu(false); }}>
                        <CopyFile size={12} /> Copy Parameters
                      </button>
                    )}
                    {onResetParams && (
                      <button onClick={() => { onResetParams(); setShowMenu(false); }}>
                        <Reset size={12} /> Reset to Default
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="plugin-card-header-meta">
          <Tag type="blue" size="sm">{plugin.category}</Tag>
          <Tag type="cool-gray" size="sm">
            {parameterCount} parameter{parameterCount === 1 ? '' : 's'}
          </Tag>
          <Tag type={bypassed ? 'red' : 'green'} size="sm">
            {bypassed ? 'Bypassed' : 'Active'}
          </Tag>
        </div>
      </div>

      {/* Description Section */}
      {description && !compact && (
        <div className="plugin-card-description">
          {description}
        </div>
      )}

      {/* Visualization Section */}
      {visualization && (
        <div className="plugin-card-visualization" style={{ position: 'relative' }}>
          <div style={{ position: 'relative', zIndex: 1 }}>
            {visualization}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="plugin-card-content">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="plugin-card-footer">
          {footer}
        </div>
      )}

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="plugin-card-menu-backdrop"
          onClick={() => setShowMenu(false)}
        />
      )}

      <style>{`
        .plugin-card-shell {
          width: var(--card-width);
          background: var(--cds-layer, #161616);
          border: 1px solid var(--cds-border-subtle, #393939);
          border-radius: 4px;
          overflow: hidden;
          position: relative;
          isolation: isolate;
          transition: border-color 0.2s ease, opacity 0.2s ease;
          color: var(--cds-text-primary, #f4f4f4);
        }

        .plugin-card-shell::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--accent-color);
          opacity: 0.8;
        }

        .plugin-card-watermark {
          display: none;
        }

        .plugin-card-watermark--centered {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .plugin-card-watermark--offset {
          top: 1.25rem;
          right: 1rem;
          transform: none;
          opacity: 0.08;
        }

        .plugin-card-watermark svg {
          display: block;
          width: 11rem;
          height: 11rem;
        }

        .plugin-card-watermark--offset svg {
          width: 8.5rem;
          height: 8.5rem;
        }

        .plugin-card-shell.bypassed {
          opacity: 0.6;
        }

        .plugin-card-shell.bypassed::before {
          opacity: 0.3;
        }

        .plugin-card-shell.compact {
          border-radius: 4px;
        }

        .plugin-card-header {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
          padding: var(--header-padding);
          background: var(--cds-layer-accent, #262626);
          border-bottom: 1px solid var(--cds-border-subtle, #393939);
          position: relative;
          z-index: 1;
        }

        .compact .plugin-card-header {
          padding: 8px 12px;
        }

        .plugin-card-header-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .plugin-card-header-left {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          min-width: 0;
          flex: 1;
        }

        .plugin-card-title-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .plugin-card-eyebrow {
          font-size: var(--cds-label-01-font-size);
          line-height: var(--cds-label-01-line-height);
          color: var(--cds-text-helper, #8d8d8d);
          letter-spacing: var(--cds-label-01-letter-spacing);
        }

        .plugin-card-title {
          margin: 0;
          font-size: calc(var(--cds-heading-02-font-size, 1rem) * var(--font-scale));
          line-height: var(--cds-heading-02-line-height, 1.33333);
          font-weight: 600;
          color: var(--cds-text-primary, #f4f4f4);
          letter-spacing: 0.16px;
        }

        .compact .plugin-card-title {
          font-size: var(--cds-label-01-font-size);
        }

        .plugin-card-subtitle {
          display: flex;
          align-items: center;
          gap: 0;
          font-size: var(--cds-body-compact-01-font-size);
          line-height: var(--cds-body-compact-01-line-height);
          min-width: 0;
        }

        .plugin-card-author {
          color: var(--cds-text-secondary, #a8a8a8);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .plugin-card-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .plugin-card-header-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .plugin-card-header-meta .cds--tag {
          margin: 0;
        }

        .plugin-card-preset-controls {
          display: flex;
          gap: 4px;
        }

        .plugin-card-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--cds-border-subtle, #525252);
          border-radius: 4px;
          background: var(--cds-layer-hover);
          color: var(--cds-text-secondary, #c6c6c6);
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .plugin-card-btn:hover {
          background: var(--cds-layer-hover, #333333);
          border-color: var(--cds-border-strong, #6f6f6f);
          color: var(--cds-text-primary, #f4f4f4);
        }

        .plugin-card-menu-container {
          position: relative;
        }

        .plugin-card-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          min-width: 160px;
          background: var(--cds-layer, #161616);
          border: 1px solid var(--cds-border-subtle, #393939);
          border-radius: 4px;
          padding: 4px;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .plugin-card-menu button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--cds-text-secondary, #c6c6c6);
          font-size: var(--cds-label-01-font-size, 0.75rem);
          cursor: pointer;
          text-align: left;
        }

        .plugin-card-menu button:hover {
          background: var(--cds-layer-hover, #333333);
          color: var(--cds-text-primary, #f4f4f4);
        }

        .plugin-card-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
        }

        .plugin-card-description {
          padding: 8px 16px;
          font-size: var(--cds-helper-text-01-font-size, 0.75rem);
          color: var(--cds-text-secondary, #a8a8a8);
          background: var(--cds-layer);
          border-bottom: 1px solid var(--cds-border-subtle, #393939);
          line-height: 1.4;
          position: relative;
          z-index: 1;
        }

        .plugin-card-visualization {
          padding: var(--card-padding);
          background: var(--cds-layer);
          border-bottom: 1px solid var(--cds-border-subtle, #393939);
          position: relative;
          z-index: 1;
        }

        .compact .plugin-card-visualization {
          padding: 12px;
        }

        .plugin-card-content {
          padding: var(--card-padding);
          position: relative;
          z-index: 1;
        }

        .compact .plugin-card-content {
          padding: 12px;
        }

        .plugin-card-footer {
          padding: 12px 16px;
          background: var(--cds-layer-accent, #262626);
          border-top: 1px solid var(--cds-border-subtle, #393939);
          position: relative;
          z-index: 1;
        }

        .compact .plugin-card-footer {
          padding: 8px 12px;
        }

        /* Container Query Breakpoints for Responsive Sizing */

        /* xs: < 400px - Ultra compact */
        @container plugin-card (max-width: 400px) {
          .plugin-card-shell {
            --card-padding: 8px;
            --card-gap: 8px;
            --header-padding: 6px 10px;
            --knob-size: 36px;
            --font-scale: 0.85;
            --viz-width-base: 280px;
            --viz-height-base: 98px;
          }

          .plugin-card-header {
            padding: var(--header-padding);
          }

          .plugin-card-visualization {
            padding: var(--card-padding);
          }

          .plugin-card-content {
            padding: var(--card-padding);
          }

          .plugin-card-title {
            font-size: calc(var(--cds-label-01-font-size, 0.75rem) * var(--font-scale));
          }

          .plugin-card-watermark svg {
            width: 7rem;
            height: 7rem;
          }
        }

        /* sm: 400-600px - Compact */
        @container plugin-card (min-width: 400px) and (max-width: 600px) {
          .plugin-card-shell {
            --card-padding: var(--cds-spacing-04, 0.75rem);
            --card-gap: var(--cds-spacing-04, 0.75rem);
            --header-padding: 8px 12px;
            --knob-size: 44px;
            --font-scale: 0.9;
            --viz-width-base: 336px;
            --viz-height-base: 119px;
          }

          .plugin-card-watermark svg {
            width: 8rem;
            height: 8rem;
          }
        }

        /* md: 600-800px - Normal (default) */
        @container plugin-card (min-width: 600px) and (max-width: 800px) {
          .plugin-card-shell {
            --card-padding: 16px;
            --card-gap: 12px;
            --header-padding: 12px 16px;
            --knob-size: 56px;
            --font-scale: 1;
            --viz-width-base: 392px;
            --viz-height-base: 140px;
          }
        }

        /* lg: 800-1000px - Comfortable */
        @container plugin-card (min-width: 800px) and (max-width: 1000px) {
          .plugin-card-shell {
            --card-padding: var(--cds-spacing-05, 1rem);
            --card-gap: var(--cds-spacing-05, 1rem);
            --header-padding: var(--cds-spacing-05, 1rem) var(--cds-spacing-05, 1rem);
            --knob-size: 64px;
            --font-scale: 1.05;
            --viz-width-base: 448px;
            --viz-height-base: 161px;
          }
        }

        /* xl: > 1000px - Spacious */
        @container plugin-card (min-width: 1000px) {
          .plugin-card-shell {
            --card-padding: var(--cds-spacing-06, 1.5rem);
            --card-gap: 16px;
            --header-padding: 16px 20px;
            --knob-size: 72px;
            --font-scale: 1.1;
            --viz-width-base: 504px;
            --viz-height-base: 182px;
          }
        }

        /* Backward compatibility: compact prop overrides container queries */
        .plugin-card-shell.compact {
          --card-padding: 12px;
          --card-gap: 8px;
          --header-padding: 8px 12px;
          --knob-size: 40px;
          --font-scale: 0.85;
          --viz-width-base: 280px;
          --viz-height-base: 98px;
        }
      `}</style>
    </div>
  )
}

export default PluginCardShell
