/**
 * AudioMeter - Professional VU/Peak Meter Component
 * 
 * Features:
 * - Dual-mode display (VU/Peak)
 * - Peak hold with configurable decay
 * - RMS level display
 * - Clip indicator with latch
 * - Smooth CSS animations
 * - Responsive sizing
 * - Horizontal and vertical orientations
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

// Linear to dB conversion with floor
const linearToDb = (linear: number, floor: number = -60): number => {
  if (linear <= 0) return floor;
  const db = 20 * Math.log10(linear);
  return Math.max(floor, db);
};

// dB to percentage for display (0dB = 100%, -60dB = 0%)
const dbToPercent = (db: number, min: number = -60, max: number = 6): number => {
  return Math.max(0, Math.min(100, ((db - min) / (max - min)) * 100));
};

// Get color based on level in dB
const getLevelColor = (db: number): string => {
  if (db > 0) return '#ff3333';      // Red: clipping
  if (db > -3) return '#ff6600';     // Orange: hot
  if (db > -6) return '#ffcc00';     // Yellow: loud
  if (db > -12) return '#99ff33';    // Yellow-green: nominal
  if (db > -24) return '#22c55e';    // Green: normal
  return '#22c55e';                   // Green: quiet
};

// Generate gradient for meter background
const generateMeterGradient = (orientation: 'vertical' | 'horizontal'): string => {
  const colors = [
    { pos: 0, color: '#ff3333' },    // 0dB+
    { pos: 10, color: '#ff6600' },   // -6dB
    { pos: 20, color: '#ffcc00' },   // -12dB
    { pos: 35, color: '#99ff33' },   // -18dB
    { pos: 50, color: '#22c55e' },   // -30dB
    { pos: 100, color: '#22c55e' },  // -60dB
  ];

  const direction = orientation === 'vertical' ? 'to bottom' : 'to left';
  const stops = colors.map(c => `${c.color} ${c.pos}%`).join(', ');
  return `linear-gradient(${direction}, ${stops})`;
};

// CSS keyframes for clip indicator
const clipAnimationStyle = `
@keyframes clipFlash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;

export interface AudioMeterProps {
  /** Current peak level (0-1 linear scale) */
  peak: number;
  /** Current RMS level (0-1 linear scale) */
  rms?: number;
  /** Peak hold level (0-1 linear scale) */
  holdPeak?: number;
  /** Whether clipping is detected */
  isClipping?: boolean;
  /** Orientation of the meter */
  orientation?: 'vertical' | 'horizontal';
  /** Width in pixels (or height for vertical) */
  size?: number;
  /** Length in pixels */
  length?: number;
  /** Show scale markers */
  showScale?: boolean;
  /** Show numeric dB value */
  showValue?: boolean;
  /** Label text */
  label?: string;
  /** Callback when clip indicator is clicked (to clear) */
  onClearClip?: () => void;
  /** Custom style overrides */
  style?: React.CSSProperties;
  /** Show RMS bar behind peak */
  showRms?: boolean;
  /** Meter style variant */
  variant?: 'default' | 'compact' | 'mini';
}

const AudioMeterComponent: React.FC<AudioMeterProps> = ({
  peak,
  rms = 0,
  holdPeak,
  isClipping = false,
  orientation = 'vertical',
  size = 24,
  length = 200,
  showScale = true,
  showValue = true,
  label,
  onClearClip,
  style,
  showRms = true,
  variant = 'default',
}) => {
  const [displayPeak, setDisplayPeak] = useState(0);
  const [displayRms, setDisplayRms] = useState(0);
  const [displayHold, setDisplayHold] = useState(0);
  const [clipLatched, setClipLatched] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);

  // Smooth animation for meter movement
  useEffect(() => {
    const animate = () => {
      setDisplayPeak(prev => prev + (peak - prev) * 0.3);
      setDisplayRms(prev => prev + (rms - prev) * 0.2);
      if (holdPeak !== undefined) {
        setDisplayHold(prev => Math.max(prev * 0.995, holdPeak));
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [peak, rms, holdPeak]);

  // Latch clip indicator
  useEffect(() => {
    if (isClipping) setClipLatched(true);
  }, [isClipping]);

  const handleClipClick = useCallback(() => {
    setClipLatched(false);
    onClearClip?.();
  }, [onClearClip]);

  // Convert to dB
  const peakDb = linearToDb(displayPeak);
  const rmsDb = linearToDb(displayRms);
  const holdDb = linearToDb(displayHold);

  // Convert to percentages for display
  const peakPercent = dbToPercent(peakDb);
  const rmsPercent = dbToPercent(rmsDb);
  const holdPercent = dbToPercent(holdDb);

  const isVertical = orientation === 'vertical';
  const _meterWidth = isVertical ? size : length;
  const _meterHeight = isVertical ? length : size;

  // Scale markers (dB values)
  const scaleMarks = [0, -6, -12, -18, -24, -36, -48, -60];

  // Compact variants adjust sizing
  const effectiveSize = variant === 'mini' ? 8 : variant === 'compact' ? 16 : size;
  const effectiveLength = variant === 'mini' ? 100 : variant === 'compact' ? 150 : length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <style>{clipAnimationStyle}</style>

      {/* Label */}
      {label && (
        <span
          style={{
            fontSize: variant === 'mini' ? 8 : 10,
            color: 'rgba(255, 255, 255, 0.6)',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </span>
      )}

      {/* Meter Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'row' : 'column',
          alignItems: 'stretch',
          gap: 2,
        }}
      >
        {/* Scale markers */}
        {showScale && variant !== 'mini' && (
          <div
            style={{
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'row',
              justifyContent: 'space-between',
              width: isVertical ? 20 : effectiveLength,
              height: isVertical ? effectiveLength : 12,
              fontSize: 8,
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            {scaleMarks.filter((_, i) => i % 2 === 0).map((mark) => (
              <span
                key={mark}
                style={{
                  position: 'relative',
                  transform: isVertical ? 'translateY(-50%)' : 'translateX(-50%)',
                }}
              >
                {mark}
              </span>
            ))}
          </div>
        )}

        {/* Main Meter Bar */}
        <div
          style={{
            position: 'relative',
            width: isVertical ? effectiveSize : effectiveLength,
            height: isVertical ? effectiveLength : effectiveSize,
            background: 'rgba(0, 0, 0, 0.6)',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Gradient background track */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: generateMeterGradient(orientation),
              opacity: 0.15,
            }}
          />

          {/* RMS level bar (behind peak) */}
          {showRms && (
            <div
              style={{
                position: 'absolute',
                [isVertical ? 'bottom' : 'left']: 0,
                [isVertical ? 'left' : 'top']: 0,
                [isVertical ? 'width' : 'height']: '100%',
                [isVertical ? 'height' : 'width']: `${rmsPercent}%`,
                background: 'rgba(34, 197, 94, 0.3)',
                transition: 'all 0.05s ease-out',
              }}
            />
          )}

          {/* Peak level bar */}
          <div
            style={{
              position: 'absolute',
              [isVertical ? 'bottom' : 'left']: 0,
              [isVertical ? 'left' : 'top']: '20%',
              [isVertical ? 'width' : 'height']: '60%',
              [isVertical ? 'height' : 'width']: `${peakPercent}%`,
              background: generateMeterGradient(orientation),
              boxShadow: `0 0 10px ${getLevelColor(peakDb)}`,
              transition: 'all 0.03s ease-out',
              borderRadius: isVertical ? '2px 2px 0 0' : '0 2px 2px 0',
            }}
          />

          {/* Peak hold indicator */}
          {holdPeak !== undefined && holdPercent > 0 && (
            <div
              style={{
                position: 'absolute',
                [isVertical ? 'bottom' : 'left']: `calc(${holdPercent}% - 2px)`,
                [isVertical ? 'left' : 'top']: 0,
                [isVertical ? 'width' : 'height']: '100%',
                [isVertical ? 'height' : 'width']: 3,
                background: getLevelColor(holdDb),
                boxShadow: `0 0 6px ${getLevelColor(holdDb)}`,
                transition: 'all 0.05s ease-out',
              }}
            />
          )}

          {/* Tick marks */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'row',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            {[0, 25, 50, 75, 100].map((pos) => (
              <div
                key={pos}
                style={{
                  [isVertical ? 'width' : 'height']: '30%',
                  [isVertical ? 'height' : 'width']: 1,
                  background: 'rgba(255, 255, 255, 0.2)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Clip Indicator */}
        <div
          onClick={handleClipClick}
          style={{
            width: isVertical ? effectiveSize : 16,
            height: isVertical ? 12 : effectiveSize,
            background: clipLatched 
              ? 'linear-gradient(135deg, #ff3333, #cc0000)' 
              : 'rgba(60, 60, 60, 0.8)',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: clipLatched ? 'pointer' : 'default',
            animation: clipLatched ? 'clipFlash 0.5s ease-in-out infinite' : 'none',
            boxShadow: clipLatched ? '0 0 10px #ff3333' : 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            transition: 'all 0.2s ease',
          }}
          title={clipLatched ? 'Click to clear clip' : 'No clipping'}
        >
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              color: clipLatched ? '#fff' : 'rgba(255, 255, 255, 0.3)',
            }}
          >
            CLIP
          </span>
        </div>
      </div>

      {/* Numeric Value Display */}
      {showValue && variant !== 'mini' && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: variant === 'compact' ? 10 : 12,
            fontWeight: 600,
            color: getLevelColor(peakDb),
            textShadow: `0 0 6px ${getLevelColor(peakDb)}`,
            minWidth: 45,
            textAlign: 'center',
          }}
        >
          {peakDb > -60 ? `${peakDb.toFixed(1)} dB` : '-∞ dB'}
        </div>
      )}
    </div>
  );
};

export const AudioMeter = React.memo(AudioMeterComponent);

/**
 * StereoMeter - Stereo pair of meters with labels
 */
export interface StereoMeterProps {
  leftPeak: number;
  rightPeak: number;
  leftRms?: number;
  rightRms?: number;
  leftHoldPeak?: number;
  rightHoldPeak?: number;
  leftClipping?: boolean;
  rightClipping?: boolean;
  orientation?: 'vertical' | 'horizontal';
  size?: number;
  length?: number;
  showLabels?: boolean;
  onClearClip?: () => void;
  style?: React.CSSProperties;
  variant?: 'default' | 'compact' | 'mini';
}

const StereoMeterComponent: React.FC<StereoMeterProps> = ({
  leftPeak,
  rightPeak,
  leftRms,
  rightRms,
  leftHoldPeak,
  rightHoldPeak,
  leftClipping = false,
  rightClipping = false,
  orientation = 'vertical',
  size = 20,
  length = 180,
  showLabels = true,
  onClearClip,
  style,
  variant = 'default',
}) => {
  const isVertical = orientation === 'vertical';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        gap: variant === 'mini' ? 2 : 4,
        alignItems: 'center',
        ...style,
      }}
    >
      <AudioMeter
        peak={leftPeak}
        rms={leftRms}
        holdPeak={leftHoldPeak}
        isClipping={leftClipping}
        orientation={orientation}
        size={size}
        length={length}
        showScale={false}
        showValue={false}
        label={showLabels ? 'L' : undefined}
        onClearClip={onClearClip}
        variant={variant}
      />
      <AudioMeter
        peak={rightPeak}
        rms={rightRms}
        holdPeak={rightHoldPeak}
        isClipping={rightClipping}
        orientation={orientation}
        size={size}
        length={length}
        showScale={true}
        showValue={true}
        label={showLabels ? 'R' : undefined}
        onClearClip={onClearClip}
        variant={variant}
      />
    </div>
  );
};

export const StereoMeter = React.memo(StereoMeterComponent);

/**
 * GainReductionMeter - Specialized meter for compressor gain reduction
 */
export interface GainReductionMeterProps {
  /** Current gain reduction in dB (positive = more reduction) */
  gainReduction: number;
  /** Maximum GR to display */
  maxReduction?: number;
  /** Orientation */
  orientation?: 'vertical' | 'horizontal';
  /** Size in pixels */
  size?: number;
  /** Length in pixels */
  length?: number;
  /** Show numeric value */
  showValue?: boolean;
  style?: React.CSSProperties;
}

const GainReductionMeterComponent: React.FC<GainReductionMeterProps> = ({
  gainReduction,
  maxReduction = 24,
  orientation = 'vertical',
  size = 16,
  length = 150,
  showValue = true,
  style,
}) => {
  const grPercent = Math.min(100, (Math.abs(gainReduction) / maxReduction) * 100);
  const isVertical = orientation === 'vertical';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 8,
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        GR
      </span>

      <div
        style={{
          position: 'relative',
          width: isVertical ? size : length,
          height: isVertical ? length : size,
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* GR bar (grows from top/right) */}
        <div
          style={{
            position: 'absolute',
            [isVertical ? 'top' : 'right']: 0,
            [isVertical ? 'left' : 'top']: 0,
            [isVertical ? 'width' : 'height']: '100%',
            [isVertical ? 'height' : 'width']: `${grPercent}%`,
            background: 'linear-gradient(180deg, #f59e0b, #d97706)',
            boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
            transition: 'all 0.05s ease-out',
          }}
        />
      </div>

      {showValue && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: gainReduction > 6 ? '#f59e0b' : 'rgba(255, 255, 255, 0.6)',
            minWidth: 35,
            textAlign: 'center',
          }}
        >
          {gainReduction > 0 ? `-${gainReduction.toFixed(1)}` : '0.0'}
        </span>
      )}
    </div>
  );
};

export const GainReductionMeter = React.memo(GainReductionMeterComponent);

export default AudioMeter;
