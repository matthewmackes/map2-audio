/**
 * MPX1PerformView — performance mode: scene grid + morph strip (T038).
 */

import React from 'react'

import { MPX1ScenePanel } from '../MPX1ScenePanel'

export function MPX1PerformView() {
  return (
    <div style={{ height: '100%', padding: '16px 20px', overflowY: 'auto', boxSizing: 'border-box' }}>
      <MPX1ScenePanel />
    </div>
  )
}
