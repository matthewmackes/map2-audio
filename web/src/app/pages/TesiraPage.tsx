import React from 'react'
import { Layer } from '@carbon/react'

import { TesiraApp } from '../components/Tesira/TesiraApp'
import './TesiraPage.css'

export function TesiraPage() {
  return (
    <section className="tesira-page">
      <Layer className="tesira-page__surface">
        <TesiraApp />
      </Layer>
    </section>
  )
}
