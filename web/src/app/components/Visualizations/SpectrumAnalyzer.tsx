/**
 * SpectrumAnalyzer - Real-time FFT Spectrum Visualization
 *
 * Canvas-based spectrum analyzer with multiple display modes:
 * - Bars: Traditional VU-style bars
 * - Line: Smooth line graph
 * - Fill: Filled area graph
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useSpectrum } from '../../hooks/useSpectrum';

interface SpectrumAnalyzerProps {
  /** Display mode */
  mode?: 'bars' | 'line' | 'fill';
  /** Height in pixels */
  height?: number;
  /** Number of bars (for bar mode) */
  barCount?: number;
  /** Show frequency labels */
  showLabels?: boolean;
  /** Show peak indicators */
  showPeaks?: boolean;
  /** Gradient colors [low, mid, high] */
  colors?: [string, string, string];
  /** Custom class name */
  className?: string;
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null;
}

// Frequency labels to display
const FREQ_LABELS = [20, 50, 100, 200, 500, '1k', '2k', '5k', '10k', '20k'];
const FREQ_VALUES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  mode = 'bars',
  height = 150,
  barCount = 64,
  showLabels = true,
  showPeaks = true,
  colors = ['#22c55e', '#eab308', '#ef4444'],
  className = '',
  nodeId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<number[]>(new Array(barCount).fill(0));
  const peakDecayRef = useRef<number[]>(new Array(barCount).fill(0));
  const animationRef = useRef<number | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 0, height });

  const { spectrum, isConnected } = useSpectrum({ nodeId });

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [height]);

  // Convert frequency to x position (logarithmic scale)
  const freqToX = useCallback((freq: number, width: number): number => {
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    const freqLog = Math.log10(Math.max(20, Math.min(20000, freq)));
    return ((freqLog - minLog) / (maxLog - minLog)) * width;
  }, []);

  // Get magnitude at specific frequency from spectrum data
  const getMagnitudeAtFreq = useCallback((freq: number): number => {
    // Return silence (-100 dB) if no data available
    if (!spectrum.magnitudes.length || !spectrum.frequencies.length) return -100;

    // Find closest frequency bin
    let closestIdx = 0;
    let minDiff = Math.abs(spectrum.frequencies[0] - freq);

    for (let i = 1; i < spectrum.frequencies.length; i++) {
      const diff = Math.abs(spectrum.frequencies[i] - freq);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    // Return the magnitude, defaulting to silence if undefined/null/0
    // Backend should return negative dBFS values (-60 for quiet, 0 for full scale)
    const mag = spectrum.magnitudes[closestIdx];
    if (mag === undefined || mag === null || mag === 0) return -100;
    return mag;
  }, [spectrum]);

  // Draw the spectrum
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width } = dimensions;
    const drawHeight = height - (showLabels ? 20 : 0);

    // Set canvas size (for retina displays)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    // Horizontal grid lines (dB)
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * drawHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical grid lines (frequency)
    FREQ_VALUES.forEach(freq => {
      const x = freqToX(freq, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawHeight);
      ctx.stroke();
    });

    // Create gradient
    const gradient = ctx.createLinearGradient(0, drawHeight, 0, 0);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.5, colors[1]);
    gradient.addColorStop(1, colors[2]);

    if (mode === 'bars') {
      // Bar mode
      const barWidth = (width / barCount) * 0.8;
      const barGap = (width / barCount) * 0.2;

      for (let i = 0; i < barCount; i++) {
        // Calculate frequency for this bar (logarithmic)
        const freqMin = 20 * Math.pow(1000, i / barCount);
        const freqMax = 20 * Math.pow(1000, (i + 1) / barCount);
        const freqCenter = Math.sqrt(freqMin * freqMax);

        // Get magnitude
        let magnitude = getMagnitudeAtFreq(freqCenter);

        // Normalize to 0-1 range (assuming -60 to 0 dB input)
        magnitude = Math.max(0, Math.min(1, (magnitude + 60) / 60));

        const barHeight = magnitude * drawHeight;
        const x = i * (barWidth + barGap) + barGap / 2;
        const y = drawHeight - barHeight;

        // Draw bar
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);

        // Update and draw peaks
        if (showPeaks) {
          if (magnitude > peaksRef.current[i]) {
            peaksRef.current[i] = magnitude;
            peakDecayRef.current[i] = 0;
          } else {
            peakDecayRef.current[i]++;
            if (peakDecayRef.current[i] > 30) { // Hold for 30 frames
              peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 0.02);
            }
          }

          const peakY = drawHeight - peaksRef.current[i] * drawHeight;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      }
    } else if (mode === 'line' || mode === 'fill') {
      // Line/Fill mode
      ctx.beginPath();
      ctx.moveTo(0, drawHeight);

      const points: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < spectrum.frequencies.length; i++) {
        const freq = spectrum.frequencies[i];
        if (freq < 20 || freq > 20000) continue;

        const x = freqToX(freq, width);
        // Treat 0/undefined/null as silence (-100 dB)
        let magnitude = spectrum.magnitudes[i];
        if (magnitude === undefined || magnitude === null || magnitude === 0) {
          magnitude = -100;
        }
        magnitude = Math.max(0, Math.min(1, (magnitude + 60) / 60));
        const y = drawHeight - magnitude * drawHeight;

        points.push({ x, y });
      }

      // Draw curve
      if (points.length > 0) {
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
          // Smooth curve using quadratic bezier
          const prev = points[i - 1];
          const curr = points[i];
          const midX = (prev.x + curr.x) / 2;
          const midY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }

        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      }

      if (mode === 'fill') {
        ctx.lineTo(width, drawHeight);
        ctx.closePath();

        // Create fill gradient
        const fillGradient = ctx.createLinearGradient(0, drawHeight, 0, 0);
        fillGradient.addColorStop(0, `${colors[0]}33`);
        fillGradient.addColorStop(0.5, `${colors[1]}33`);
        fillGradient.addColorStop(1, `${colors[2]}33`);

        ctx.fillStyle = fillGradient;
        ctx.fill();
      }

      // Draw line
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw frequency labels
    if (showLabels) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';

      FREQ_VALUES.forEach((freq, i) => {
        const x = freqToX(freq, width);
        const label = FREQ_LABELS[i];
        ctx.fillText(String(label), x, height - 5);
      });
    }

    // Request next frame
    animationRef.current = requestAnimationFrame(draw);
  }, [dimensions, height, mode, barCount, showLabels, showPeaks, colors, spectrum, freqToX, getMagnitudeAtFreq]);

  // Start animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div className={`${className} space-y-2`}>
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-300">Spectrum Analyzer</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-zinc-500'}`} />
            <span className="text-xs text-zinc-500">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="relative" style={{ height }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ width: '100%', height }}
          />

          {/* Peak frequency indicator */}
          {spectrum.peakFrequency > 0 && (
            <div className="absolute top-2 right-2 bg-zinc-900/80 rounded px-2 py-1">
              <span className="text-xs text-zinc-400">Peak: </span>
              <span className="text-xs font-mono text-white">
                {spectrum.peakFrequency >= 1000
                  ? `${(spectrum.peakFrequency / 1000).toFixed(1)}kHz`
                  : `${Math.round(spectrum.peakFrequency)}Hz`
                }
              </span>
              <span className="text-xs text-zinc-500 ml-1">
                ({spectrum.peakMagnitude.toFixed(1)}dB)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Spectral info */}
      <div className="flex justify-between text-xs px-1 text-zinc-500">
        <span>20Hz</span>
        <span>Spectral Centroid: {
          spectrum.spectralCentroid >= 1000
            ? `${(spectrum.spectralCentroid / 1000).toFixed(1)}kHz`
            : `${Math.round(spectrum.spectralCentroid)}Hz`
        }</span>
        <span>20kHz</span>
      </div>
    </div>
  );
};

export default SpectrumAnalyzer;
