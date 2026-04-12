import React from 'react'
import { Layer } from '@carbon/react'

import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { TesiraApp } from '../components/Tesira/TesiraApp'
import './TesiraPage.css'

export function TesiraPage() {
  return (
    <section className="tesira-page">
      <ShellWindowTitleStrip />
      <Layer className="tesira-page__surface">
        <TesiraApp />
      </Layer>
    </section>
  )
}
