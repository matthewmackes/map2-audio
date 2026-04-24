import { computeLiveBadgeState } from './useSnapshotReconciliation'
import type { SnapshotRuntimeReconciliationReport } from '../../map2/types'

function report(overrides: Partial<SnapshotRuntimeReconciliationReport['reconciliation']> = {}, snapshotId: number | null = 1): SnapshotRuntimeReconciliationReport {
  return {
    snapshot_id: snapshotId,
    reconciliation: {
      checked_at: '2026-04-24T00:00:00Z',
      tolerance: 0.001,
      status: 'ok',
      desired_plugin_count: 2,
      observed_plugin_count: 2,
      topology_drift: false,
      parameter_drift_count: 0,
      bypass_drift_count: 0,
      missing_asset_count: 0,
      correction_count: 0,
      reactivation_required: false,
      asset_redeploy_required: false,
      applied_corrections: false,
      drift_items: [],
      ...overrides,
    },
  }
}

describe('computeLiveBadgeState (T2450)', () => {
  test('publishing while activation is running', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: true,
        activationFailed: false,
        report: report(),
      }),
    ).toBe('publishing')
  })

  test('engine_desync when activation failed', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: true,
        report: report(),
      }),
    ).toBe('engine_desync')
  })

  test('live_confirmed when reconciliation is clean and ids match', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report(),
      }),
    ).toBe('live_confirmed')
  })

  test('engine_desync when snapshot id mismatch', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report({}, 2),
      }),
    ).toBe('engine_desync')
  })

  test('engine_desync on topology drift', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report({ topology_drift: true }),
      }),
    ).toBe('engine_desync')
  })

  test('engine_desync on parameter drift', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report({ parameter_drift_count: 3 }),
      }),
    ).toBe('engine_desync')
  })

  test('applied_corrections is still treated as agreement', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report({ status: 'applied_corrections' }),
      }),
    ).toBe('live_confirmed')
  })

  test('publishing when reconciliation has not run yet', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: report({ status: 'not_run' }),
      }),
    ).toBe('publishing')
  })

  test('idle when there is no report yet', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: 1,
        isActivating: false,
        activationFailed: false,
        report: null,
      }),
    ).toBe('idle')
  })

  test('idle when no expected snapshot id', () => {
    expect(
      computeLiveBadgeState({
        expectedSnapshotId: null,
        isActivating: false,
        activationFailed: false,
        report: report(),
      }),
    ).toBe('idle')
  })
})
