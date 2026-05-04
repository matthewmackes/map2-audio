// ============================================================================
// MAP2 Audio Platform - MIDI Learn Button Component
// Floating toggle button for entering/exiting MIDI learn mode
// Uses plain HTML/CSS to be compatible with any styling system
// ============================================================================

import { memo } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface MidiLearnButtonProps {
  /** Whether MIDI learn mode is active */
  isActive: boolean;
  /** Callback to toggle MIDI learn mode */
  onToggle: () => void;
  /** Number of active MIDI mappings */
  mappingCount?: number;
  /** Position: 'fixed' for floating, 'relative' for inline */
  position?: 'fixed' | 'relative';
  /** Size of the button */
  size?: 'small' | 'medium' | 'large';
}

// ============================================================================
// Main MidiLearnButton Component
// ============================================================================

const MidiLearnButton = memo(({
  isActive,
  onToggle,
  mappingCount = 0,
  position = 'fixed',
  size = 'medium',
}: MidiLearnButtonProps) => {
  const sizeMap = {
    small: { button: 32, icon: 16, badge: 14 },
    medium: { button: 40, icon: 20, badge: 16 },
    large: { button: 48, icon: 24, badge: 18 },
  };

  const dimensions = sizeMap[size];

  const baseStyles: React.CSSProperties = {
    width: dimensions.button,
    height: dimensions.button,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all var(--map2-dur-moderate-02) var(--map2-ease-productive-standard)',
    position: position === 'fixed' ? 'fixed' : 'relative',
    ...(position === 'fixed' ? { bottom: 80, right: 24, zIndex: 1000 } : {}),
  };

  const activeStyles: React.CSSProperties = isActive
    ? {
        backgroundColor: '#9c27b0',
        color: '#ffffff',
        boxShadow: '0 0 12px rgba(156, 39, 176, 0.5)',
        animation: 'midiLearnPulse 1.5s ease-in-out infinite',
      }
    : {
        backgroundColor: 'rgba(30, 30, 30, 0.9)',
        color: '#9ca3af',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      };

  return (
    <>
      <style>
        {`
          @keyframes midiLearnPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(156, 39, 176, 0.4); }
            50% { box-shadow: 0 0 12px rgba(156, 39, 176, 0.6); }
          }
        `}
      </style>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={onToggle}
          style={{ ...baseStyles, ...activeStyles }}
          title={isActive ? 'Exit MIDI Learn Mode' : 'Enter MIDI Learn Mode'}
        >
          {/* Piano/MIDI icon - simple SVG */}
          <svg
            width={dimensions.icon}
            height={dimensions.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 5h18v14H3z" />
            <path d="M7 5v8" />
            <path d="M12 5v8" />
            <path d="M17 5v8" />
            <path d="M5 13h2v6H5z" fill="currentColor" />
            <path d="M9 13h2v6H9z" fill="currentColor" />
            <path d="M14 13h2v6h-2z" fill="currentColor" />
            <path d="M18 13h2v6h-2z" fill="currentColor" />
          </svg>
        </button>
        {/* Badge for mapping count */}
        {mappingCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              backgroundColor: '#9c27b0',
              color: '#ffffff',
              fontSize: dimensions.badge * 0.7,
              fontWeight: 600,
              minWidth: dimensions.badge,
              height: dimensions.badge,
              borderRadius: dimensions.badge / 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 var(--cds-spacing-02)',
            }}
          >
            {mappingCount}
          </span>
        )}
      </div>
    </>
  );
});

MidiLearnButton.displayName = 'MidiLearnButton';

export default MidiLearnButton;
