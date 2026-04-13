import { useEffect, useRef, useMemo } from 'react'

interface IRFrequencyGraphProps {
  data: Array<{ freq: number; magnitude: number }>
  height?: number
  width?: number
  smoothing?: number
  minDb?: number
  maxDb?: number
  accentColor?: string
  showGrid?: boolean
  showLabels?: boolean
  animated?: boolean
}

// FFT-style frequency graph inspired by GraphicalIRLoader
// Uses smoothed line rendering with logarithmic frequency scale
export function IRFrequencyGraph({
  data,
  height = 180,
  width,
  smoothing = 0.025,
  minDb = -48,
  maxDb = 6,
  accentColor = '#ffb84d',
  showGrid = true,
  showLabels = true,
  animated = true,
}: IRFrequencyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smoothedDataRef = useRef<number[]>([])
  const animationRef = useRef<number>(0)

  // Frequency bands for grid lines
  const freqBands = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  const dbLevels = [-48, -36, -24, -12, 0, 6]

  // Convert frequency to x position (logarithmic scale)
  const freqToX = (freq: number, canvasWidth: number) => {
    const minFreq = 20
    const maxFreq = 20000
    const logMin = Math.log10(minFreq)
    const logMax = Math.log10(maxFreq)
    const logFreq = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)))
    return ((logFreq - logMin) / (logMax - logMin)) * canvasWidth
  }

  // Convert dB to y position
  const dbToY = (db: number, canvasHeight: number) => {
    const normalized = (db - minDb) / (maxDb - minDb)
    return canvasHeight - (normalized * canvasHeight)
  }

  // Process and smooth data
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []

    // Sort by frequency and normalize
    const sorted = [...data].sort((a, b) => a.freq - b.freq)

    // Apply exponential smoothing to previous frame (for animation)
    if (smoothedDataRef.current.length !== sorted.length) {
      smoothedDataRef.current = sorted.map(d => d.magnitude)
    } else {
      sorted.forEach((d, i) => {
        smoothedDataRef.current[i] =
          smoothedDataRef.current[i] * (1 - smoothing) + d.magnitude * smoothing
      })
    }

    return sorted.map((d, i) => ({
      freq: d.freq,
      magnitude: animated ? smoothedDataRef.current[i] : d.magnitude
    }))
  }, [data, smoothing, animated])

  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let removeLoadListener: (() => void) | undefined

    const renderGraph = () => {
      if (typeof document !== 'undefined' && document.readyState !== 'complete') {
        return
      }

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const canvasWidth = rect.width
      const canvasHeight = rect.height

      // Set canvas resolution
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      ctx.scale(dpr, dpr)

      const draw = () => {
        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)

        // Draw background gradient
        const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
        bgGradient.addColorStop(0, 'rgba(20, 15, 10, 0.95)')
        bgGradient.addColorStop(1, 'rgba(10, 8, 5, 0.95)')
        ctx.fillStyle = bgGradient
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        // Draw grid
        if (showGrid) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
          ctx.lineWidth = 1

          // Vertical frequency lines
          freqBands.forEach(freq => {
            const x = freqToX(freq, canvasWidth)
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvasHeight)
            ctx.stroke()
          })

          // Horizontal dB lines
          dbLevels.forEach(db => {
            const y = dbToY(db, canvasHeight)
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(canvasWidth, y)
            ctx.stroke()
          })

          // 0 dB line highlighted
          ctx.strokeStyle = 'rgba(255, 184, 77, 0.3)'
          ctx.lineWidth = 1.5
          const zeroY = dbToY(0, canvasHeight)
          ctx.beginPath()
          ctx.moveTo(0, zeroY)
          ctx.lineTo(canvasWidth, zeroY)
          ctx.stroke()
        }

        // Draw labels
        if (showLabels) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
          ctx.font = '9px system-ui, sans-serif'
          ctx.textAlign = 'center'

          // Frequency labels
          freqBands.forEach(freq => {
            const x = freqToX(freq, canvasWidth)
            const label = freq >= 1000 ? `${freq / 1000}k` : String(freq)
            ctx.fillText(label, x, canvasHeight - 4)
          })

          // dB labels
          ctx.textAlign = 'left'
          dbLevels.forEach(db => {
            const y = dbToY(db, canvasHeight)
            ctx.fillText(`${db}`, 4, y - 2)
          })
        }

        // Draw frequency curve
        if (processedData.length > 0) {
          // Glow effect
          ctx.shadowColor = accentColor
          ctx.shadowBlur = 12
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 0

          // Create gradient for the line
          const lineGradient = ctx.createLinearGradient(0, 0, canvasWidth, 0)
          lineGradient.addColorStop(0, `${accentColor}60`)
          lineGradient.addColorStop(0.3, accentColor)
          lineGradient.addColorStop(0.7, accentColor)
          lineGradient.addColorStop(1, `${accentColor}60`)

          ctx.strokeStyle = lineGradient
          ctx.lineWidth = 2.5
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          ctx.beginPath()
          processedData.forEach((point, i) => {
            const x = freqToX(point.freq, canvasWidth)
            const y = dbToY(point.magnitude, canvasHeight)

            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              // Smooth curve using quadratic bezier
              const prev = processedData[i - 1]
              const prevX = freqToX(prev.freq, canvasWidth)
              const prevY = dbToY(prev.magnitude, canvasHeight)
              const cpX = (prevX + x) / 2
              ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2)
            }
          })

          // Connect to last point
          if (processedData.length > 1) {
            const last = processedData[processedData.length - 1]
            ctx.lineTo(freqToX(last.freq, canvasWidth), dbToY(last.magnitude, canvasHeight))
          }

          ctx.stroke()

          // Reset shadow for fill
          ctx.shadowBlur = 0

          // Fill area under curve
          const fillGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
          fillGradient.addColorStop(0, `${accentColor}40`)
          fillGradient.addColorStop(0.5, `${accentColor}15`)
          fillGradient.addColorStop(1, `${accentColor}00`)

          ctx.fillStyle = fillGradient
          ctx.lineTo(freqToX(processedData[processedData.length - 1].freq, canvasWidth), canvasHeight)
          ctx.lineTo(freqToX(processedData[0].freq, canvasWidth), canvasHeight)
          ctx.closePath()
          ctx.fill()
        }

        // Continue animation
        if (animated) {
          animationRef.current = requestAnimationFrame(draw)
        }
      }

      draw()
    }

    if (typeof document === 'undefined' || document.readyState === 'complete') {
      window.requestAnimationFrame(renderGraph)
    } else {
      const onLoad = () => window.requestAnimationFrame(renderGraph)
      window.addEventListener('load', onLoad, { once: true })
      removeLoadListener = () => window.removeEventListener('load', onLoad)
    }

    return () => {
      removeLoadListener?.()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [processedData, showGrid, showLabels, accentColor, minDb, maxDb, animated])

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(20, 15, 10, 0.95), rgba(10, 8, 5, 0.95))',
          borderRadius: 8,
          border: '1px solid rgba(255, 184, 77, 0.2)',
          color: '#666'
        }}
      >
        <span style={{ fontSize: 12 }}>Load an IR to view frequency response</span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255, 184, 77, 0.2)' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: width || '100%',
          height,
          display: 'block',
        }}
      />
      {/* Spectrum label */}
      <div style={{
        position: 'absolute',
        top: 6,
        right: 8,
        fontSize: 9,
        color: 'rgba(255, 184, 77, 0.6)',
        letterSpacing: 1,
        fontWeight: 600,
      }}>
        Frequency Response
      </div>
    </div>
  )
}
