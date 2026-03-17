/**
 * HeroDotGrid
 *
 * Canvas-based background for the home hero.
 * - Draws a uniform grid of small dots in Carbon Blue-60 (#0f62fe)
 * - Dots pulse (brightness flicker) on randomised independent timers
 * - Flair particles spawn at random dots, travel along grid lines
 *   (horizontal or vertical), and fade out with a soft glow trail
 *
 * Fully CSS-positioned to fill its parent; pointer-events: none.
 */

import { useEffect, useRef } from 'react'

// ── Tunables ──────────────────────────────────────────────────────────────────

const GRID_SPACING   = 28       // px between dots
const DOT_RADIUS     = 1.5      // base dot radius
const DOT_COLOR      = '15, 98, 254'   // Blue-60 rgb channels
const DOT_BASE_ALPHA = 0.22     // resting dot opacity
const DOT_PULSE_PEAK = 0.72     // peak opacity during pulse

const FLAIR_SPEED_MIN    = 80   // px/s
const FLAIR_SPEED_MAX    = 220
const FLAIR_LENGTH       = 48   // px — length of the glow trail
const FLAIR_WIDTH        = 2    // stroke width of the flair
const FLAIR_ALPHA        = 0.65 // peak alpha of flair head
const FLAIR_SPAWN_RATE   = 0.006 // probability per dot per frame of spawning

const PULSE_DURATION_MIN = 600  // ms
const PULSE_DURATION_MAX = 1800

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dot {
  cx: number
  cy: number
  // pulse state
  pulsePhase: number    // 0–1, driven by elapsed / pulseDuration
  pulseDuration: number // ms for one in-out cycle
  pulseStart: number    // timestamp when current pulse began
  pulsing: boolean
  nextPulse: number     // timestamp to start next pulse
}

type FlairDir = 'right' | 'left' | 'down' | 'up'

interface Flair {
  x: number
  y: number
  dir: FlairDir
  speed: number
  alpha: number
  // track the grid axis it is travelling along
  axisCoord: number // the fixed coordinate (y for horizontal, x for vertical)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HeroDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId: number
    let dots: Dot[] = []
    let flairs: Flair[] = []
    let lastTime = performance.now()
    let cols = 0
    let rows = 0

    // ── Build dot grid ───────────────────────────────────────────────────────
    function buildGrid() {
      const w = canvas!.width
      const h = canvas!.height
      // start half a cell in so dots are centred in their cells
      const xOffset = (w % GRID_SPACING) / 2
      const yOffset = (h % GRID_SPACING) / 2

      cols = Math.ceil(w / GRID_SPACING) + 1
      rows = Math.ceil(h / GRID_SPACING) + 1
      const now = performance.now()

      dots = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.push({
            cx: xOffset + c * GRID_SPACING,
            cy: yOffset + r * GRID_SPACING,
            pulsePhase: 0,
            pulseDuration: rand(PULSE_DURATION_MIN, PULSE_DURATION_MAX),
            pulseStart: 0,
            pulsing: false,
            nextPulse: now + rand(0, 4000),
          })
        }
      }
    }

    // ── Resize handler ───────────────────────────────────────────────────────
    function resize() {
      const parent = canvas!.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const w = parent.offsetWidth
      const h = parent.offsetHeight
      canvas!.width  = w * dpr
      canvas!.height = h * dpr
      canvas!.style.width  = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.scale(dpr, dpr)
      buildGrid()
      flairs = [] // clear flairs on resize — they hold stale coords
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)
    resize()

    // ── Spawn a flair from a given dot ───────────────────────────────────────
    function spawnFlair(dot: Dot) {
      const dirs: FlairDir[] = ['right', 'left', 'down', 'up']
      const dir = dirs[randInt(0, 3)]
      flairs.push({
        x: dot.cx,
        y: dot.cy,
        dir,
        speed: rand(FLAIR_SPEED_MIN, FLAIR_SPEED_MAX),
        alpha: FLAIR_ALPHA,
        axisCoord: dir === 'right' || dir === 'left' ? dot.cy : dot.cx,
      })
    }

    // ── Draw a single flair ──────────────────────────────────────────────────
    function drawFlair(f: Flair) {
      const tailX = f.dir === 'right' ? f.x - FLAIR_LENGTH
                  : f.dir === 'left'  ? f.x + FLAIR_LENGTH
                  : f.x
      const tailY = f.dir === 'down'  ? f.y - FLAIR_LENGTH
                  : f.dir === 'up'    ? f.y + FLAIR_LENGTH
                  : f.y

      const grad = ctx!.createLinearGradient(tailX, tailY, f.x, f.y)
      grad.addColorStop(0, `rgba(${DOT_COLOR}, 0)`)
      grad.addColorStop(0.6, `rgba(${DOT_COLOR}, ${f.alpha * 0.4})`)
      grad.addColorStop(1, `rgba(${DOT_COLOR}, ${f.alpha})`)

      ctx!.save()
      ctx!.strokeStyle = grad
      ctx!.lineWidth = FLAIR_WIDTH
      ctx!.shadowColor = `rgba(${DOT_COLOR}, ${f.alpha * 0.9})`
      ctx!.shadowBlur = 6
      ctx!.beginPath()
      ctx!.moveTo(tailX, tailY)
      ctx!.lineTo(f.x, f.y)
      ctx!.stroke()
      ctx!.restore()
    }

    // ── Main loop ────────────────────────────────────────────────────────────
    function frame(now: number) {
      const dt = Math.min(now - lastTime, 64) // cap at ~1 frame skip
      lastTime = now
      const dtSec = dt / 1000
      const dpr = window.devicePixelRatio || 1
      const w = canvas!.width / dpr
      const h = canvas!.height / dpr

      ctx!.clearRect(0, 0, w, h)

      // ── Update + draw dots ───────────────────────────────────────────────
      for (const dot of dots) {
        // Start a new pulse?
        if (!dot.pulsing && now >= dot.nextPulse) {
          dot.pulsing = true
          dot.pulseStart = now
          dot.pulseDuration = rand(PULSE_DURATION_MIN, PULSE_DURATION_MAX)
        }

        let alpha = DOT_BASE_ALPHA

        if (dot.pulsing) {
          const elapsed = now - dot.pulseStart
          const phase = elapsed / dot.pulseDuration
          if (phase >= 1) {
            dot.pulsing = false
            dot.nextPulse = now + rand(1000, 8000)
          } else {
            // smooth bell: sin²(π·phase)
            const bell = Math.sin(Math.PI * phase) ** 2
            alpha = DOT_BASE_ALPHA + (DOT_PULSE_PEAK - DOT_BASE_ALPHA) * bell
          }
        }

        // Randomly spawn a flair from pulsing dots
        if (dot.pulsing && Math.random() < FLAIR_SPAWN_RATE) {
          spawnFlair(dot)
        }

        ctx!.save()
        ctx!.shadowColor = `rgba(${DOT_COLOR}, ${alpha * 1.4})`
        ctx!.shadowBlur = alpha > DOT_BASE_ALPHA + 0.1 ? 6 : 0
        ctx!.fillStyle = `rgba(${DOT_COLOR}, ${alpha})`
        ctx!.beginPath()
        ctx!.arc(dot.cx, dot.cy, DOT_RADIUS, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.restore()
      }

      // ── Update + draw flairs ─────────────────────────────────────────────
      const nextFlairs: Flair[] = []
      for (const f of flairs) {
        // Advance position
        const dist = f.speed * dtSec
        switch (f.dir) {
          case 'right': f.x += dist; break
          case 'left':  f.x -= dist; break
          case 'down':  f.y += dist; break
          case 'up':    f.y -= dist; break
        }

        // Fade out as it travels
        f.alpha -= dtSec * 0.55

        // Keep if still visible and on-canvas
        const onCanvas =
          f.x > -FLAIR_LENGTH && f.x < w + FLAIR_LENGTH &&
          f.y > -FLAIR_LENGTH && f.y < h + FLAIR_LENGTH

        if (f.alpha > 0.02 && onCanvas) {
          drawFlair(f)
          nextFlairs.push(f)
        }
      }
      flairs = nextFlairs

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  )
}
