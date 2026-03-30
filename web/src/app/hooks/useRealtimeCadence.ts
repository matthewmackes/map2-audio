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
