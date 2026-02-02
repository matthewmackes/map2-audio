/**
 * CardinalCard Component
 *
 * Custom parameter card for DISTRHO Cardinal (VCV Rack) LV2 plugins.
 * Supports all variants: Cardinal, Cardinal Synth, Cardinal FX, Cardinal Mini.
 *
 * Features:
 * - VCV Rack-inspired modular aesthetic
 * - 24 automatable parameter knobs (mapped via Host Params module)
 * - Visual IO configuration display
 * - MIDI activity indicator
 * - Patch info and module hints
 */

import { useCallback, useMemo, useState } from 'react'
import type { PluginCardProps } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterGrid } from '../Base/ParameterGrid'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { CardinalIODisplay, type CardinalVariant } from '../Visualizations/CardinalIODisplay'
import type { PluginParameter } from '../../../../map2/types'

// Cardinal accent color (purple/violet for modular synth)
const CARDINAL_ACCENT = '#8b5cf6'

// Determine variant from plugin URI
function getVariant(uri: string): CardinalVariant {
  if (uri.includes('#synth')) return 'synth'
  if (uri.includes('#fx')) return 'fx'
  if (uri.includes('#mini')) return 'mini'
  return 'main'
}

// Get variant description
function getVariantDescription(variant: CardinalVariant): string {
  switch (variant) {
    case 'main':
      return 'Full modular environment with 8 audio + 10 CV I/O'
    case 'synth':
      return 'Instrument mode with stereo output and MIDI input'
    case 'fx':
      return 'Effect mode with stereo audio I/O'
    case 'mini':
      return 'Compact version with limited module selection'
  }
}

export function CardinalCard({
  plugin,
  parameterValues,
  onParameterChange,
  onParameterChangeEnd,
  accentColor: providedAccent,
  disabled = false,
  compact = false,
}: PluginCardProps) {
  const accentColor = providedAccent || CARDINAL_ACCENT
  const variant = getVariant(plugin.uri)
  const params = plugin.parameters || []

  // Parameter info tooltip state
  const [showParamInfo, setShowParamInfo] = useState(false)

  // Filter to only control parameters (param_1 through param_24)
  const controlParams = useMemo(() => {
    return params.filter(
      p => p.symbol.startsWith('param_') && !p.symbol.includes('_out')
    )
  }, [params])

  // Parameter change handler
  const handleChange = useCallback(
    (index: number) => (value: number) => {
      onParameterChange(index, value)
    },
    [onParameterChange]
  )

  // Format parameter value (0-10 range)
  const formatValue = (value: number): string => {
    return value.toFixed(2)
  }

  // IO Visualization
  const visualization = (
    <div className="cardinal-visualization">
      <CardinalIODisplay
        variant={variant}
        width={compact ? 240 : 280}
        height={compact ? 70 : 80}
        accentColor={accentColor}
      />

      {/* Patch info hint */}
      <div
        className="param-mapping-hint"
        onMouseEnter={() => setShowParamInfo(true)}
        onMouseLeave={() => setShowParamInfo(false)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>Host Params</span>

        {showParamInfo && (
          <div className="param-info-tooltip">
            <strong>Parameter Mapping</strong>
            <p>
              Parameters 1-24 are generic automation slots.
              Use the <em>Host Params Map</em> module in your
              Cardinal patch to assign them to specific knobs.
            </p>
            <p className="tip">
              Tip: Right-click a module parameter in Cardinal
              and select "Map to Host Parameter" to assign it.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .cardinal-visualization {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .param-mapping-hint {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 10px;
          cursor: help;
          position: relative;
        }

        .param-mapping-hint:hover {
          background: rgba(139, 92, 246, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }

        .param-info-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 8px;
          padding: 12px;
          background: #1a1a1a;
          border: 1px solid rgba(139, 92, 246, 0.4);
          border-radius: 6px;
          width: 220px;
          z-index: 100;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }

        .param-info-tooltip strong {
          display: block;
          color: ${accentColor};
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .param-info-tooltip p {
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          line-height: 1.4;
          margin: 0 0 8px 0;
        }

        .param-info-tooltip em {
          color: ${accentColor};
          font-style: normal;
          font-weight: 500;
        }

        .param-info-tooltip .tip {
          background: rgba(139, 92, 246, 0.1);
          padding: 6px 8px;
          border-radius: 4px;
          margin-bottom: 0;
          font-size: 10px;
        }
      `}</style>
    </div>
  )

  // Variant description footer
  const variantDescription = getVariantDescription(variant)
  const variantFooter = (
    <div className="cardinal-variant-description">
      {variantDescription}
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
      footer={variantFooter}
    >
      <div className="cardinal-parameters">
        {/* Parameter Grid - VCV Rack style */}
        <ParameterSection
          title="Automatable Parameters (24)"
          accentColor={accentColor}
        >
          {controlParams.length > 0 ? (
            <ParameterGrid
              columns={compact ? 4 : 6}
              minColumnWidth={compact ? 60 : 70}
              gap={compact ? 8 : 12}
            >
              {controlParams.map(param => (
                <ParameterKnob
                  key={param.index}
                  label={param.name.replace('Parameter ', 'P')}
                  value={parameterValues[param.index] ?? param.default}
                  min={param.min}
                  max={param.max}
                  defaultValue={param.default}
                  onChange={handleChange(param.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  valueFormatter={formatValue}
                  size={compact ? 'small' : 'small'}
                />
              ))}
            </ParameterGrid>
          ) : (
            <div className="no-params-message">
              <p>No parameters exposed to host.</p>
              <p className="hint">
                Open the Cardinal UI to configure your patch.
              </p>
            </div>
          )}
        </ParameterSection>

        {/* Module info section */}
        <div className="cardinal-info">
          <div className="info-item">
            <span className="label">VCV Rack</span>
            <span className="value">Open-Source Modular</span>
          </div>
          <div className="info-item">
            <span className="label">Modules</span>
            <span className="value">{variant === 'mini' ? 'Limited Set' : '3000+ Available'}</span>
          </div>
          <a
            href="https://github.com/DISTRHO/Cardinal"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Documentation
          </a>
        </div>
      </div>

      <style>{`
        .cardinal-parameters {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .no-params-message {
          text-align: center;
          padding: 20px;
          color: rgba(255, 255, 255, 0.5);
        }

        .no-params-message p {
          margin: 0 0 4px 0;
          font-size: 12px;
        }

        .no-params-message .hint {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.3);
        }

        .cardinal-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          font-size: 10px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .info-item .label {
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 9px;
        }

        .info-item .value {
          color: rgba(255, 255, 255, 0.7);
        }

        .github-link {
          display: flex;
          align-items: center;
          gap: 4px;
          color: rgba(255, 255, 255, 0.5);
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }

        .github-link:hover {
          background: rgba(139, 92, 246, 0.15);
          color: ${accentColor};
        }

        .cardinal-variant-description {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default CardinalCard
