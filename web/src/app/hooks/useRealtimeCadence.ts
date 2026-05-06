import { usePageVisible } from './usePageVisible'

export interface RealtimeCadenceOptions {
  enabled?: boolean
  routeActive?: boolean
  visibleMs?: number | false
  hiddenMs?: number | false
  inactiveMs?: number | false
}

export function useRealtimeCadence({
  enabled = true,
  routeActive = true,
  visibleMs = false,
  hiddenMs,
  inactiveMs = false,
}: RealtimeCadenceOptions): number | false {
  // Audit Anti-2 (cycle 39): all hook calls MUST happen above the early
  // returns below. React's rules-of-hooks require hooks to run in the
  // same order on every render — a hook added below an early return
  // would silently violate that on the cycles where the return fires.
  // Future maintainers: keep new hook calls grouped here, before the
  // first `if (!...) return ...`.
  const visible = usePageVisible()

  if (!enabled) {
    return false
  }

  if (!routeActive) {
    return inactiveMs
  }

  return visible ? visibleMs : (hiddenMs ?? visibleMs)
}

export default useRealtimeCadence
