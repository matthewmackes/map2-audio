import { useEffect, useRef, useState } from 'react'

interface FlickeringGridProps {
  squareSize?: number
  gridGap?: number
  flickerChance?: number
  color?: string
  width?: number
  height?: number
  className?: string
  maxOpacity?: number
}

export function FlickeringGrid({
  squareSize = 4,
  gridGap = 6,
  flickerChance = 0.3,
  color,
  width,
  height,
  className,
  maxOpacity = 0.3,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isInView, setIsInView] = useState(false)
  const [resolvedGridColor, setResolvedGridColor] = useState(color ?? '#3b82f6')

  // Resolve theme color only after full page load to avoid forced layout
  // warnings while stylesheets are still loading.
  useEffect(() => {
    if (color) {
      setResolvedGridColor(color)
      return
    }
    if (typeof window === 'undefined') return

    const resolveThemeColor = () => {
      const cssColor = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim()
      if (cssColor) setResolvedGridColor(cssColor)
    }

    if (document.readyState === 'complete') {
      window.requestAnimationFrame(resolveThemeColor)
      return
    }

    const onLoad = () => window.requestAnimationFrame(resolveThemeColor)
    window.addEventListener('load', onLoad, { once: true })
    return () => window.removeEventListener('load', onLoad)
  }, [color])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set up IntersectionObserver to pause when off-screen
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting)
      },
      { threshold: 0 }
    )

    observer.observe(canvas)

    // Set canvas size
    const container = canvas.parentElement
    const w = width || container?.clientWidth || window.innerWidth
    const h = height || container?.clientHeight || window.innerHeight

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    // Calculate grid
    const cols = Math.ceil(w / (squareSize + gridGap))
    const rows = Math.ceil(h / (squareSize + gridGap))
    const squares: { x: number; y: number; opacity: number; targetOpacity: number }[] = []

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        squares.push({
          x: i * (squareSize + gridGap),
          y: j * (squareSize + gridGap),
          opacity: 0,
          targetOpacity: 0,
        })
      }
    }

    let animationFrame: number

    function animate() {
      if (!ctx || !isInView) {
        animationFrame = requestAnimationFrame(animate)
        return
      }

      ctx.clearRect(0, 0, w, h)

      squares.forEach(square => {
        // Randomly decide to flicker
        if (Math.random() < flickerChance) {
          square.targetOpacity = Math.random() * maxOpacity
        }

        // Smooth transition to target opacity
        square.opacity += (square.targetOpacity - square.opacity) * 0.1

        if (square.opacity > 0.01) {
          ctx.fillStyle = resolvedGridColor
          ctx.globalAlpha = square.opacity
          ctx.fillRect(square.x, square.y, squareSize, squareSize)
        }

        // Decay
        square.targetOpacity *= 0.97
      })

      ctx.globalAlpha = 1
      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(animationFrame)
    }
  }, [squareSize, gridGap, flickerChance, resolvedGridColor, width, height, maxOpacity, isInView])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: width || '100%',
        height: height || '100%',
      }}
    />
  )
}
