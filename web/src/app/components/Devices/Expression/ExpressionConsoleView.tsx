/**
 * T2487-3 — single-view console under /midi/devices/expression/console.
 *
 * Composes the DeviceLandingHeader (T2485-1, manifest-driven title +
 * 3-line purpose) above the integrated 3-column ExpressionView body
 * (T2487 Path A: no view-tab split because the columns are
 * interdependent — selecting a row in column 1 drives the form +
 * live monitor).
 */

import { DeviceLandingHeader } from '../Shared/DeviceLandingHeader'
import { expressionDeviceManifest } from './deviceManifest'
import { ExpressionView } from './ExpressionView'

export function ExpressionConsoleView() {
  return (
    <>
      <DeviceLandingHeader manifest={expressionDeviceManifest} />
      <ExpressionView />
    </>
  )
}

export default ExpressionConsoleView
