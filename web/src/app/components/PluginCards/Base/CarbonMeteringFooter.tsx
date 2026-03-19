/**
 * CarbonMeteringFooter — Standardized metering footer for all cards
 *
 * Displays IN, GR (optional), and OUT levels with clipping indicator.
 */

import { Tag } from '@carbon/react'

interface MeterValue {
  label: string
  value: number
  /** Additional CSS class for the value */
  className?: string
}

interface CarbonMeteringFooterProps {
  inputLevel?: number
  outputLevel?: number
  gainReduction?: number
  clipping?: boolean
  /** Extra meters to display */
  extraMeters?: MeterValue[]
}

export function CarbonMeteringFooter({
  inputLevel,
  outputLevel,
  gainReduction,
  clipping = false,
  extraMeters,
}: CarbonMeteringFooterProps) {
  return (
    <>
      {inputLevel !== undefined && (
        <div className="carbon-card-footer-meter">
          <span className="carbon-card-footer-meter-label">IN</span>
          <span className="carbon-card-footer-meter-value">
            {inputLevel.toFixed(1)} dB
          </span>
        </div>
      )}

      {gainReduction !== undefined && (
        <div className="carbon-card-footer-meter">
          <span className="carbon-card-footer-meter-label">GR</span>
          <span className="carbon-card-footer-meter-value gain-reduction">
            {gainReduction.toFixed(1)} dB
          </span>
        </div>
      )}

      {extraMeters?.map(meter => (
        <div key={meter.label} className="carbon-card-footer-meter">
          <span className="carbon-card-footer-meter-label">{meter.label}</span>
          <span className={`carbon-card-footer-meter-value ${meter.className || ''}`}>
            {meter.value.toFixed(1)} dB
          </span>
        </div>
      ))}

      {outputLevel !== undefined && (
        <div className="carbon-card-footer-meter">
          <span className="carbon-card-footer-meter-label">OUT</span>
          <span className={`carbon-card-footer-meter-value ${clipping ? 'clipping' : ''}`}>
            {outputLevel.toFixed(1)} dB
          </span>
        </div>
      )}

      {clipping && (
        <Tag type="red" size="sm">CLIP</Tag>
      )}
    </>
  )
}

export default CarbonMeteringFooter
