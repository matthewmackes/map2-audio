import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Button, ProgressBar } from '@carbon/react'
import { CheckmarkFilled, WarningFilled } from '@carbon/icons-react'

import { REBOOT_PROGRESS_STEPS, type RebootProgressStep, type RebootStage } from './useRebootSystem'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'

const INSTANT = { duration: 0 } as const

// ── Waveform animation ────────────────────────────────────────────────────────
// Draws a live low-frequency oscilloscope trace during a reboot to signal
// that the UI is still responsive while the backend is unreachable. Kept
// as a deliberate operational affordance, not decoration. T2474 B2: switched
// from Tailwind purple-500 (rgba(139,92,246,...)) to Carbon blue-50
// (#4589ff) to comply with Q1=A discipline (blue primary; no random brand
// hues). Drop-shadow glow removed (Q1=A — no glow).
const WAVE_PRIMARY = 'rgba(69,137,255,0.9)'   // Carbon blue-50 #4589ff
const WAVE_FAINT = 'rgba(69,137,255,0.08)'
const WAVE_GHOST = 'rgba(120,169,255,0.18)'   // Carbon blue-40 #78a9ff
function WaveformCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const CY = H / 2
    const SPEED = active ? 0.018 : 0.006

    const draw = () => {
      tRef.current += SPEED
      const t = tRef.current

      ctx.clearRect(0, 0, W, H)

      // Faint grid lines
      ctx.strokeStyle = WAVE_FAINT
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(0, CY)
      ctx.lineTo(W, CY)
      ctx.stroke()

      // Primary wave — composite of harmonics for organic feel
      const gradient = ctx.createLinearGradient(0, 0, W, 0)
      gradient.addColorStop(0, 'rgba(69,137,255,0.0)')
      gradient.addColorStop(0.1, WAVE_PRIMARY)
      gradient.addColorStop(0.9, WAVE_PRIMARY)
      gradient.addColorStop(1, 'rgba(69,137,255,0.0)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 2
      // No shadowBlur — Q1=A retires decorative glow.

      ctx.beginPath()
      for (let x = 0; x <= W; x++) {
        const phase = (x / W) * Math.PI * 8
        const amp = active ? CY * 0.52 : CY * 0.18
        const y =
          CY +
          Math.sin(phase + t * 3.1) * amp * 0.55 +
          Math.sin(phase * 0.5 + t * 2.3) * amp * 0.28 +
          Math.sin(phase * 2 + t * 4.7) * amp * 0.12 +
          Math.sin(phase * 0.25 + t) * amp * 0.05
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Secondary ghost wave
      ctx.strokeStyle = WAVE_GHOST
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= W; x++) {
        const phase = (x / W) * Math.PI * 8
        const amp = active ? CY * 0.28 : CY * 0.08
        const y =
          CY +
          Math.sin(phase * 1.3 + t * 2.2 + 1.2) * amp * 0.6 +
          Math.sin(phase * 0.6 + t * 3.5) * amp * 0.3
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      className="reboot-overlay__waveform"
      width={480}
      height={72}
      aria-hidden
    />
  )
}

// ── MAP2 logo mark ────────────────────────────────────────────────────────────
function LogoMark({ pulse }: { pulse: boolean }) {
  return (
    <motion.div
      className="reboot-overlay__logo"
      animate={pulse ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
      transition={pulse ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <span className="reboot-overlay__logo-text">MAP</span>
      <span className="reboot-overlay__logo-sub">PLATFORM REBOOT</span>
    </motion.div>
  )
}

// ── Step list ─────────────────────────────────────────────────────────────────
function StepList({
  steps,
  activeStage,
  progressIndex,
}: {
  steps: readonly RebootProgressStep[]
  activeStage: RebootStage
  progressIndex: number
}) {
  return (
    <div className="reboot-overlay__steps" aria-label="Reboot progress steps">
      {steps.map((step, index) => {
        const isActive = step.key === activeStage
        const isComplete = index < progressIndex || activeStage === 'ready'
        return (
          <motion.div
            key={step.key}
            layout
            className={[
              'reboot-overlay__step',
              isActive ? 'is-active' : '',
              isComplete ? 'is-complete' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: isActive || isComplete ? 1 : 0.45 }}
            transition={{ duration: 0.35 }}
          >
            <span className="reboot-overlay__step-dot" aria-hidden>
              {isComplete ? <CheckmarkFilled size={12} /> : null}
            </span>
            <span className="reboot-overlay__step-label">{step.label}</span>
            {isActive ? (
              <motion.span
                className="reboot-overlay__step-active-badge"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                In progress
              </motion.span>
            ) : null}
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────
export function RebootOverlay({
  rebootStage,
  rebootError,
  rebootProgressIndex,
  rebootCurrentStep,
  onDismiss,
}: {
  rebootStage: RebootStage
  rebootError: string | null
  rebootProgressIndex: number
  rebootCurrentStep: RebootProgressStep | null
  onDismiss: () => void
}) {
  if (rebootStage === 'idle' || rebootStage === 'preflight') return null

  const isError = rebootStage === 'error'
  const isTimeout = rebootStage === 'timeout'
  const isReady = rebootStage === 'ready'
  const isActive = !isError && !isTimeout && !isReady
  const progressPct = ((rebootProgressIndex + 1) / REBOOT_PROGRESS_STEPS.length) * 100
  // T2466-3: respect prefers-reduced-motion + the in-app
  // Reduced-effects toggle for the overlay's enter spring,
  // panel scale-in, and heading cross-fade.
  const { shouldReduceEffects } = useReducedEffectsPreference()

  return (
    <AnimatePresence>
      <motion.div
        className={[
          'reboot-overlay',
          isTimeout ? 'reboot-overlay--timeout' : '',
          isError ? 'reboot-overlay--error' : '',
          isReady ? 'reboot-overlay--ready' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
        aria-live="polite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={shouldReduceEffects ? INSTANT : { duration: 0.3 }}
      >
        <motion.div
          className="reboot-overlay__panel"
          initial={{ scale: 0.96, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          transition={shouldReduceEffects ? INSTANT : { type: 'spring', stiffness: 240, damping: 26, delay: 0.05 }}
        >
          {/* Title bar */}
          <div className="reboot-overlay__titlebar">
            <span className="reboot-overlay__eyebrow">Power</span>
          </div>

          {/* Logo */}
          <LogoMark pulse={isActive} />

          {/* Waveform — only visible while active */}
          {isActive ? (
            <div className="reboot-overlay__waveform-wrap">
              <WaveformCanvas active={rebootStage !== 'shutting-down-os' && rebootStage !== 'waiting-for-hardware'} />
            </div>
          ) : null}

          {/* Heading */}
          <AnimatePresence mode="wait">
            <motion.div
              key={rebootStage}
              className="reboot-overlay__copy"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={shouldReduceEffects ? INSTANT : { type: 'spring', stiffness: 280, damping: 26 }}
            >
              {isTimeout ? (
                <>
                  <h2 className="reboot-overlay__title">
                    <WarningFilled size={20} aria-hidden /> Reboot is taking longer than expected
                  </h2>
                  <p className="reboot-overlay__subtitle">
                    More than 3 minutes have passed with no response from the system. Please check the
                    local console for errors. If the system is unresponsive, a manual power cycle may
                    be required.
                  </p>
                  <Button kind="ghost" onClick={onDismiss}>Dismiss</Button>
                </>
              ) : isError ? (
                <>
                  <h2 className="reboot-overlay__title">Reboot command failed</h2>
                  <p className="reboot-overlay__subtitle">
                    {rebootError ?? 'The reboot request did not complete. The system may still be running.'}
                  </p>
                  <Button kind="primary" onClick={onDismiss}>Close</Button>
                </>
              ) : isReady ? (
                <>
                  <h2 className="reboot-overlay__title">
                    <CheckmarkFilled size={20} aria-hidden /> Reboot complete — system ready
                  </h2>
                  <p className="reboot-overlay__subtitle">
                    All platform services are back online. You can resume normal operation.
                  </p>
                  <Button kind="primary" onClick={onDismiss}>Continue</Button>
                </>
              ) : (
                <>
                  <h2 className="reboot-overlay__title">
                    {rebootCurrentStep?.label ?? 'Rebooting…'}
                  </h2>
                  <p className="reboot-overlay__subtitle">
                    {rebootCurrentStep?.description}
                  </p>
                  {rebootStage === 'shutting-down-os' || rebootStage === 'waiting-for-hardware' ? (
                    <p className="reboot-overlay__reassurance">
                      This is normal. Most full reboots take 20–60 seconds. Do not remove power.
                    </p>
                  ) : null}
                  {rebootStage === 'shutting-down-os' ? (
                    <p className="reboot-overlay__irrevocable">
                      Reboot is now in progress. This cannot be undone.
                    </p>
                  ) : null}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Progress bar — only during active stages */}
          {isActive ? (
            <ProgressBar
              className="reboot-overlay__progress"
              label="Reboot progress"
              hideLabel
              helperText={rebootCurrentStep?.label}
              value={progressPct}
            />
          ) : null}

          {/* Step list */}
          {isActive ? (
            <StepList
              steps={REBOOT_PROGRESS_STEPS}
              activeStage={rebootStage}
              progressIndex={rebootProgressIndex}
            />
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
