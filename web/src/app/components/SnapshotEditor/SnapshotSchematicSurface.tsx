import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'

import './SnapshotSchematicSurface.css'

export type SnapshotSchematicTone = 'active' | 'idle' | 'warning' | 'error'

interface SnapshotSchematicPanelProps {
  title: string
  description: string
  statusLabel: string
  statusTone?: SnapshotSchematicTone
  meta?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function SnapshotSchematicPanel({
  title,
  description,
  statusLabel,
  statusTone = 'idle',
  meta,
  children,
  footer,
  className,
}: SnapshotSchematicPanelProps) {
  const panelClassName = ['snapshot-schematic-panel', className].filter(Boolean).join(' ')

  return (
    <Tile className={panelClassName} data-tone={statusTone}>
      <div className="snapshot-schematic-panel__header">
        <div className="snapshot-schematic-panel__copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="snapshot-schematic-panel__status" aria-label={`Status: ${statusLabel}`}>
          <SnapshotSchematicLed tone={statusTone} />
          <span>{statusLabel}</span>
        </div>
      </div>

      {meta ? <div className="snapshot-schematic-panel__meta">{meta}</div> : null}

      <div className="snapshot-schematic-panel__body">{children}</div>

      {footer ? <div className="snapshot-schematic-panel__footer">{footer}</div> : null}
    </Tile>
  )
}

interface SnapshotSchematicReadoutProps {
  label: string
  value: string
  tone?: SnapshotSchematicTone
}

export function SnapshotSchematicReadout({
  label,
  value,
  tone = 'idle',
}: SnapshotSchematicReadoutProps) {
  return (
    <div className="snapshot-schematic-readout" data-tone={tone} aria-label={`${label}: ${value}`}>
      <span className="snapshot-schematic-readout__label">{label}</span>
      <span className="snapshot-schematic-readout__value">{value}</span>
    </div>
  )
}

interface SnapshotSchematicLedProps {
  tone?: SnapshotSchematicTone
}

export function SnapshotSchematicLed({ tone = 'idle' }: SnapshotSchematicLedProps) {
  return <span className="snapshot-schematic-led" data-tone={tone} aria-hidden="true" />
}
