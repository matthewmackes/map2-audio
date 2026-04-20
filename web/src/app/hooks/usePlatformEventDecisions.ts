import { useMemo } from 'react'

import {
  type RouterDecision,
  type RouterTarget,
  routePlatformEvent,
} from '../services/platformEventRouter'
import { type UsePlatformEventsOptions, usePlatformEvents } from './usePlatformEvents'

export function filterPlatformEventDecisions<TTarget extends RouterTarget>(
  decisions: RouterDecision[],
  target: TTarget,
): Extract<RouterDecision, { target: TTarget }>[] {
  return decisions.filter((decision): decision is Extract<RouterDecision, { target: TTarget }> => decision.target === target)
}

export function usePlatformEventDecisions(options: UsePlatformEventsOptions = {}) {
  const platformEvents = usePlatformEvents(options)
  const decisions = useMemo(
    () => platformEvents.events.flatMap((event) => routePlatformEvent(event)),
    [platformEvents.events],
  )

  return {
    ...platformEvents,
    decisions,
  }
}
