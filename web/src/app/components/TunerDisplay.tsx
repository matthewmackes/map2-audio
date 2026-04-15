/**
 * TunerDisplay - Professional Guitar/Instrument Tuner Component
 * 
 * Features:
 * - Large note name display with octave
 * - Cents deviation indicator with needle
 * - Frequency display in Hz
 * - Color-coded in-tune indication
 * - Strobe tuner mode (optional)
 * - Confidence meter
 */

import React, { useEffect, useState, useRef } from 'react';

// Note names for display (used in tuner algorithms)
const _NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SUPPORT_SUCCESS = 'var(--support-success)'
const SUPPORT_WARNING = 'var(--support-warning)'
const SUPPORT_DANGER = 'var(--support-danger)'
const SUPPORT_WARN_TO_DANGER = 'color-mix(in srgb, var(--support-warning) 60%, var(--support-danger) 40%)'
const TEXT_SECONDARY_MIX = 'color-mix(in srgb, var(--text-secondary) 40%, transparent)'
const TEXT_PRIMARY_MIX = 'color-mix(in srgb, var(--text-primary) 20%, transparent)'

// Color based on cents deviation
const getInTuneColor = (cents: number): string => {
  const absCents = Math.abs(cents);
  if (absCents <= 2) return SUPPORT_SUCCESS; // Green: in tune
  if (absCents <= 10) return SUPPORT_WARNING; // Yellow: close
  if (absCents <= 20) return SUPPORT_WARN_TO_DANGER; // Orange: getting there
  return SUPPORT_DANGER; // Red: out of tune
};

// Get tuning quality label
const getTuningLabel = (cents: number): string => {
  const absCents = Math.abs(cents);
  if (absCents <= 2) return 'In Tune';
  if (absCents <= 5) return 'Very Close';
  if (absCents <= 10) return 'Close';
  if (absCents <= 20) return cents < 0 ? 'Flat' : 'Sharp';
  return cents < 0 ? 'Very Flat' : 'Very Sharp';
};

export interface TunerData {
  frequencyHz: number;
  noteName: string;
  octave: number;
  centsDeviation: number;
  confidence: number;
}

export interface TunerDisplayProps {
  /** Current tuner data */
  data: TunerData;
  /** Show strobe tuner visualization */
  showStrobe?: boolean;
  /** Display size variant */
  variant?: 'default' | 'compact' | 'large';
  /** Custom styles */
  style?: React.CSSProperties;
  /** Reference frequency for A4 (default 440) */
  referenceA4?: number;
}

// Needle SVG component for cents display
const TunerNeedle: React.FC<{ cents: number; width: number; height: number }> = ({ 
  cents, 
  width, 
  height 
}) => {
  const centerX = width / 2;
  const centerY = height - 20;
  const needleLength = height - 40;
  
  // Convert cents to angle (-50 to +50 cents = -45 to +45 degrees)
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const angle = (clampedCents / 50) * 45;
  const radians = (angle * Math.PI) / 180;
  
  const needleEndX = centerX + Math.sin(radians) * needleLength;
  const needleEndY = centerY - Math.cos(radians) * needleLength;
  
  const color = getInTuneColor(cents);
  
  return (
    <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      {/* Scale arc background */}
      <path
        d={`M ${centerX - needleLength * 0.7} ${centerY} 
            A ${needleLength * 0.7} ${needleLength * 0.7} 0 0 1 ${centerX + needleLength * 0.7} ${centerY}`}
        fill="none"
        stroke={TEXT_PRIMARY_MIX}
        strokeWidth="8"
        strokeLinecap="round"
      />
      
      {/* Center zone (in-tune) */}
      <path
        d={`M ${centerX - 15} ${centerY - needleLength * 0.65} 
            A ${needleLength * 0.7} ${needleLength * 0.7} 0 0 1 ${centerX + 15} ${centerY - needleLength * 0.65}`}
        fill="none"
        stroke={SUPPORT_SUCCESS}
        strokeWidth="10"
        strokeLinecap="round"
      />
      
      {/* Scale markers */}
      {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((marker) => {
        const markerAngle = (marker / 50) * 45;
        const markerRad = (markerAngle * Math.PI) / 180;
        const innerRadius = needleLength * 0.72;
        const outerRadius = marker === 0 ? needleLength * 0.85 : needleLength * 0.78;
        
        const x1 = centerX + Math.sin(markerRad) * innerRadius;
        const y1 = centerY - Math.cos(markerRad) * innerRadius;
        const x2 = centerX + Math.sin(markerRad) * outerRadius;
        const y2 = centerY - Math.cos(markerRad) * outerRadius;
        
        return (
          <line
            key={marker}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={marker === 0 ? SUPPORT_SUCCESS : TEXT_PRIMARY_MIX}
            strokeWidth={marker === 0 ? 3 : 1}
          />
        );
      })}
      
      {/* Needle */}
      <line
        x1={centerX}
        y1={centerY}
        x2={needleEndX}
        y2={needleEndY}
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
          transition: 'all 0.1s ease-out',
        }}
      />
      
      {/* Needle center dot */}
      <circle
        cx={centerX}
        cy={centerY}
        r={8}
        fill={color}
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
      />
      
      {/* Cents labels */}
      <text x={centerX - needleLength * 0.75} y={centerY + 15} fill="color-mix(in srgb, var(--text-secondary) 40%, transparent)" fontSize="10" textAnchor="middle">-50</text>
      <text x={centerX} y={centerY - needleLength * 0.65} fill="color-mix(in srgb, var(--text-secondary) 50%, transparent)" fontSize="10" textAnchor="middle">0</text>
      <text x={centerX + needleLength * 0.75} y={centerY + 15} fill="color-mix(in srgb, var(--text-secondary) 40%, transparent)" fontSize="10" textAnchor="middle">+50</text>
    </svg>
  );
};

// Strobe tuner visualization
const StrobeDisplay: React.FC<{ cents: number; width: number }> = ({ cents, width }) => {
  const [phase, setPhase] = useState(0);
  const animRef = useRef<number | undefined>(undefined);
  
  useEffect(() => {
    const speed = cents * 2; // Speed proportional to deviation
    
    const animate = () => {
      setPhase(prev => (prev + speed) % 360);
      animRef.current = requestAnimationFrame(animate);
    };
    
    if (Math.abs(cents) > 1) {
      animRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [cents]);
  
  const stripes = 12;
  const stripeWidth = width / stripes;
  
  return (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 24,
            overflow: 'hidden',
            borderRadius: 4,
            background: 'color-mix(in srgb, var(--surface-2) 88%, transparent)',
          }}
        >
      {Array.from({ length: stripes }).map((_, i) => {
        const offset = ((phase + i * 30) % 360) / 360;
        const intensity = Math.sin(offset * Math.PI * 2) * 0.5 + 0.5;
        const color = getInTuneColor(cents);
        
        return (
          <div
            key={i}
            style={{
              width: stripeWidth,
              background: color,
              opacity: Math.abs(cents) < 2 ? 1 : intensity,
              transition: 'opacity 0.05s ease',
            }}
          />
        );
      })}
    </div>
  );
};

export const TunerDisplay: React.FC<TunerDisplayProps> = ({
  data,
  showStrobe = false,
  variant = 'default',
  style,
  referenceA4 = 440,
}) => {
  const { frequencyHz, noteName, octave, centsDeviation, confidence } = data;
  
  const color = getInTuneColor(centsDeviation);
  const label = getTuningLabel(centsDeviation);
  const confidenceColor =
    confidence >= 0.75 ? SUPPORT_SUCCESS : confidence >= 0.45 ? SUPPORT_WARNING : SUPPORT_DANGER
  
  // Size configurations
  const sizes = {
    compact: { width: 160, height: 100, noteSize: 36, freqSize: 12 },
    default: { width: 280, height: 180, noteSize: 64, freqSize: 14 },
    large: { width: 400, height: 260, noteSize: 96, freqSize: 18 },
  };
  
  const size = sizes[variant];
  
  // Check if we have a valid signal
  const hasSignal = confidence > 0.3 && frequencyHz > 20;
  
  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        background: 'color-mix(in srgb, var(--surface-2) 96%, transparent)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: `0 4px 20px ${TEXT_PRIMARY_MIX}, inset 0 1px 0 ${TEXT_SECONDARY_MIX}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: variant === 'compact' ? '8px 12px' : '16px 20px',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Reference frequency display */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 12,
          fontSize: 10,
            color: TEXT_SECONDARY_MIX,
        }}
      >
        A4 = {referenceA4} Hz
      </div>
      
      {/* Needle display area */}
      {variant !== 'compact' && hasSignal && (
        <div style={{ position: 'relative', width: size.width - 40, height: size.height * 0.5 }}>
          <TunerNeedle
            cents={centsDeviation}
            width={size.width - 40}
            height={size.height * 0.5}
          />
        </div>
      )}
      
      {/* Note name display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: size.noteSize,
            fontWeight: 700,
            color: hasSignal ? color : TEXT_PRIMARY_MIX,
            textShadow: hasSignal ? `0 0 20px ${color}` : 'none',
            fontFamily: 'var(--font-ui)',
            transition: 'all 0.2s ease',
            letterSpacing: '-2px',
          }}
        >
          {hasSignal ? noteName : '--'}
        </span>
        <span
          style={{
            fontSize: size.noteSize * 0.4,
            fontWeight: 500,
            color: hasSignal ? 'var(--text-secondary)' : TEXT_PRIMARY_MIX,
          }}
        >
          {hasSignal ? octave : '-'}
        </span>
      </div>
      
      {/* Cents deviation bar (compact mode) */}
      {variant === 'compact' && hasSignal && (
        <div
          style={{
            width: '100%',
            height: 6,
            background: 'color-mix(in srgb, var(--text-secondary) 20%, transparent)',
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Center marker */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: 2,
              height: '100%',
              background: 'color-mix(in srgb, var(--support-success) 50%, transparent)',
              transform: 'translateX(-50%)',
            }}
          />
          {/* Indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${50 + (centsDeviation / 50) * 50}%`,
              top: 0,
              width: 8,
              height: '100%',
              background: color,
              borderRadius: 2,
              transform: 'translateX(-50%)',
              boxShadow: `0 0 8px ${color}`,
              transition: 'all 0.1s ease-out',
            }}
          />
        </div>
      )}
      
      {/* Strobe display */}
      {showStrobe && hasSignal && variant !== 'compact' && (
        <StrobeDisplay cents={centsDeviation} width={size.width - 40} />
      )}
      
      {/* Bottom info row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          alignItems: 'center',
        }}
      >
        {/* Frequency */}
        <span
          style={{
            fontSize: size.freqSize,
            fontFamily: 'var(--font-mono)',
            color: hasSignal ? 'color-mix(in srgb, var(--text-primary) 85%, transparent)' : TEXT_PRIMARY_MIX,
          }}
        >
          {hasSignal ? `${frequencyHz.toFixed(1)} Hz` : '-- Hz'}
        </span>
        
        {/* Tuning status */}
        <span
          style={{
            fontSize: size.freqSize - 2,
            color: hasSignal ? color : TEXT_PRIMARY_MIX,
            fontWeight: 600,
          }}
        >
          {hasSignal ? label : 'No Signal'}
        </span>
        
        {/* Cents display */}
        <span
          style={{
            fontSize: size.freqSize,
            fontFamily: 'var(--font-mono)',
            color: hasSignal ? color : TEXT_PRIMARY_MIX,
            minWidth: 50,
            textAlign: 'right',
          }}
        >
          {hasSignal 
            ? `${centsDeviation >= 0 ? '+' : ''}${centsDeviation.toFixed(0)}¢`
            : '--¢'
          }
        </span>
      </div>
      
      {/* Confidence indicator */}
      {variant !== 'compact' && (
        <div
          style={{
            width: '100%',
            height: 3,
            background: 'color-mix(in srgb, var(--text-secondary) 20%, transparent)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${confidence * 100}%`,
              height: '100%',
              background: confidenceColor,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default TunerDisplay;
