import { Layer, Tag, Tile } from '@carbon/react'
import type { MaschineLedState } from '../../../map2/types'

function toneForPad(state: string, color: string): string {
  if (state === 'on' && color === 'green') return 'maschine-page__pad--active'
  if (state === 'on' && color === 'amber') return 'maschine-page__pad--bypassed'
  if (state === 'off') return 'maschine-page__pad--empty'
  return 'maschine-page__pad--active'
}

export function MaschineLedPreviewPanel({ ledState }: { ledState: MaschineLedState | null }) {
  const pads = ledState?.pads ?? Array.from({ length: 16 }, (_, index) => ({
    index,
    state: 'off',
    color: 'empty',
    selected: false,
  }))

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-led-preview-panel">
      <div className="maschine-page__panel-head">
        <h2>LED Preview</h2>
        <Tag type="green">Live websocket</Tag>
      </div>
      <div className="maschine-page__pad-grid" role="list" aria-label="Maschine pad LED preview">
        {pads.map((pad) => (
          <Tile
            key={pad.index}
            className={`maschine-page__pad-tile ${toneForPad(pad.state, pad.color)} ${pad.selected ? 'maschine-page__pad--selected' : ''}`}
            role="listitem"
          >
            <span>P{pad.index + 1}</span>
          </Tile>
        ))}
      </div>
    </Layer>
  )
}

export default MaschineLedPreviewPanel
