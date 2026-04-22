/**
 * MPX1FlowView — thin route wrapper for the MPX1 signal path canvas (/mpx1/flow).
 *
 * The canvas fills the full available height with no extra padding so the
 * signal path canvas can use all the vertical space (unlike other views that scroll).
 */

import React from 'react'

import { MPX1SignalPathCanvas } from '../MPX1SignalPathCanvas'
import { LandscapePrompt } from '../../../shared/LandscapePrompt'

export function MPX1FlowView() {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <LandscapePrompt componentId="mpx1-flow" />
      <MPX1SignalPathCanvas />
    </div>
  )
}
