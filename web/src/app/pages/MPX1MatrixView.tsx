import React from 'react'

import { MPX1ModMatrix } from '../components/MPX1/MPX1ModMatrix'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'

export function MPX1MatrixView() {
  return (
    <>
      <LandscapePrompt componentId="mpx1-matrix" />
      <MPX1ModMatrix />
    </>
  )
}
