import React from 'react'

import type { IntelFXBlockState, IntelFXEffectBlockId } from './intelfxFlowRouting'

interface IntelFXFlowBlockCardProps {
  block: IntelFXBlockState
  selected: boolean
  onSelect: (effectType: IntelFXEffectBlockId) => void
  onBypassToggle: (blockIndex: number, shouldBypass: boolean) => void
}

export const IntelFXFlowBlockCard = React.memo(
  React.forwardRef<HTMLDivElement, IntelFXFlowBlockCardProps>(function IntelFXFlowBlockCard(
    { block, selected, onSelect, onBypassToggle },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`intelfx-flow-card${selected ? ' is-selected' : ''}${block.bypassed ? ' is-bypassed' : ''}`}
        style={{ '--block-accent': block.color } as React.CSSProperties}
        onClick={() => onSelect(block.effectType)}
        role="button"
        tabIndex={0}
        aria-label={`${block.label}${block.bypassed ? ', bypassed' : ''}`}
        aria-pressed={selected}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(block.effectType)
          }
        }}
      >
        <div className="intelfx-flow-card__header">
          <span className="intelfx-flow-card__dot" aria-hidden />
          <span className="intelfx-flow-card__name">{block.label}</span>
          <button
            type="button"
            className={`intelfx-flow-card__bypass-btn${block.bypassed ? ' is-bypassed' : ''}`}
            title={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            aria-label={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            onClick={(e) => {
              e.stopPropagation()
              onBypassToggle(block.blockIndex, !block.bypassed)
            }}
          >
            {block.bypassed ? '\u2297' : '\u25CF'}
          </button>
        </div>

        {block.keyParamLabel && block.keyParamValue !== null && (
          <div className="intelfx-flow-card__key-param">
            {block.keyParamLabel}: {Math.round(block.keyParamValue)}
          </div>
        )}

        <div className="intelfx-flow-card__category">{block.category}</div>

        <div className="intelfx-flow-card__meter" aria-hidden>
          <div className="intelfx-flow-card__meter-fill" style={{ width: '0%' }} />
        </div>
      </div>
    )
  }),
)

IntelFXFlowBlockCard.displayName = 'IntelFXFlowBlockCard'
