/**
 * TagBadge Component
 *
 * Simple inline tag display for showing plugin tags in lists.
 */

interface TagBadgeProps {
  tags: string[]
  maxDisplay?: number
  onClick?: () => void
}

export function TagBadge({ tags, maxDisplay = 3, onClick }: TagBadgeProps) {
  if (!tags || tags.length === 0) return null

  const displayTags = tags.slice(0, maxDisplay)
  const remaining = tags.length - maxDisplay

  return (
    <div
      className={`tag-badge-container ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      {displayTags.map(tag => (
        <span key={tag} className="tag-badge">
          {tag}
        </span>
      ))}
      {remaining > 0 && (
        <span className="tag-badge more">+{remaining}</span>
      )}

      <style>{`
        .tag-badge-container {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }

        .tag-badge-container.clickable {
          cursor: pointer;
        }

        .tag-badge-container.clickable:hover .tag-badge {
          background: #444;
        }

        .tag-badge {
          display: inline-block;
          background: #333;
          border-radius: 3px;
          padding: 2px 6px;
          font-size: 10px;
          color: #aaa;
          white-space: nowrap;
        }

        .tag-badge.more {
          background: #2a2a2a;
          color: #666;
        }
      `}</style>
    </div>
  )
}

export default TagBadge
