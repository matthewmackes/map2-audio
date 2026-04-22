import React from 'react'

import { MPX1ModMatrix } from '../MPX1ModMatrix'
import { LandscapePrompt } from '../../../shared/LandscapePrompt'

export function MPX1MatrixView() {
  return (
    <>
      <LandscapePrompt componentId="mpx1-matrix" />
      <MPX1ModMatrix />
    </>
  )
}
