import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import {
  getStaggerTimings,
  useEffectsSettingsStore,
  type StaggerTimings,
} from '../stores/effectsSettingsStore'

/*
  Universal Staggered Reveal — auto-detects grids/lists in the active
  route subtree on every navigation and triggers a slow Framer-Motion
  -styled fade+slide-up cascade across direct children.

  Implementation note: we deliberately do NOT swap real DOM nodes for
  motion components — that would force every grid/list in the app to be
  rewritten and break tooling like react-virtualized children. Instead,
  we use the Web Animations API (animate()) to apply the same physics
  curve and stagger offset Framer Motion would generate. The visual
  result matches a `<motion.div variants={{...}} staggerChildren>` tree
  while keeping the shipping surface zero-touch for downstream features.

  Targets (auto-detected, scoped to <main>):
    - `[role=list]`, `[role=grid]`
    - `<ul>`, `<ol>`
    - elements with `display: grid|flex` and ≥3 children

  Excluded (heuristic; honors operators’ explicit opt-out as well):
    - `[data-no-stagger]` (anywhere in ancestor chain)
    - `[role=meter|progressbar|status|log]`
    - `[aria-live]` (live regions update too often to animate)
    - elements whose className matches /meter|level|loglist|stream|toolbar|tablist/i

  Honors `prefers-reduced-motion`: shorter fade only, no slide, ~80ms.

  Speed is user-tunable via the effectsSettingsStore staggerSpeed
  enum and surfaced in the Theme page Behavior tab.
*/

const MAX_STAGGER_ITEMS = 16 // cap so a 1000-item virtualized list doesn't take 50s
const SLIDE_PX = 12
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const REDUCED_DURATION_MS = 80

const EXCLUDED_ROLES = new Set(['meter', 'progressbar', 'status', 'log', 'tablist', 'toolbar', 'navigation'])
const EXCLUDED_CLASS_RE = /(?:^|[\s_-])(?:meter|levels?|vu|peak|log-?list|log-?stream|stream|liveregion|toast)(?:[\s_-]|$)/i
const STAGGER_RUN_ATTR = 'data-stagger-run-id'
const STAGGER_APPLIED_ATTR = 'data-stagger-applied'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isExcluded(element: Element): boolean {
  if (element.closest('[data-no-stagger]')) return true
  const role = element.getAttribute('role')
  if (role && EXCLUDED_ROLES.has(role)) return true
  if (element.hasAttribute('aria-live')) return true
  const className = typeof (element as HTMLElement).className === 'string'
    ? (element as HTMLElement).className
    : ''
  if (className && EXCLUDED_CLASS_RE.test(className)) return true
  return false
}

function isStaggerContainer(element: Element): boolean {
  if (isExcluded(element)) return false
  const role = element.getAttribute('role')
  if (role === 'list' || role === 'grid') return element.children.length >= 2
  if (element.tagName === 'UL' || element.tagName === 'OL') return element.children.length >= 2
  if (!(element instanceof HTMLElement)) return false
  if (element.children.length < 3) return false
  const display = window.getComputedStyle(element).display
  return display === 'grid' || display === 'flex' || display === 'inline-grid' || display === 'inline-flex'
}

export function findStaggerContainers(root: Element): Element[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'ul, ol, [role="list"], [role="grid"], main, section, article, div',
  )
  const out: Element[] = []
  candidates.forEach((el) => {
    if (isStaggerContainer(el)) {
      // Skip nested containers inside an already-selected ancestor — only
      // animate the outer-most layout grid to avoid double-staggering rows.
      const alreadyCovered = out.some((parent) => parent.contains(el))
      if (!alreadyCovered) out.push(el)
    }
  })
  return out
}

export interface StaggerOptions {
  timings: StaggerTimings
  reduced: boolean
  runId: string
}

export function staggerElement(child: Element, index: number, options: StaggerOptions): Animation | null {
  if (!(child instanceof HTMLElement)) return null
  if (isExcluded(child)) return null

  // Skip if a previous run on this same nav already animated it (StrictMode
  // double-effect, fast back/forward navigation, etc.).
  if (child.getAttribute(STAGGER_RUN_ATTR) === options.runId) return null
  child.setAttribute(STAGGER_RUN_ATTR, options.runId)
  child.setAttribute(STAGGER_APPLIED_ATTR, 'true')

  const cappedIndex = Math.min(index, MAX_STAGGER_ITEMS - 1)
  const { perItemMs, staggerStepMs, totalBudgetMs } = options.timings
  const delay = options.reduced ? 0 : Math.min(cappedIndex * staggerStepMs, totalBudgetMs - perItemMs)
  const duration = options.reduced ? REDUCED_DURATION_MS : perItemMs

  try {
    const keyframes: Keyframe[] = options.reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
        { opacity: 0, transform: `translate3d(0, ${SLIDE_PX}px, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ]
    const anim = (child as HTMLElement).animate(keyframes, {
      duration,
      delay,
      easing: `cubic-bezier(${EASE[0]}, ${EASE[1]}, ${EASE[2]}, ${EASE[3]})`,
      fill: 'backwards',
    })
    return anim
  } catch {
    return null
  }
}

export function runStaggerOnRoot(root: Element, runId: string, reduced: boolean, timings: StaggerTimings): Animation[] {
  const animations: Animation[] = []
  const containers = findStaggerContainers(root)
  containers.forEach((container) => {
    const children = Array.from(container.children)
    children.forEach((child, idx) => {
      const anim = staggerElement(child, idx, { timings, reduced, runId })
      if (anim) animations.push(anim)
    })
  })
  return animations
}

export function UniversalStaggerProvider() {
  const location = useLocation()
  const pageTransitionPreset = useEffectsSettingsStore((state) => state.pageTransitionPreset)
  const reducedEffectsEnabled = useEffectsSettingsStore((state) => state.reducedEffectsEnabled)
  const staggerSpeed = useEffectsSettingsStore((state) => state.staggerSpeed)
  const runIdRef = useRef(0)
  const lastPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (pageTransitionPreset !== 'staggered-reveal') return undefined
    if (typeof document === 'undefined') return undefined

    // Skip the initial render — only fire on real navigation. Otherwise
    // the very first paint stutters on cold load.
    if (lastPathRef.current === null) {
      lastPathRef.current = location.pathname
      return undefined
    }
    if (lastPathRef.current === location.pathname) return undefined
    lastPathRef.current = location.pathname

    const reduced = reducedEffectsEnabled || prefersReducedMotion()
    const runId = String(++runIdRef.current)
    const timings = getStaggerTimings(staggerSpeed)

    // Defer to next frame so the new route's DOM is committed.
    let cancelled = false
    let animations: Animation[] = []
    const handle = window.requestAnimationFrame(() => {
      if (cancelled) return
      const root = document.querySelector('main') ?? document.body
      if (!root) return
      animations = runStaggerOnRoot(root, runId, reduced, timings)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(handle)
      animations.forEach((anim) => {
        try {
          anim.cancel()
        } catch {
          /* noop */
        }
      })
    }
  }, [location.pathname, pageTransitionPreset, reducedEffectsEnabled, staggerSpeed])

  return null
}
