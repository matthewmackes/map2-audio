import React from 'react'

import type { BlockRoutingState } from './mpx1FlowRouting'

interface MPX1FlowBlockCardProps {
  block: BlockRoutingState
  selected: boolean
  level?: number   // 0..1 normalized level for the meter strip
  onSelect: (blockIndex: number) => void
  onBypassToggle: (blockIndex: number, shouldBypass: boolean) => void
}

export const MPX1FlowBlockCard = React.forwardRef<HTMLDivElement, MPX1FlowBlockCardProps>(
  function MPX1FlowBlockCard({ block, selected, level = 0, onSelect, onBypassToggle }, ref) {
    const safeLevel = Math.min(1, Math.max(0, level))

    return (
      <div
        ref={ref}
        className={`mpx1-flow-card${selected ? ' is-selected' : ''}${block.bypassed ? ' is-bypassed' : ''}`}
        style={{ '--block-accent': block.color } as React.CSSProperties}
        onClick={() => onSelect(block.blockIndex)}
        role="button"
        tabIndex={0}
        aria-label={`${block.label} — ${block.algorithmName}${block.bypassed ? ', bypassed' : ''}`}
        aria-pressed={selected}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(block.blockIndex)
          }
        }}
      >
        <div className="mpx1-flow-card__header">
          <span className="mpx1-flow-card__dot" aria-hidden />
          <span className="mpx1-flow-card__name">{block.label}</span>
          <button
            type="button"
            className={`mpx1-flow-card__bypass-btn${block.bypassed ? ' is-bypassed' : ''}`}
            title={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            aria-label={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            onClick={(e) => {
              e.stopPropagation()
              onBypassToggle(block.blockIndex, !block.bypassed)
            }}
          >
            {block.bypassed ? '⊗' : '●'}
          </button>
        </div>

        <div className="mpx1-flow-card__algo">{block.algorithmName}</div>

        <div className="mpx1-flow-card__meter" aria-hidden>
          <div
            className="mpx1-flow-card__meter-fill"
            style={{ width: `${safeLevel * 100}%` }}
          />
        </div>
      </div>
    )
  },
)
