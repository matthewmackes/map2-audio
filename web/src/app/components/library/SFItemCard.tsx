import { FileMusic } from 'lucide-react'
import type { SoundFont } from '../../types/library'

interface SFItemCardProps {
  soundfont: SoundFont
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FORMAT_COLORS: Record<string, string> = {
  sf2: 'var(--primary)',
  sfz: 'var(--accent)',
}

export function SFItemCard({ soundfont }: SFItemCardProps) {
  const formatColor = FORMAT_COLORS[soundfont.format] ?? 'var(--muted)'

  return (
    <div className="model-item">
      <div className="model-item-info">
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <FileMusic size={16} style={{ color: 'var(--muted)' }} />
          <div className="model-item-name">{soundfont.name}</div>
        </div>
        <div className="model-item-meta">
          <span
            className="badge"
            style={{
              background: formatColor,
              color: '#fff',
              marginRight: 8,
              textTransform: 'uppercase',
              fontSize: 10,
            }}
          >
            {soundfont.format}
          </span>
          {soundfont.category && (
            <span style={{ marginRight: 8, color: 'var(--muted)' }}>
              {soundfont.category}
            </span>
          )}
          {soundfont.size > 0 && formatSize(soundfont.size)}
        </div>
      </div>
    </div>
  )
}
