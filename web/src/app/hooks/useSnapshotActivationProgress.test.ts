// T2534: unit tests for the realtime activation-progress reducer.
import {
  EMPTY_ACTIVATION_RUN,
  reduceActivationStep,
} from './useSnapshotRuntimeState'
import type { SnapshotActivationStepEvent } from '../../map2/types'

let nextIndex = 0

function step(
  partial: Partial<SnapshotActivationStepEvent> & {
    step: string
    status: SnapshotActivationStepEvent['status']
  },
): SnapshotActivationStepEvent {
  nextIndex += 1
  return {
    kind: 'activation_step',
    request_id: 'req-1',
    snapshot_id: 42,
    node_id: 'NODE-A',
    phase: 'STAGING',
    index: nextIndex,
    subsystem: null,
    elapsed_ms: null,
    warming: false,
    warming_subsystem: null,
    note: null,
    at: new Date().toISOString(),
    ...partial,
  }
}

function reduceAll(events: SnapshotActivationStepEvent[]) {
  return events.reduce(reduceActivationStep, EMPTY_ACTIVATION_RUN)
}

describe('reduceActivationStep', () => {
  beforeEach(() => {
    nextIndex = 0
  })

  it('keeps only the latest frame per step, preserving first-seen order', () => {
    const run = reduceAll([
      step({ step: 'preflight', status: 'started' }),
      step({ step: 'preflight', status: 'completed', elapsed_ms: 12 }),
      step({ step: 'audio_device_bindings', status: 'started' }),
    ])

    expect(run.order).toEqual(['preflight', 'audio_device_bindings'])
    expect(run.byStep.preflight.status).toBe('completed')
    expect(run.byStep.preflight.elapsed_ms).toBe(12)
  })

  it('starts a fresh run when the request_id changes', () => {
    const first = reduceAll([step({ step: 'preflight', status: 'completed' })])
    const second = reduceActivationStep(
      first,
      step({ request_id: 'req-2', snapshot_id: 99, step: 'preflight', status: 'started' }),
    )

    expect(second.requestId).toBe('req-2')
    expect(second.snapshotId).toBe(99)
    expect(second.order).toEqual(['preflight'])
    expect(second.byStep.preflight.status).toBe('started')
  })

  it('flags terminal+failed on a failed step', () => {
    const run = reduceAll([
      step({ step: 'engine_graph_apply', status: 'started' }),
      step({ step: 'engine_graph_apply', status: 'failed' }),
    ])
    expect(run.failed).toBe(true)
    expect(run.terminal).toBe(true)
  })

  it('marks terminal once authority_confirm completes in VERIFYING', () => {
    const run = reduceAll([
      step({ phase: 'VERIFYING', step: 'authority_confirm', status: 'started' }),
      step({ phase: 'VERIFYING', step: 'authority_confirm', status: 'completed' }),
    ])
    expect(run.terminal).toBe(true)
    expect(run.failed).toBe(false)
  })

  it('surfaces a warming step until it completes', () => {
    const warming = reduceAll([
      step({
        step: 'engine_graph_apply',
        status: 'warming',
        warming: true,
        subsystem: 'engine',
        warming_subsystem: 'engine',
      }),
    ])
    const warmingStep = warming.byStep.engine_graph_apply
    expect(warmingStep.warming).toBe(true)
    expect(warmingStep.warming_subsystem).toBe('engine')

    const settled = reduceActivationStep(
      warming,
      step({ step: 'engine_graph_apply', status: 'completed', warming: false, subsystem: 'engine' }),
    )
    expect(settled.byStep.engine_graph_apply.status).toBe('completed')
    expect(settled.byStep.engine_graph_apply.warming).toBe(false)
  })
})
