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
  Save,
  FolderOpen,
  ChevronDown,
  MoreVertical,
  Copy,
  RotateCcw,
} from 'lucide-react'
import type { Plugin } from '../../../../map2/types'
import { getCategoryConfig, getCategoryIcon } from '../types'
import { BypassSwitch } from './BypassSwitch'
import { getPluginDescription } from '../../../data/pluginDescriptions'

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
  const description = getPluginDescription(plugin.name)
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
            <h3 className="plugin-card-title">{plugin.name}</h3>
            {!compact && (
              <div className="plugin-card-subtitle">
                <span className="plugin-card-author">{plugin.author || 'Unknown'}</span>
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
                <MoreVertical size={14} />
              </button>
              {showMenu && (
                <div className="plugin-card-menu">
                  {onCopyParams && (
                    <button onClick={() => { onCopyParams(); setShowMenu(false); }}>
                      <Copy size={12} /> Copy Parameters
                    </button>
                  )}
                  {onResetParams && (
                    <button onClick={() => { onResetParams(); setShowMenu(false); }}>
                      <RotateCcw size={12} /> Reset to Default
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
          background: linear-gradient(145deg, #1a1a1a 0%, #141414 100%);
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
          padding: 12px 16px;
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
          font-size: 14px;
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
          color: #888;
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
          color: #888;
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
          background: #242424;
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
          color: #ccc;
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
          color: #888;
          background: rgba(0, 0, 0, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          line-height: 1.4;
        }

        .plugin-card-visualization {
          padding: 16px;
          background: rgba(0, 0, 0, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .compact .plugin-card-visualization {
          padding: 12px;
        }

        .plugin-card-content {
          padding: 16px;
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
      `}</style>
    </div>
  )
}

export default PluginCardShell
