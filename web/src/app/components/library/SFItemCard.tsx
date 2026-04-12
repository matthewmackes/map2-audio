import { Document } from '@carbon/icons-react'
import { Tag } from '@carbon/react'
import type { SoundFont } from '../../types/library'
import './ModelList.css'

interface SFItemCardProps {
  soundfont: SoundFont
  availabilityLabel?: string
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FORMAT_COLORS: Record<string, string> = {
  sf2: 'blue',
  sfz: 'purple',
}

export function SFItemCard({ soundfont, availabilityLabel }: SFItemCardProps) {
  const formatColor = FORMAT_COLORS[soundfont.format] ?? 'cool-gray'

  return (
    <div className="model-item">
      <div className="model-item-info">
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <Document size={16} style={{ color: 'var(--muted)' }} />
          <div className="model-item-name">{soundfont.name}</div>
        </div>
        <div className="model-item-meta">
          <Tag type={formatColor as 'blue' | 'purple' | 'cool-gray'} size="sm">
            {soundfont.format}
          </Tag>
          {soundfont.category && (
            <span style={{ marginRight: 8, color: 'var(--muted)' }}>
              {soundfont.category}
            </span>
          )}
          {soundfont.size > 0 && formatSize(soundfont.size)}
        </div>
        {availabilityLabel && (
          <div className="model-item-meta">{availabilityLabel}</div>
        )}
      </div>
    </div>
  )
}
