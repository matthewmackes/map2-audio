/**
 * TagBadge Component
 *
 * Simple inline tag display for showing plugin tags in lists.
 */

import { Tag } from '@carbon/react'

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
      className={`tag-badge-container${onClick ? ' clickable' : ''}`}
      onClick={onClick}
    >
      {displayTags.map((tag) => (
        <Tag key={tag} className="tag-badge" size="sm" type="cool-gray">
          {tag}
        </Tag>
      ))}
      {remaining > 0 ? (
        <Tag className="tag-badge" size="sm" type="warm-gray">
          +{remaining}
        </Tag>
      ) : null}

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
          filter: brightness(0.97);
        }

        .tag-badge.cds--tag {
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

export default TagBadge
