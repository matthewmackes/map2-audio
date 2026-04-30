/**
 * BypassSwitch Component
 *
 * Professional LED-style bypass toggle with animation.
 * Inspired by hardware pedal bypass switches.
 */

import { useCallback } from 'react'

interface BypassSwitchProps {
  bypassed: boolean
  onToggle: () => void
  accentColor?: string
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  showLabel?: boolean
}

export function BypassSwitch({
  bypassed,
  onToggle,
  accentColor = '#22c55e',
  size = 'medium',
  disabled = false,
  showLabel = false,
}: BypassSwitchProps) {
  const handleClick = useCallback(() => {
    if (!disabled) {
      onToggle()
    }
  }, [disabled, onToggle])

  const sizeConfig = {
    small: { width: 32, height: 18, ledSize: 8 },
    medium: { width: 40, height: 22, ledSize: 10 },
    large: { width: 48, height: 26, ledSize: 12 },
  }

  const { width, height, ledSize } = sizeConfig[size]
  const isOn = !bypassed

  return (
    <div className={`bypass-switch ${size} ${disabled ? 'disabled' : ''}`}>
      {showLabel && (
        <span className="bypass-switch-label">
          {isOn ? 'ON' : 'OFF'}
        </span>
      )}
      <button
        className={`bypass-switch-button ${isOn ? 'active' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        title={bypassed ? 'Enable' : 'Bypass'}
        aria-pressed={isOn}
        style={{
          '--switch-width': `${width}px`,
          '--switch-height': `${height}px`,
          '--led-size': `${ledSize}px`,
          '--accent-color': accentColor,
        } as React.CSSProperties}
      >
        {/* LED Indicator */}
        <span className="bypass-switch-led" />

        {/* Switch Track */}
        <span className="bypass-switch-track">
          <span className="bypass-switch-thumb" />
        </span>
      </button>

      <style>{`
        .bypass-switch {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bypass-switch-label {
          font-size: var(--cds-label-01-font-size);
          line-height: var(--cds-label-01-line-height);
          font-weight: 600;
          color: #888;
          letter-spacing: var(--cds-label-01-letter-spacing);
          min-width: 24px;
        }

        .bypass-switch-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: opacity var(--map2-dur-fast, 140ms) var(--map2-ease-in-out-rack, ease);
        }

        .bypass-switch-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .bypass-switch-led {
          width: var(--led-size);
          height: var(--led-size);
          border-radius: 50%;
          background: #333;
          border: 1px solid #444;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
          transition: all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease);
        }

        .bypass-switch-button.active .bypass-switch-led {
          background: var(--accent-color);
          border-color: var(--accent-color);
          box-shadow:
            0 0 8px var(--accent-color),
            0 0 16px rgba(var(--accent-color), 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.2);
        }

        .bypass-switch-track {
          display: flex;
          align-items: center;
          width: var(--switch-width);
          height: var(--switch-height);
          padding: 2px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: calc(var(--switch-height) / 2);
          transition: all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease);
        }

        .bypass-switch-button.active .bypass-switch-track {
          background: rgba(var(--accent-color-rgb, 34, 197, 94), 0.15);
          border-color: rgba(var(--accent-color-rgb, 34, 197, 94), 0.4);
        }

        .bypass-switch-thumb {
          width: calc(var(--switch-height) - 6px);
          height: calc(var(--switch-height) - 6px);
          background: linear-gradient(180deg, #444 0%, #333 100%);
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          transition: all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease);
        }

        .bypass-switch-button.active .bypass-switch-thumb {
          transform: translateX(calc(var(--switch-width) - var(--switch-height)));
          background: linear-gradient(180deg, var(--accent-color) 0%, color-mix(in srgb, var(--accent-color) 80%, black) 100%);
          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.3),
            0 0 6px var(--accent-color);
        }

        /* Alternative: Simple LED-only style */
        .bypass-switch.led-only .bypass-switch-track {
          display: none;
        }

        .bypass-switch.led-only .bypass-switch-led {
          width: calc(var(--led-size) * 1.5);
          height: calc(var(--led-size) * 1.5);
        }
      `}</style>
    </div>
  )
}

export default BypassSwitch
