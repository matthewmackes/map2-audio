/**
 * T2489 — single-view console under
 * /midi/devices/ableton-push-3/console.
 *
 * Composes the DeviceLandingHeader (T2485-1, manifest-driven title +
 * 3-line purpose) above the existing PushSurfacePage body. Path A:
 * the page's heavy interactivity (hotspot grid, color editing,
 * routine builder, drag/drop) lives in one tightly-coupled component
 * with shared internal state. Forcing it apart would require lifting
 * dozens of state shards into a parent shell with no operator
 * benefit.
 *
 * Helper extraction (constants, draft builders, color tables, etc.)
 * is queued as a separate follow-up if maintenance burden actually
 * demands it; this iter ships the unified-mount migration so the
 * directory parity in /midi/devices/* is achieved.
 */

import { DeviceLandingHeader } from '../Shared/DeviceLandingHeader'
import { pushSurfaceDeviceManifest } from './deviceManifest'
import { PushSurfacePage } from '../../../pages/PushSurfacePage'

export function PushSurfaceConsoleView() {
  return (
    <>
      <DeviceLandingHeader manifest={pushSurfaceDeviceManifest} />
      <PushSurfacePage />
    </>
  )
}

export default PushSurfaceConsoleView
