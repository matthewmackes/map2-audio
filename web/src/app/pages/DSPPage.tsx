/**
 * DSPPage - Digital Signal Processing Controls
 *
 * Dedicated page for built-in DSP processors:
 * - Dynamics: Compressor, Limiter, Noise Gate
 * - EQ: 8-band parametric equalizer
 */

import { useState } from 'react'
import { CompressorCard, LimiterCard, GateCard } from '../components/Dynamics'
import { EQCard } from '../components/EQ'

type ActiveSection = 'dynamics' | 'eq' | 'all'

export function DSPPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('all')

  return (
    <div className="dsp-page">
      <header className="page-header">
        <h1>DSP Processors</h1>
        <p className="page-subtitle">Built-in dynamics and EQ processing</p>
      </header>

      {/* Section Tabs */}
      <div className="section-tabs">
        <button
          className={`section-tab ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >
          All
        </button>
        <button
          className={`section-tab ${activeSection === 'dynamics' ? 'active' : ''}`}
          onClick={() => setActiveSection('dynamics')}
        >
          Dynamics
        </button>
        <button
          className={`section-tab ${activeSection === 'eq' ? 'active' : ''}`}
          onClick={() => setActiveSection('eq')}
        >
          EQ
        </button>
      </div>

      <div className="dsp-content">
        {/* Dynamics Section */}
        {(activeSection === 'all' || activeSection === 'dynamics') && (
          <section className="dsp-section">
            <h2 className="section-title">Dynamics</h2>
            <div className="dynamics-grid">
              <CompressorCard accentColor="#ff6644" />
              <LimiterCard accentColor="#ff4488" />
              <GateCard accentColor="#44aaff" />
            </div>
          </section>
        )}

        {/* EQ Section */}
        {(activeSection === 'all' || activeSection === 'eq') && (
          <section className="dsp-section">
            <h2 className="section-title">Parametric EQ</h2>
            <div className="eq-container">
              <EQCard accentColor="#44ff88" />
            </div>
          </section>
        )}
      </div>

      <style>{`
        .dsp-page {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .page-header h1 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #fff;
        }

        .page-subtitle {
          margin: 0;
          font-size: 14px;
          color: #888;
        }

        .section-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #333;
        }

        .section-tab {
          background: #222;
          border: 1px solid #444;
          border-radius: 6px;
          color: #888;
          font-size: 13px;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .section-tab:hover {
          background: #333;
          color: #fff;
        }

        .section-tab.active {
          background: #444;
          border-color: #666;
          color: #fff;
        }

        .dsp-content {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .dsp-section {
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 12px;
          padding: 20px;
        }

        .section-title {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 500;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .dynamics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .eq-container {
          width: 100%;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .dsp-page {
            padding: 16px;
          }

          .dynamics-grid {
            grid-template-columns: 1fr;
          }

          .section-tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </div>
  )
}

export default DSPPage
