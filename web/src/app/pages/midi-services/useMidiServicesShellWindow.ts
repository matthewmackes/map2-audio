/**
 * T2483 loop 16 / iter 155 — shared shell-window helper for MidiServices
 *   sibling pages.
 *
 * Per the iter-151 plan D3: one shared helper, not 7 copies of the
 * useSetShellWindow boilerplate. Each sibling page calls
 * `useMidiServicesShellWindow('Network', 'subtitle text')` once.
 *
 * Closes the loop-13 + loop-14 acknowledged limitation that the
 * shell-window kicker showed the previous page's region until the
 * operator navigated again.
 */

import { useSetShellWindow } from '../../layout/useSetShellWindow'

export function useMidiServicesShellWindow(region: string, subtitle: string): void {
  useSetShellWindow(
    {
      subtitle,
      kicker: `Platform / MIDI Services / ${region}`,
    },
    [region, subtitle],
  )
}
