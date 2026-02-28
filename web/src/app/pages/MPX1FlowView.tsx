/**
 * MPX1FlowView — thin route wrapper for the Signal Flow Canvas (/mpx1/flow).
 *
 * The canvas fills the full available height with no extra padding so the
 * flow canvas can use all the vertical space (unlike other views that scroll).
 */

import React from 'react'

import { MPX1FlowCanvas } from '../components/MPX1/MPX1FlowCanvas'

export function MPX1FlowView() {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <MPX1FlowCanvas />
    </div>
  )
}
