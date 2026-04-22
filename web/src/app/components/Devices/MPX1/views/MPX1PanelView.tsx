import React from 'react'

import { MPX1Panel } from '../MPX1Panel'
import { LandscapePrompt } from '../../../shared/LandscapePrompt'

export function MPX1PanelView() {
  return (
    <>
      <LandscapePrompt componentId="mpx1-panel" />
      <MPX1Panel />
    </>
  )
}
