export type JuceGridLivePathMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface JuceGridLivePathFlow {
  id: string
  label: string
  color: string
  muted: boolean
  solo: boolean
  chainId: number | null
  dryWetMix: number
}

export interface JuceGridLivePathInput {
  flows: JuceGridLivePathFlow[]
  mode: JuceGridLivePathMode
  activeFlowId?: string | null
  focusFlowId?: string | null
  seriesOrder?: string[]
  blendPositions?: Record<string, number>
  morphProgress?: number
  morphSourceId?: string | null
  morphTargetId?: string | null
}

export interface JuceGridLivePathFlowState {
  flowId: string
  activeAudio: boolean
  dimmed: boolean
  placeholder: boolean
  annotation: string
  secondaryAnnotation?: string
  branchPercent?: number
  sidechainKey?: boolean
}

export interface JuceGridLivePathGroup {
  id: string
  kind: 'series' | 'parallel' | 'ab' | 'morph' | 'sidechain' | 'inactive'
  title: string
  entryLabel?: string
  exitLabel?: string
  flowIds: string[]
  tone: 'active' | 'dim'
  dashed?: boolean
}

export interface JuceGridLivePathLayout {
  status: 'available' | 'unavailable'
  orderedFlowIds: string[]
  activeFlowIds: string[]
  primaryFlowId: string | null
  secondaryFlowId: string | null
  groups: JuceGridLivePathGroup[]
  flowStates: Record<string, JuceGridLivePathFlowState>
  mobileSummary: string[]
}

function clampPercent(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(0, Math.min(100, value))
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    ordered.push(id)
  }
  return ordered
}

function orderFlowIds(flows: JuceGridLivePathFlow[], preferred: string[] = []): string[] {
  return uniqueIds([
    ...preferred,
    ...flows.map((flow) => flow.id),
  ])
}

function getEligibleFlowIds(flows: JuceGridLivePathFlow[]): string[] {
  const soloIds = flows.filter((flow) => flow.solo && !flow.muted).map((flow) => flow.id)
  if (soloIds.length > 0) {
    return soloIds
  }
  return flows.filter((flow) => !flow.muted).map((flow) => flow.id)
}

function getDimReason(flow: JuceGridLivePathFlow, eligibleIds: Set<string>): string {
  if (flow.muted) {
    return 'Muted'
  }
  if (!eligibleIds.has(flow.id)) {
    return 'Dimmed by solo'
  }
  return 'Inactive branch'
}

function resolvePrimaryFlowId(
  orderedIds: string[],
  eligibleIds: Set<string>,
  activeFlowId?: string | null,
  focusFlowId?: string | null,
): string | null {
  if (activeFlowId && eligibleIds.has(activeFlowId)) {
    return activeFlowId
  }
  if (focusFlowId && eligibleIds.has(focusFlowId)) {
    return focusFlowId
  }
  return orderedIds.find((id) => eligibleIds.has(id)) ?? focusFlowId ?? activeFlowId ?? orderedIds[0] ?? null
}

export function buildJuceGridLivePath(input: JuceGridLivePathInput): JuceGridLivePathLayout {
  const orderedIds = orderFlowIds(input.flows, input.seriesOrder ?? [])
  const flowMap = new Map(input.flows.map((flow) => [flow.id, flow]))
  const eligibleIds = new Set(getEligibleFlowIds(input.flows))
  const flowStates: Record<string, JuceGridLivePathFlowState> = {}

  if (orderedIds.length === 0) {
    return {
      status: 'unavailable',
      orderedFlowIds: [],
      activeFlowIds: [],
      primaryFlowId: null,
      secondaryFlowId: null,
      groups: [],
      flowStates,
      mobileSummary: ['Configured path unavailable'],
    }
  }

  const primaryFlowId = resolvePrimaryFlowId(orderedIds, eligibleIds, input.activeFlowId, input.focusFlowId)
  const morphProgress = Math.max(0, Math.min(1, input.morphProgress ?? 0))
  let activeFlowIds: string[] = []
  let secondaryFlowId: string | null = null
  let groups: JuceGridLivePathGroup[] = []
  let orderedFlowIds: string[] = orderedIds
  let mobileSummary: string[] = []

  const assignState = (
    flowId: string,
    overrides: Partial<JuceGridLivePathFlowState>,
  ) => {
    const flow = flowMap.get(flowId)
    if (!flow) {
      return
    }
    flowStates[flowId] = {
      flowId,
      activeAudio: false,
      dimmed: !eligibleIds.has(flowId),
      placeholder: flow.chainId === null,
      annotation: getDimReason(flow, eligibleIds),
      secondaryAnnotation: flow.chainId === null ? 'No chain assigned' : undefined,
      branchPercent: undefined,
      sidechainKey: false,
      ...overrides,
    }
  }

  switch (input.mode) {
    case 'parallel_blend': {
      const activeIds = orderedIds.filter((flowId) => {
        if (!eligibleIds.has(flowId)) {
          return false
        }
        const blendPercent = clampPercent(input.blendPositions?.[flowId], 100)
        return blendPercent > 0
      })
      const inactiveIds = orderedIds.filter((flowId) => !activeIds.includes(flowId))
      orderedFlowIds = [...activeIds, ...inactiveIds]
      activeFlowIds = activeIds
      secondaryFlowId = activeIds[1] ?? null

      for (const flowId of orderedFlowIds) {
        const branchPercent = clampPercent(input.blendPositions?.[flowId], 100)
        const isActive = activeIds.includes(flowId)
        assignState(flowId, {
          activeAudio: isActive,
          dimmed: !isActive,
          annotation: isActive ? 'Parallel branch' : getDimReason(flowMap.get(flowId) as JuceGridLivePathFlow, eligibleIds),
          secondaryAnnotation: `${branchPercent}% blend`,
          branchPercent,
        })
      }

      groups = [
        {
          id: 'parallel-main',
          kind: 'parallel',
          title: 'Configured parallel blend',
          entryLabel: 'Input Split',
          exitLabel: 'Mix to Output',
          flowIds: orderedFlowIds,
          tone: activeIds.length > 0 ? 'active' : 'dim',
        },
      ]

      mobileSummary = activeIds.length > 0
        ? [`Parallel: ${activeIds.map((flowId) => `${flowMap.get(flowId)?.label} ${clampPercent(input.blendPositions?.[flowId], 100)}%`).join(', ')}`]
        : ['Configured path unavailable']
      break
    }

    case 'ab_switch': {
      const chosenFlowId = primaryFlowId
      const activeId = chosenFlowId && eligibleIds.has(chosenFlowId) ? chosenFlowId : null
      activeFlowIds = activeId ? [activeId] : []
      orderedFlowIds = activeId
        ? [activeId, ...orderedIds.filter((flowId) => flowId !== activeId)]
        : orderedIds

      for (const flowId of orderedFlowIds) {
        const isActive = flowId === activeId
        assignState(flowId, {
          activeAudio: isActive,
          dimmed: !isActive,
          annotation: isActive ? 'Selected branch' : getDimReason(flowMap.get(flowId) as JuceGridLivePathFlow, eligibleIds),
          secondaryAnnotation: isActive ? 'A/B output live' : 'Selector holding this branch offline',
        })
      }

      groups = [
        {
          id: 'ab-main',
          kind: 'ab',
          title: 'Configured A/B switch',
          entryLabel: 'Selector',
          exitLabel: 'Output',
          flowIds: orderedFlowIds,
          tone: activeFlowIds.length > 0 ? 'active' : 'dim',
        },
      ]

      mobileSummary = activeId
        ? [`A/B: ${flowMap.get(activeId)?.label} selected`]
        : ['Configured path unavailable']
      break
    }

    case 'parameter_morph': {
      const sourceId = resolvePrimaryFlowId(orderedIds, eligibleIds, input.morphSourceId, primaryFlowId)
      const targetId = uniqueIds([
        input.morphTargetId,
        orderedIds.find((flowId) => flowId !== sourceId) ?? null,
      ])[0] ?? null
      secondaryFlowId = targetId
      const sourceActive = Boolean(sourceId && eligibleIds.has(sourceId))
      const targetActive = Boolean(targetId && eligibleIds.has(targetId) && morphProgress > 0)
      activeFlowIds = uniqueIds([
        sourceActive ? sourceId : null,
        targetActive ? targetId : null,
      ])
      orderedFlowIds = uniqueIds([
        sourceId,
        targetId,
        ...orderedIds,
      ])

      for (const flowId of orderedFlowIds) {
        const isSource = flowId === sourceId
        const isTarget = flowId === targetId
        assignState(flowId, {
          activeAudio: activeFlowIds.includes(flowId),
          dimmed: !activeFlowIds.includes(flowId),
          annotation: isSource
            ? 'Morph source'
            : isTarget
              ? 'Morph target'
              : getDimReason(flowMap.get(flowId) as JuceGridLivePathFlow, eligibleIds),
          secondaryAnnotation: isSource || isTarget ? `${Math.round(morphProgress * 100)}% morph` : undefined,
        })
      }

      groups = [
        {
          id: 'morph-main',
          kind: 'morph',
          title: 'Configured morph path',
          entryLabel: 'Source',
          exitLabel: 'Output',
          flowIds: orderedFlowIds,
          tone: activeFlowIds.length > 0 ? 'active' : 'dim',
        },
      ]

      mobileSummary = sourceId && targetId
        ? [`Morph ${Math.round(morphProgress * 100)}%: ${flowMap.get(sourceId)?.label} -> ${flowMap.get(targetId)?.label}`]
        : ['Configured path unavailable']
      break
    }

    case 'sidechain': {
      const audioFlowId = primaryFlowId
      const sidechainSourceId = uniqueIds([
        orderedIds.find((flowId) => flowId !== audioFlowId && eligibleIds.has(flowId)) ?? null,
        orderedIds.find((flowId) => flowId !== audioFlowId) ?? null,
      ])[0] ?? null
      secondaryFlowId = sidechainSourceId
      activeFlowIds = audioFlowId && eligibleIds.has(audioFlowId) ? [audioFlowId] : []
      const remainingIds = orderedIds.filter((flowId) => flowId !== audioFlowId && flowId !== sidechainSourceId)
      orderedFlowIds = uniqueIds([audioFlowId, sidechainSourceId, ...remainingIds])

      if (audioFlowId) {
        assignState(audioFlowId, {
          activeAudio: eligibleIds.has(audioFlowId),
          dimmed: !eligibleIds.has(audioFlowId),
          annotation: 'Main audio',
          secondaryAnnotation: 'Feeds the output bus',
        })
      }
      if (sidechainSourceId) {
        assignState(sidechainSourceId, {
          activeAudio: false,
          dimmed: !eligibleIds.has(sidechainSourceId),
          annotation: 'Sidechain key',
          secondaryAnnotation: audioFlowId ? `Triggers ${flowMap.get(audioFlowId)?.label}` : 'Control lane',
          sidechainKey: true,
        })
      }
      for (const flowId of remainingIds) {
        assignState(flowId, {
          activeAudio: false,
          dimmed: true,
        })
      }

      const inactiveIds = remainingIds.filter((flowId) => !activeFlowIds.includes(flowId))
      groups = [
        {
          id: 'sidechain-main',
          kind: 'series',
          title: 'Place a single Flow inside a Chain',
          entryLabel: 'Input',
          exitLabel: 'Output',
          flowIds: audioFlowId ? [audioFlowId] : [],
          tone: activeFlowIds.length > 0 ? 'active' : 'dim',
        },
      ]
      if (sidechainSourceId) {
        groups.push({
          id: 'sidechain-key',
          kind: 'sidechain',
          title: 'Sidechain control',
          entryLabel: 'Key',
          exitLabel: audioFlowId ? `To ${flowMap.get(audioFlowId)?.label}` : 'Control',
          flowIds: [sidechainSourceId],
          tone: eligibleIds.has(sidechainSourceId) ? 'active' : 'dim',
          dashed: true,
        })
      }
      if (inactiveIds.length > 0) {
        groups.push({
          id: 'sidechain-context',
          kind: 'inactive',
          title: 'Dimmed context',
          flowIds: inactiveIds,
          tone: 'dim',
        })
      }

      mobileSummary = audioFlowId
        ? [`Sidechain: audio ${flowMap.get(audioFlowId)?.label}${sidechainSourceId ? `, key ${flowMap.get(sidechainSourceId)?.label}` : ''}`]
        : ['Configured path unavailable']
      break
    }

    case 'series':
    default: {
      const activeIds = orderedIds.filter((flowId) => eligibleIds.has(flowId))
      const inactiveIds = orderedIds.filter((flowId) => !eligibleIds.has(flowId))
      activeFlowIds = activeIds
      secondaryFlowId = activeIds[1] ?? null
      orderedFlowIds = [...activeIds, ...inactiveIds]

      for (const flowId of activeIds) {
        assignState(flowId, {
          activeAudio: true,
          dimmed: false,
          annotation: 'Serial stage',
          secondaryAnnotation: flowMap.get(flowId)?.chainId === null ? 'No chain assigned' : 'Configured in current routing',
        })
      }
      for (const flowId of inactiveIds) {
        assignState(flowId, {
          activeAudio: false,
          dimmed: true,
        })
      }

      groups = []
      if (activeIds.length > 0) {
        groups.push({
          id: 'series-main',
          kind: 'series',
          title: 'Place a single Flow inside a Chain',
          entryLabel: 'Input',
          exitLabel: 'Output',
          flowIds: activeIds,
          tone: 'active',
        })
      }
      if (inactiveIds.length > 0) {
        groups.push({
          id: 'series-context',
          kind: 'inactive',
          title: 'Dimmed context',
          flowIds: inactiveIds,
          tone: 'dim',
        })
      }

      mobileSummary = activeIds.length > 0
        ? [`Series: ${activeIds.map((flowId) => flowMap.get(flowId)?.label).join(' > ')}`]
        : ['Configured path unavailable']
      break
    }
  }

  const status = activeFlowIds.length > 0 ? 'available' : 'unavailable'
  if (status === 'unavailable') {
    mobileSummary = ['Configured path unavailable']
  }

  return {
    status,
    orderedFlowIds,
    activeFlowIds,
    primaryFlowId,
    secondaryFlowId,
    groups: groups.filter((group) => group.flowIds.length > 0),
    flowStates,
    mobileSummary,
  }
}
