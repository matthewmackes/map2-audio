/**
 * T2454 slice 1C — Go Live preload gate decision helper.
 *
 * Pure decider for the warm-cache cold-gate logic in `handleGoLive`. Returns
 * one of three actions for the editor to take before kicking off activation:
 *
 *   - `passthrough`: not pinned (or already warm), fire activation immediately.
 *   - `warm-then-activate`: pinned + cold, fire `preloadNow()` first, then
 *     activate when warming resolves (or fails — fall back to cold rebuild).
 *
 * Pure function so the editor's giant component file can stay testable
 * without spinning up the full TanStack Query + WS harness.
 */

export type PreloadGateAction = 'passthrough' | 'warm-then-activate'

export interface PreloadGateInput {
  isPinned: boolean
  isWarm: boolean
}

export function decidePreloadGate(input: PreloadGateInput): PreloadGateAction {
  if (input.isPinned && !input.isWarm) {
    return 'warm-then-activate'
  }
  return 'passthrough'
}
