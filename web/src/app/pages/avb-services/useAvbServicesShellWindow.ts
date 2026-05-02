/**
 * T2490-1 — shared shell-window helper for AvbServices sibling pages.
 *
 * Mirrors the MidiServices helper. One call per region page keeps the
 * top-of-shell kicker accurate as the operator navigates without
 * duplicating useSetShellWindow boilerplate across 6 sub-pages.
 */

import { useSetShellWindow } from '../../layout/useSetShellWindow'

export function useAvbServicesShellWindow(region: string, subtitle: string): void {
  useSetShellWindow(
    {
      subtitle,
      kicker: `Platform / AVB Services / ${region}`,
    },
    [region, subtitle],
  )
}
