import { Tag, Tile } from '@carbon/react'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'

export function LegacyPage() {
  return (
    <div className="stack">
      <ShellWindowTitleStrip />
      <Tile>
        <div className="flex-between" style={{ gap: 16 }}>
          <div>
            <h3>Legacy dashboard</h3>
            <p className="subtitle">Legacy MAP2 UI is disabled in this build. Use the new Ariakit experience above.</p>
          </div>
          <Tag type="warm-gray">Temporarily unavailable</Tag>
        </div>
      </Tile>
    </div>
  )
}
