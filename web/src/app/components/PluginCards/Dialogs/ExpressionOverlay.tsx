import { ArrowLeft, ArrowsHorizontal } from '@carbon/icons-react'
import { ExpressionView, type CcChannelPair } from '../../../pages/ExpressionPage'

interface ExpressionOverlayProps {
  onBack: () => void
  highlightedCcPairs: CcChannelPair[]
  initialCc: number | null
  initialChannel: number | null
  onAssignmentMutated: () => void
}

export function ExpressionOverlay({
  onBack,
  highlightedCcPairs,
  initialCc,
  initialChannel,
  onAssignmentMutated,
}: ExpressionOverlayProps) {
  return (
    <div className="expr-overlay">
      <div className="expr-overlay-header">
        <button className="expr-overlay-back" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>Back to MIDI Mappings</span>
        </button>
        <span className="expr-overlay-title">
          <ArrowsHorizontal size={15} />
          Expression Mappings
        </span>
      </div>
      <div className="expr-overlay-body">
        <ExpressionView
          highlightedCcPairs={highlightedCcPairs}
          initialCc={initialCc}
          initialChannel={initialChannel}
          onAssignmentMutated={onAssignmentMutated}
        />
      </div>

      <style>{`
        .expr-overlay {
          position: absolute;
          inset: 0;
          z-index: 10;
          background: #111111;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .expr-overlay-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
        }

        .expr-overlay-back {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          background: transparent;
          color: #9ca3af;
          font-family: var(--font-ui);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .expr-overlay-back:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f2f6ff;
          border-color: rgba(255, 255, 255, 0.2);
        }

        .expr-overlay-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-ui);
          font-size: 14px;
          font-weight: 600;
          color: #f2f6ff;
        }

        .expr-overlay-title svg {
          color: #009d9a;
        }

        .expr-overlay-body {
          flex: 1;
          overflow: hidden;
          position: relative;
        }
      `}</style>
    </div>
  )
}
