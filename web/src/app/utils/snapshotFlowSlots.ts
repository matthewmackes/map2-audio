export interface SoloCapableFlowSlot {
  id: string
  solo: boolean
}

export function applyFlowSlotUpdate<T extends SoloCapableFlowSlot>(
  flowSlots: readonly T[],
  flowId: string,
  updates: Partial<T>,
): {
  nextFlowSlots: T[]
  changed: boolean
} {
  let changed = false

  const nextFlowSlots = flowSlots.map((flow) => {
    if (flow.id !== flowId) {
      if (updates.solo === true && flow.solo) {
        changed = true
        return {
          ...flow,
          solo: false,
        }
      }
      return flow
    }

    const updatedFlow = { ...flow, ...updates }
    if (JSON.stringify(flow) !== JSON.stringify(updatedFlow)) {
      changed = true
      return updatedFlow
    }
    return flow
  })

  return { nextFlowSlots, changed }
}
