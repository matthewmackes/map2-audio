import { useMemo } from 'react'

export type BuildStageId = 'layout' | 'wire' | 'tune' | 'save' | 'publish'
export type BuildStageStatus = 'locked' | 'active' | 'ready' | 'complete'

export interface BuildStageDescriptor {
  id: BuildStageId
  label: string
  recap: string
  status: BuildStageStatus
}

export interface BuildStageMachineInput {
  hasSnapshot: boolean
  pluginCount: number
  hasSelectedBlock: boolean
  hasUnsavedChanges: boolean
  hasLiveSnapshot: boolean
  automationActive: boolean
}

export interface BuildStageMachine {
  stages: BuildStageDescriptor[]
  recommendedStageId: BuildStageId
}

const STAGE_ORDER: BuildStageId[] = ['layout', 'wire', 'tune', 'save', 'publish']

export function useBuildStageMachine(input: BuildStageMachineInput): BuildStageMachine {
  const {
    hasSnapshot,
    pluginCount,
    hasSelectedBlock,
    hasUnsavedChanges,
    hasLiveSnapshot,
    automationActive,
  } = input

  return useMemo<BuildStageMachine>(() => {
    const layoutReady = hasSnapshot && pluginCount > 0
    const wireReady = layoutReady
    const tuneReady = wireReady
    const saveReady = wireReady
    const publishReady = saveReady && !hasUnsavedChanges

    const recapLayout = !hasSnapshot
      ? 'Load or create a snapshot'
      : pluginCount === 0
        ? 'Add blocks to the signal grid'
        : `${pluginCount} block${pluginCount > 1 ? 's' : ''} placed`
    const recapWire = !layoutReady
      ? 'Place blocks first'
      : hasSelectedBlock
        ? 'Editing block parameters'
        : 'Select a block to wire'
    const recapTune = !tuneReady
      ? 'Place blocks first'
      : automationActive
        ? 'Automation open'
        : 'Open automation lanes'
    const recapSave = !saveReady
      ? 'Place blocks first'
      : hasUnsavedChanges
        ? 'Unsaved changes — save to continue'
        : 'Draft saved'
    const recapPublish = !publishReady
      ? 'Save the draft first'
      : hasLiveSnapshot
        ? 'Publish or open another snapshot'
        : 'Ready to publish'

    const statusFor = (stageId: BuildStageId): BuildStageStatus => {
      switch (stageId) {
        case 'layout':
          return layoutReady ? 'complete' : 'active'
        case 'wire':
          if (!layoutReady) return 'locked'
          return hasSelectedBlock ? 'active' : 'ready'
        case 'tune':
          if (!tuneReady) return 'locked'
          return automationActive ? 'active' : 'ready'
        case 'save':
          if (!saveReady) return 'locked'
          return hasUnsavedChanges ? 'active' : 'complete'
        case 'publish':
          if (!publishReady) return 'locked'
          return 'ready'
      }
    }

    const stages: BuildStageDescriptor[] = [
      { id: 'layout', label: 'LAYOUT', recap: recapLayout, status: statusFor('layout') },
      { id: 'wire', label: 'WIRE', recap: recapWire, status: statusFor('wire') },
      { id: 'tune', label: 'TUNE', recap: recapTune, status: statusFor('tune') },
      { id: 'save', label: 'SAVE', recap: recapSave, status: statusFor('save') },
      { id: 'publish', label: 'PUBLISH', recap: recapPublish, status: statusFor('publish') },
    ]

    const recommendedStageId: BuildStageId = (() => {
      if (hasSelectedBlock) return 'wire'
      if (!layoutReady) return 'layout'
      if (hasUnsavedChanges) return 'save'
      if (automationActive) return 'tune'
      return 'wire'
    })()

    return { stages, recommendedStageId }
  }, [
    hasSnapshot,
    pluginCount,
    hasSelectedBlock,
    hasUnsavedChanges,
    hasLiveSnapshot,
    automationActive,
  ])
}

export { STAGE_ORDER }
