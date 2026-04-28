import { useLocation } from 'react-router-dom'

export function useActiveSectionFromPath<TSection extends string>(
  routePrefix: string,
  sectionIds: readonly TSection[],
  defaultSection: TSection,
): TSection {
  const { pathname } = useLocation()
  const escapedPrefix = routePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = pathname.match(new RegExp(`${escapedPrefix}([^/]+)`))
  const candidate = match?.[1]
  if (candidate && (sectionIds as readonly string[]).includes(candidate)) {
    return candidate as TSection
  }
  return defaultSection
}
