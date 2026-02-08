import { useState } from 'react'
import { CELESTIAL_PRESETS } from './presets'
import { ERA_LABELS, ERA_ORDER, TOPOLOGY_LABELS, TOPOLOGY_COLORS } from './types'
import type { CelestialPreset, EraGroup } from './types'

interface ArtistGridProps {
  selectedPresetId: string | null
  onSelectPreset: (preset: CelestialPreset) => void
}

export function ArtistGrid({ selectedPresetId, onSelectPreset }: ArtistGridProps) {
  const [activeEra, setActiveEra] = useState<EraGroup>('pioneers')

  const presetsForEra = CELESTIAL_PRESETS.filter(p => p.eraGroup === activeEra)

  return (
    <div className="celestial-artist-grid">
      {/* Era tabs */}
      <div className="celestial-era-tabs">
        {ERA_ORDER.map(era => (
          <button
            key={era}
            className={`celestial-era-tab ${activeEra === era ? 'active' : ''}`}
            onClick={() => setActiveEra(era)}
          >
            {ERA_LABELS[era]}
            <span className="celestial-era-count">{CELESTIAL_PRESETS.filter(p => p.eraGroup === era).length}</span>
          </button>
        ))}
      </div>

      {/* Artist buttons */}
      <div className="celestial-artist-buttons">
        {presetsForEra.map(preset => {
          const isActive = selectedPresetId === preset.id
          const topoColor = TOPOLOGY_COLORS[preset.topology]

          return (
            <button
              key={preset.id}
              className={`celestial-artist-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectPreset(preset)}
              style={{
                '--artist-topo-color': topoColor,
                '--artist-border': isActive ? topoColor : 'transparent',
              } as React.CSSProperties}
            >
              <div className="celestial-artist-btn-top">
                <span className="celestial-artist-name">{preset.name}</span>
                <span className="celestial-artist-year">~{preset.year}</span>
              </div>
              <div className="celestial-artist-btn-bottom">
                <span
                  className="celestial-topology-pill"
                  style={{ background: topoColor }}
                >
                  {TOPOLOGY_LABELS[preset.topology]}
                </span>
                <span className="celestial-confidence-badge" title={`Confidence: ${preset.confidence}-tier`}>
                  {preset.confidence}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
