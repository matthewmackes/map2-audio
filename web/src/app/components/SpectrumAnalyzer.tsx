/**
 * SpectrumAnalyzer - Real-time FFT Spectrum Visualization
 * 
 * Features:
 * - Canvas-based high-performance rendering
 * - Multiple visualization modes (bars, line, filled)
 * - Logarithmic and linear frequency scales
 * - Peak hold with decay
 * - Frequency range selection
 * - Gradient coloring
 * - Responsive sizing
 */

import React, { useEffect, useRef, useCallback } from 'react';

// Color gradient for spectrum display
const SPECTRUM_GRADIENT = [
  { pos: 0, color: '#22c55e' },     // Green (low freq)
  { pos: 0.25, color: '#84cc16' },  // Light green
  { pos: 0.5, color: '#eab308' },   // Yellow (mid)
  { pos: 0.75, color: '#f97316' },  // Orange
  { pos: 1, color: '#ef4444' },     // Red (high freq)
];

// Create canvas gradient
const createGradient = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  vertical: boolean = true
): CanvasGradient => {
  const gradient = vertical
    ? ctx.createLinearGradient(x, y + height, x, y)
    : ctx.createLinearGradient(x, y, x + width, y);
  
  SPECTRUM_GRADIENT.forEach(({ pos, color }) => {
    gradient.addColorStop(pos, color);
  });
  
  return gradient;
};

// Convert linear magnitude to dB
const toDb = (magnitude: number, floor: number = -90): number => {
  if (magnitude <= 0) return floor;
  const db = 20 * Math.log10(magnitude);
  return Math.max(floor, db);
};

// Normalize dB to 0-1 range
const normalizeDb = (db: number, min: number = -90, max: number = 0): number => {
  return Math.max(0, Math.min(1, (db - min) / (max - min)));
};

// Frequency to pixel position (logarithmic scale)
const freqToX = (
  freq: number,
  minFreq: number,
  maxFreq: number,
  width: number,
  logScale: boolean
): number => {
  if (logScale) {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logFreq = Math.log10(Math.max(minFreq, freq));
    return ((logFreq - logMin) / (logMax - logMin)) * width;
  }
  return ((freq - minFreq) / (maxFreq - minFreq)) * width;
};

export type VisualizationMode = 'bars' | 'line' | 'filled' | 'mirrored';

export interface SpectrumData {
  frequencies: number[];
  magnitudes: number[];
  binCount: number;
  sampleRate: number;
}

export interface SpectrumAnalyzerProps {
  /** Spectrum data to visualize */
  data: SpectrumData;
  /** Width of the analyzer */
  width?: number;
  /** Height of the analyzer */
  height?: number;
  /** Minimum frequency to display */
  minFreq?: number;
  /** Maximum frequency to display */
  maxFreq?: number;
  /** Use logarithmic frequency scale */
  logScale?: boolean;
  /** Visualization mode */
  mode?: VisualizationMode;
  /** Show frequency grid */
  showGrid?: boolean;
  /** Show peak hold indicators */
  showPeakHold?: boolean;
  /** Peak hold decay time in ms */
  peakHoldDecay?: number;
  /** dB floor */
  dbFloor?: number;
  /** dB ceiling */
  dbCeiling?: number;
  /** Bar gap (for bars mode) */
  barGap?: number;
  /** Background color */
  backgroundColor?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Show frequency labels */
  showLabels?: boolean;
  /** Smoothing factor (0-1) */
  smoothing?: number;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  data,
  width = 400,
  height = 200,
  minFreq = 20,
  maxFreq = 20000,
  logScale = true,
  mode = 'bars',
  showGrid = true,
  showPeakHold = true,
  peakHoldDecay = 500,
  dbFloor = -90,
  dbCeiling = 0,
  barGap = 1,
  backgroundColor = 'rgba(10, 10, 15, 0.9)',
  style,
  showLabels = true,
  smoothing = 0.8,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const smoothedDataRef = useRef<number[]>([]);
  const peakHoldRef = useRef<{ values: number[]; timestamps: number[] }>({
    values: [],
    timestamps: [],
  });

  // Grid frequencies for logarithmic display
  const gridFrequencies = [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    .filter(f => f >= minFreq && f <= maxFreq);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { frequencies: _frequencies, magnitudes, binCount, sampleRate } = data;
    
    // Calculate display area
    const labelHeight = showLabels ? 20 : 0;
    const displayHeight = height - labelHeight;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;

      // Frequency grid lines
      gridFrequencies.forEach(freq => {
        const x = freqToX(freq, minFreq, maxFreq, width, logScale);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, displayHeight);
        ctx.stroke();
      });

      // dB grid lines
      const dbSteps = [-6, -12, -24, -48, -72];
      dbSteps.forEach(db => {
        const y = displayHeight * (1 - normalizeDb(db, dbFloor, dbCeiling));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });
    }

    // Calculate bin frequencies and interpolate to display
    if (!magnitudes || magnitudes.length === 0) {
      animationRef.current = requestAnimationFrame(draw);
      return;
    }

    const binWidth = sampleRate / (binCount * 2);
    
    // Initialize smoothed data if needed
    if (smoothedDataRef.current.length !== magnitudes.length) {
      smoothedDataRef.current = [...magnitudes];
    }

    // Initialize peak hold if needed
    if (peakHoldRef.current.values.length !== magnitudes.length) {
      peakHoldRef.current = {
        values: [...magnitudes],
        timestamps: new Array(magnitudes.length).fill(Date.now()),
      };
    }

    // Apply smoothing
    const now = Date.now();
    for (let i = 0; i < magnitudes.length; i++) {
      smoothedDataRef.current[i] = 
        smoothedDataRef.current[i] * smoothing + magnitudes[i] * (1 - smoothing);
      
      // Update peak hold
      if (magnitudes[i] > peakHoldRef.current.values[i]) {
        peakHoldRef.current.values[i] = magnitudes[i];
        peakHoldRef.current.timestamps[i] = now;
      } else if (now - peakHoldRef.current.timestamps[i] > peakHoldDecay) {
        // Decay peak
        peakHoldRef.current.values[i] *= 0.95;
      }
    }

    // Create gradient for bars
    const gradient = createGradient(ctx, 0, 0, width, displayHeight);

    if (mode === 'bars') {
      // Bar mode
      const numBars = Math.min(128, width / 4);
      const barWidth = (width - (numBars - 1) * barGap) / numBars;

      for (let i = 0; i < numBars; i++) {
        // Calculate frequency range for this bar
        let freq: number;
        if (logScale) {
          const logMin = Math.log10(minFreq);
          const logMax = Math.log10(maxFreq);
          const logFreq = logMin + (i / numBars) * (logMax - logMin);
          freq = Math.pow(10, logFreq);
        } else {
          freq = minFreq + (i / numBars) * (maxFreq - minFreq);
        }

        // Find corresponding bin
        const binIndex = Math.round(freq / binWidth);
        const value = binIndex < smoothedDataRef.current.length 
          ? smoothedDataRef.current[binIndex] 
          : 0;
        
        const db = toDb(value, dbFloor);
        const normalizedValue = normalizeDb(db, dbFloor, dbCeiling);
        const barHeight = normalizedValue * displayHeight;

        const x = i * (barWidth + barGap);

        // Draw bar
        ctx.fillStyle = gradient;
        ctx.fillRect(x, displayHeight - barHeight, barWidth, barHeight);

        // Draw peak hold
        if (showPeakHold && binIndex < peakHoldRef.current.values.length) {
          const peakValue = peakHoldRef.current.values[binIndex];
          const peakDb = toDb(peakValue, dbFloor);
          const peakNormalized = normalizeDb(peakDb, dbFloor, dbCeiling);
          const peakY = displayHeight * (1 - peakNormalized);
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(x, peakY - 1, barWidth, 2);
        }
      }
    } else if (mode === 'line' || mode === 'filled') {
      // Line/Filled mode
      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;

      let firstPoint = true;
      
      for (let i = 0; i < smoothedDataRef.current.length; i++) {
        const freq = i * binWidth;
        if (freq < minFreq || freq > maxFreq) continue;

        const x = freqToX(freq, minFreq, maxFreq, width, logScale);
        const db = toDb(smoothedDataRef.current[i], dbFloor);
        const normalizedValue = normalizeDb(db, dbFloor, dbCeiling);
        const y = displayHeight * (1 - normalizedValue);

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }

      if (mode === 'filled') {
        ctx.lineTo(width, displayHeight);
        ctx.lineTo(0, displayHeight);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      
      ctx.stroke();
    } else if (mode === 'mirrored') {
      // Mirrored mode (like audio visualization)
      const centerY = displayHeight / 2;
      
      ctx.beginPath();
      
      for (let i = 0; i < smoothedDataRef.current.length; i++) {
        const freq = i * binWidth;
        if (freq < minFreq || freq > maxFreq) continue;

        const x = freqToX(freq, minFreq, maxFreq, width, logScale);
        const db = toDb(smoothedDataRef.current[i], dbFloor);
        const normalizedValue = normalizeDb(db, dbFloor, dbCeiling);
        const halfHeight = (normalizedValue * displayHeight) / 2;

        ctx.fillStyle = gradient;
        ctx.fillRect(x, centerY - halfHeight, 2, halfHeight * 2);
      }
    }

    // Draw frequency labels
    if (showLabels) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';

      gridFrequencies.forEach(freq => {
        const x = freqToX(freq, minFreq, maxFreq, width, logScale);
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        ctx.fillText(label, x, height - 5);
      });
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [data, width, height, minFreq, maxFreq, logScale, mode, showGrid, showPeakHold, 
      peakHoldDecay, dbFloor, dbCeiling, barGap, backgroundColor, showLabels, smoothing, gridFrequencies]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  );
};

/**
 * MiniSpectrum - Compact spectrum for inline display
 */
export interface MiniSpectrumProps {
  data: SpectrumData;
  width?: number;
  height?: number;
  color?: string;
  style?: React.CSSProperties;
}

export const MiniSpectrum: React.FC<MiniSpectrumProps> = ({
  data,
  width = 100,
  height = 30,
  color = '#22c55e',
  style,
}) => {
  return (
    <SpectrumAnalyzer
      data={data}
      width={width}
      height={height}
      mode="filled"
      showGrid={false}
      showLabels={false}
      showPeakHold={false}
      backgroundColor="transparent"
      style={style}
    />
  );
};

export default SpectrumAnalyzer;
