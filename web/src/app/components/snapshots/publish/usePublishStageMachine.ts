import { useMemo } from 'react'
import type { PublishBlocker, PublishBlockerCode, SnapshotPublishReadiness } from '../../../../map2/types'

export type PublishStageId = 'stage' | 'instruments' | 'signal' | 'line' | 'golive'
export type PublishStageStatus = 'locked' | 'ready' | 'active' | 'complete' | 'armed' | 'live'

export interface PublishStageDescriptor {
  id: PublishStageId
  label: string
  recap: string
  status: PublishStageStatus
  blockers: PublishBlocker[]
}

export interface PublishStageMachineInput {
  readiness: SnapshotPublishReadiness | null
  selectedHostId: string | null
  saveStepComplete: boolean
  hostStepComplete: boolean
  soundStepComplete: boolean
  isLive: boolean
  isActivating: boolean
  publishDisabled: boolean
  channelsConfirmed: boolean
}

export interface PublishStageMachine {
  stages: PublishStageDescriptor[]
  activeStageId: PublishStageId
  overallStatus: 'rehearsing' | 'armed' | 'publishing' | 'live'
  overallLabel: string
}

const STAGE_OWNED_BLOCKER_CODES: Record<PublishStageId, PublishBlockerCode[]> = {
  stage: ['unsaved_draft', 'snapshot_invalid'],
  instruments: [
    'plugin_missing',
    'asset_missing',
    'audio_input_missing',
    'audio_output_missing',
    'monitoring_output_invalid',
  ],
  signal: ['local_routing_invalid', 'network_routing_invalid', 'node_assignment_missing'],
  line: [
    'node_offline',
    'node_sync_pending',
    'engine_unavailable',
    'engine_apply_failed',
    'channel_unconfirmed',
    'observation_stale',
    'authority_diverged',
    'authority_confirmation_failed',
  ],
  golive: [],
}

function blockersForStage(stageId: PublishStageId, blockers: PublishBlocker[]): PublishBlocker[] {
  const codes = STAGE_OWNED_BLOCKER_CODES[stageId]
  if (codes.length === 0) {
    return []
  }
  const codeSet = new Set<PublishBlockerCode>(codes)
  return blockers.filter((blocker) => codeSet.has(blocker.code))
}

export function usePublishStageMachine(input: PublishStageMachineInput): PublishStageMachine {
  const {
    readiness,
    selectedHostId,
    saveStepComplete,
    hostStepComplete,
    soundStepComplete,
    isLive,
    isActivating,
    publishDisabled,
    channelsConfirmed,
  } = input

  return useMemo<PublishStageMachine>(() => {
    const blockers = readiness?.blockers ?? []

    const stageHost = blockersForStage('stage', blockers)
    const stageInstruments = blockersForStage('instruments', blockers)
    const stageSignal = blockersForStage('signal', blockers)
    const stageLine = blockersForStage('line', blockers)

    const stageRecap = hostStepComplete && selectedHostId
      ? `Host · ${selectedHostId}`
      : saveStepComplete
        ? 'Draft saved — choose a host'
        : 'Save the draft to start'
    const instrumentsRecap = soundStepComplete
      ? 'Devices ready'
      : 'Set input, output, monitor'
    const signalRecap = stageSignal.length === 0
      ? 'Routing ready'
      : `${stageSignal.length} routing blocker${stageSignal.length > 1 ? 's' : ''}`
    const lineRecap = channelsConfirmed
      ? 'All channels confirmed live'
      : stageLine.length > 0
        ? 'Runtime not ready'
        : 'Awaiting per-channel confirm'
    const goliveRecap = isLive
      ? `Live · rev ${readiness?.confirmed_revision_id ?? '—'}`
      : !publishDisabled
        ? 'Armed — press GO LIVE'
        : 'Waiting on previous steps'

    const stageStatus: PublishStageStatus = saveStepComplete && hostStepComplete
      ? 'complete'
      : saveStepComplete
        ? 'active'
        : 'active'
    const instrumentsStatus: PublishStageStatus = !hostStepComplete
      ? 'locked'
      : soundStepComplete
        ? 'complete'
        : 'active'
    const signalStatus: PublishStageStatus = !soundStepComplete
      ? 'locked'
      : stageSignal.length === 0
        ? 'complete'
        : 'active'
    const lineStatus: PublishStageStatus = (!soundStepComplete || stageSignal.length > 0)
      ? 'locked'
      : channelsConfirmed
        ? 'complete'
        : 'active'
    const goliveStatus: PublishStageStatus = isLive
      ? 'live'
      : isActivating
        ? 'active'
        : !publishDisabled
          ? 'armed'
          : 'locked'

    const stages: PublishStageDescriptor[] = [
      { id: 'stage', label: 'STAGE', recap: stageRecap, status: stageStatus, blockers: stageHost },
      { id: 'instruments', label: 'INSTRUMENTS', recap: instrumentsRecap, status: instrumentsStatus, blockers: stageInstruments },
      { id: 'signal', label: 'SIGNAL CHECK', recap: signalRecap, status: signalStatus, blockers: stageSignal },
      { id: 'line', label: 'LINE CHECK', recap: lineRecap, status: lineStatus, blockers: stageLine },
      { id: 'golive', label: 'GO LIVE', recap: goliveRecap, status: goliveStatus, blockers: [] },
    ]

    const activeStageId: PublishStageId = stages.find((stage) => stage.status === 'active' || stage.status === 'armed')?.id
      ?? (isLive ? 'golive' : 'stage')

    const overallStatus: PublishStageMachine['overallStatus'] = isLive
      ? 'live'
      : isActivating
        ? 'publishing'
        : goliveStatus === 'armed'
          ? 'armed'
          : 'rehearsing'

    const overallLabel = isLive
      ? 'LIVE'
      : isActivating
        ? 'PUBLISHING'
        : goliveStatus === 'armed'
          ? 'ARMED'
          : 'REHEARSING'

    return { stages, activeStageId, overallStatus, overallLabel }
  }, [
    readiness,
    selectedHostId,
    saveStepComplete,
    hostStepComplete,
    soundStepComplete,
    isLive,
    isActivating,
    publishDisabled,
    channelsConfirmed,
  ])
}
