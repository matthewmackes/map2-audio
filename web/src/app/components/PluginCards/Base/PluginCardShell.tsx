/**
 * PluginCardShell Component
 *
 * Common wrapper for all plugin cards providing:
 * - Header with plugin name, bypass toggle, preset selector
 * - Status indicators (connection, meters available)
 * - Consistent styling and layout
 */

import { useState, useCallback, type ReactNode } from 'react'
import {
  Power,
  FloppyDisk,
  FolderOpen,
  CaretDown,
  DotsThreeVertical,
  Copy,
  ArrowCounterClockwise,
  Sliders,
} from '@phosphor-icons/react'
import type { Plugin } from '../../../../map2/types'
import { getCategoryConfig, getCategoryIcon } from '../types'
import { BypassSwitch } from './BypassSwitch'
import { getPluginDescription } from '../../../data/pluginDescriptions'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../../map2/displayNames'

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
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
  const description = sanitizeRestrictedDisplayText(getPluginDescription(plugin.name) || '')
  const CategoryIcon = getCategoryIcon(plugin.category)

  const handleBypassToggle = useCallback(() => {
    onBypassToggle?.(!bypassed)
  }, [bypassed, onBypassToggle])

  return (
    <div
      className={`plugin-card-shell ${bypassed ? 'bypassed' : ''} ${compact ? 'compact' : ''} ${className}`}
      style={{
        '--accent-color': accentColor,
        '--accent-bg': catConfig.bg,
        '--accent-gradient': catConfig.gradient,
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
      {/* Header */}
      <div className="plugin-card-header">
        <div className="plugin-card-header-left">
          {showBypass && (
            <BypassSwitch
              bypassed={bypassed}
              onToggle={handleBypassToggle}
              accentColor={accentColor}
              size={compact ? 'small' : 'medium'}
            />
          )}
          <div className="plugin-card-title-section">
            <h3 className="plugin-card-title">{displayName}</h3>
            {!compact && (
              <div className="plugin-card-subtitle">
                <span className="plugin-card-author">{sanitizeRestrictedDisplayText(plugin.author) || 'Unknown'}</span>
                <span className="plugin-card-category" style={{ color: accentColor }}>
                  {CategoryIcon && (
                    <CategoryIcon
                      size={10}
                      color={accentColor}
                      style={{ marginRight: '3px', display: 'inline-block', verticalAlign: 'middle' }}
                    />
                  )}
                  {plugin.category}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="plugin-card-header-right">
          {showPresetControls && (
            <div className="plugin-card-preset-controls">
              {onLoadPreset && (
                <button
                  className="plugin-card-btn"
                  onClick={onLoadPreset}
                  title="Load Preset"
                >
                  <FolderOpen size={14} weight="duotone" />
                </button>
              )}
              {onSavePreset && (
                <button
                  className="plugin-card-btn"
                  onClick={onSavePreset}
                  title="Save Preset"
                >
                  <FloppyDisk size={14} weight="duotone" />
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
                <DotsThreeVertical size={14} weight="duotone" />
              </button>
              {showMenu && (
                <div className="plugin-card-menu">
                  {onOpenMidiMappings && (
                    <button onClick={() => { onOpenMidiMappings(); setShowMenu(false); }}>
                      <Sliders size={12} weight="duotone" /> MIDI Mappings
                    </button>
                  )}
                  {onCopyParams && (
                    <button onClick={() => { onCopyParams(); setShowMenu(false); }}>
                      <Copy size={12} weight="duotone" /> Copy Parameters
                    </button>
                  )}
                  {onResetParams && (
                    <button onClick={() => { onResetParams(); setShowMenu(false); }}>
                      <ArrowCounterClockwise size={12} weight="duotone" /> Reset to Default
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
        <div className="plugin-card-visualization">
          {visualization}
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
          background: linear-gradient(145deg, #0a0a0a 0%, #141414 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          transition: all 0.2s ease;
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

        .plugin-card-shell.bypassed {
          opacity: 0.6;
        }

        .plugin-card-shell.bypassed::before {
          opacity: 0.3;
        }

        .plugin-card-shell.compact {
          border-radius: 8px;
        }

        .plugin-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--header-padding);
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .compact .plugin-card-header {
          padding: 8px 12px;
        }

        .plugin-card-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .plugin-card-title-section {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .plugin-card-title {
          margin: 0;
          font-size: calc(14px * var(--font-scale));
          font-weight: 600;
          color: #f2f6ff;
          letter-spacing: 0.3px;
        }

        .compact .plugin-card-title {
          font-size: 12px;
        }

        .plugin-card-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
        }

        .plugin-card-author {
          color: #6b7280;
        }

        .plugin-card-category {
          padding: 1px 6px;
          background: var(--accent-bg);
          border-radius: 4px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 9px;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }

        .plugin-card-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
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
          border: none;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .plugin-card-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f2f6ff;
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
          background: #111111;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
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
          color: #d1d5db;
          font-size: 12px;
          cursor: pointer;
          text-align: left;
        }

        .plugin-card-menu button:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #f2f6ff;
        }

        .plugin-card-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 99;
        }

        .plugin-card-description {
          padding: 8px 16px;
          font-size: 11px;
          color: #6b7280;
          background: rgba(0, 0, 0, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          line-height: 1.4;
        }

        .plugin-card-visualization {
          padding: var(--card-padding);
          background: rgba(0, 0, 0, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .compact .plugin-card-visualization {
          padding: 12px;
        }

        .plugin-card-content {
          padding: var(--card-padding);
        }

        .compact .plugin-card-content {
          padding: 12px;
        }

        .plugin-card-footer {
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
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
            font-size: calc(12px * var(--font-scale));
          }
        }

        /* sm: 400-600px - Compact */
        @container plugin-card (min-width: 400px) and (max-width: 600px) {
          .plugin-card-shell {
            --card-padding: 10px;
            --card-gap: 10px;
            --header-padding: 8px 12px;
            --knob-size: 44px;
            --font-scale: 0.9;
            --viz-width-base: 336px;
            --viz-height-base: 119px;
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
            --card-padding: 18px;
            --card-gap: 14px;
            --header-padding: 14px 18px;
            --knob-size: 64px;
            --font-scale: 1.05;
            --viz-width-base: 448px;
            --viz-height-base: 161px;
          }
        }

        /* xl: > 1000px - Spacious */
        @container plugin-card (min-width: 1000px) {
          .plugin-card-shell {
            --card-padding: 20px;
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
