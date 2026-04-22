import { Layer } from '@carbon/react'
import { TesiraApp } from './TesiraApp'
import './TesiraView.css'

export function TesiraView() {
  return (
    <section className="tesira-view">
      <Layer className="tesira-view__surface">
        <TesiraApp />
      </Layer>
    </section>
  )
}

export default TesiraView
