import { ChevronLeft, ChevronRight, Redo, Undo, ZoomIn, ZoomOut, ZoomReset } from '@carbon/icons-react'
import { Button } from '@carbon/react'

import { formatIntelFXProgramName, formatIntelFXProgramNumber } from './programNumber'

interface IntelFXFlowToolbarProps {
  currentProgram: number
  programName: string
  onProgramStep: (delta: number) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

export function IntelFXFlowToolbar({
  currentProgram,
  programName,
  onProgramStep,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: IntelFXFlowToolbarProps) {
  const displayName = formatIntelFXProgramName(currentProgram, programName)

  return (
    <div className="intelfx-flow-toolbar" role="toolbar" aria-label="Signal Flow controls">
      <div className="intelfx-flow-toolbar__program">
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={ChevronLeft}
          iconDescription="Previous program"
          onClick={() => onProgramStep(-1)}
        />
        <span className="intelfx-flow-toolbar__prog-num">
          {formatIntelFXProgramNumber(currentProgram)}
        </span>
        <span className="intelfx-flow-toolbar__prog-name" title={displayName}>
          {displayName}
        </span>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={ChevronRight}
          iconDescription="Next program"
          onClick={() => onProgramStep(1)}
        />
      </div>

      <div className="intelfx-flow-toolbar__sep" aria-hidden />

      <div className="intelfx-flow-toolbar__group">
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={Undo}
          iconDescription="Undo"
          onClick={onUndo}
          disabled={!canUndo}
        />
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={Redo}
          iconDescription="Redo"
          onClick={onRedo}
          disabled={!canRedo}
        />
      </div>

      <div className="intelfx-flow-toolbar__spacer" />

      <div className="intelfx-flow-toolbar__zoom">
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={ZoomOut}
          iconDescription="Zoom out"
          onClick={onZoomOut}
        />
        <span className="intelfx-flow-toolbar__zoom-level">{Math.round(zoom * 100)}%</span>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={ZoomIn}
          iconDescription="Zoom in"
          onClick={onZoomIn}
        />
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-toolbar__btn"
          renderIcon={ZoomReset}
          iconDescription="Reset zoom"
          onClick={onZoomReset}
        />
      </div>
    </div>
  )
}

export default IntelFXFlowToolbar
