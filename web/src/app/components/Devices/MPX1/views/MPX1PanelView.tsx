import React from 'react'

import { MPX1Panel } from '../MPX1Panel'
import { LandscapePrompt } from '../../../shared/LandscapePrompt'
import { DeviceLandingHeader } from '../../Shared/DeviceLandingHeader'
import { mpx1DeviceManifest } from '../deviceManifest'

export function MPX1PanelView() {
  return (
    <>
      <LandscapePrompt componentId="mpx1-panel" />
      <DeviceLandingHeader manifest={mpx1DeviceManifest} />
      <MPX1Panel />
    </>
  )
}
