import React from 'react'

import { MPX1Panel } from '../components/MPX1/MPX1Panel'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'

export function MPX1PanelView() {
  return (
    <>
      <LandscapePrompt componentId="mpx1-panel" />
      <MPX1Panel />
    </>
  )
}
