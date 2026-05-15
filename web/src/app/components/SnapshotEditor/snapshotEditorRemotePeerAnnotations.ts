/**
 * T2521-7 cycle 35 — remote-peer annotation helpers for the
 * SnapshotEditor routing visualizer.
 *
 * Computes `remoteInput` / `remoteOutput` flags for each Flow's
 * `JuceGridRoutingFlowInfo` from the chain-side I/O binding state
 * the publish-page I/O panel now writes (cycle 34). The visualizer
 * picks these flags up and renders a "SonoBus" badge next to the
 * Input or Output marker label.
 *
 * Today (cycle 35) the helpers operate against a frontend-local
 * binding shape because the audio routing payload doesn't carry
 * sonobus peer IDs yet — the backend persistence step is the
 * T2521-4 daemon follow-on. The contract stays stable: once the
 * routing response includes a `sonobus_input_peers` /
 * `sonobus_output_peers` field, the same helper functions consume
 * it without changing the visualizer.
 */

import { isSonoBusInterfaceId } from './sonoBusInterfaceIdGuards'

/**
 * Chain-level I/O binding shape. Mirrors the publish-page I/O
 * panel's state model.
 */
export interface ChainRemoteIoBinding {
  /** Chain identifier the binding belongs to. */
  chainId: number
  /**
   * Interface IDs the operator selected on the Inputs tab for this
   * chain. Typically a mix of `pipewire:`, `avb:`, `cluster:`, and
   * (newly) `sonobus:` IDs.
   */
  inputInterfaceIds: readonly string[]
  /** Same shape on the Outputs side. */
  outputInterfaceIds: readonly string[]
}

/**
 * Returns `true` when any of the chain's input interface IDs is a
 * SonoBus peer ID (i.e., matches the canonical
 * `sonobus:<peer>:<group>:<stream>` shape).
 */
export function chainHasSonoBusInput(binding: ChainRemoteIoBinding | null | undefined): boolean {
  if (!binding) return false
  return binding.inputInterfaceIds.some(isSonoBusInterfaceId)
}

/** Mirror predicate for the output side. */
export function chainHasSonoBusOutput(binding: ChainRemoteIoBinding | null | undefined): boolean {
  if (!binding) return false
  return binding.outputInterfaceIds.some(isSonoBusInterfaceId)
}

/**
 * Convenience: derive the `{ remoteInput, remoteOutput }` flag
 * pair the visualizer's `JuceGridRoutingFlowInfo` expects.
 */
export function deriveRemotePeerFlags(binding: ChainRemoteIoBinding | null | undefined): {
  remoteInput: boolean
  remoteOutput: boolean
} {
  return {
    remoteInput: chainHasSonoBusInput(binding),
    remoteOutput: chainHasSonoBusOutput(binding),
  }
}
