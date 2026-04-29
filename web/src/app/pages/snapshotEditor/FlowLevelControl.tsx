// FlowLevelControl — per-flow signal-chain level slider with a
// segmented-LED readout overlay. Extracted from
// SnapshotEditorPageContent (T2469). Self-contained leaf component
// that consumes only its props and the canonical NumberInput +
// SegmentedLedText primitives.

import { NumberInput } from '../../components/ParameterControl'
import { SegmentedLedText } from '../../components/Displays/SegmentedLedText'
import type { FlowLevelControlProps } from './snapshotEditorPageTypes'

export function FlowLevelControl({
  flowId,
  flowLabel,
  value,
  onChange,
  disabled = false,
}: FlowLevelControlProps) {
  const clampedValue = Math.max(0, Math.min(100, Math.round(value)))
  const levelLabel = `Signal chain ${flowLabel} level`

  return (
    <div
      className="juce-grid-page__flow-level-shell"
      data-testid={`juce-grid-flow-level-${flowId}`}
      title={`${levelLabel}: ${clampedValue}%`}
    >
      <NumberInput
        label={levelLabel}
        value={clampedValue}
        min={0}
        max={100}
        step={1}
        defaultValue={100}
        valueFormatter={(nextValue) => `${Math.round(nextValue)}%`}
        displayOverlay={(
          <div className="juce-grid-page__flow-level-overlay">
            <SegmentedLedText
              value={`${clampedValue}%`}
              size="md"
              color="var(--juce-grid-midi-led-color, #78a9ff)"
              className="juce-grid-page__flow-level-readout"
            />
          </div>
        )}
        onChange={onChange}
        size="small"
        showLabel={false}
        showBounds={false}
        accentColor="var(--juce-grid-midi-led-color, #78a9ff)"
        disabled={disabled}
        className="juce-grid-page__flow-level-input"
      />
    </div>
  )
}

export default FlowLevelControl
