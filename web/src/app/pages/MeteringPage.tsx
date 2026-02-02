/**
 * MeteringPage - Audio Metering & Analysis Dashboard
 *
 * Dedicated page for real-time audio analysis including:
 * - Spectrum analyzer
 * - Loudness meter (LUFS)
 * - CPU/DSP monitoring
 * - Latency display
 * - Phase correlation meter
 */

import { AudioMeteringCard } from '../components/Visualizations/AudioMeteringCard'

export function MeteringPage() {
  return (
    <div className="metering-page">
      <header className="page-header">
        <h1>Audio Metering</h1>
        <p className="page-subtitle">Real-time audio analysis and system monitoring</p>
      </header>

      <div className="metering-content">
        <AudioMeteringCard defaultExpanded={true} />
      </div>
    </div>
  )
}

export default MeteringPage
