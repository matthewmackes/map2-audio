/**
 * DSPPage - Digital Signal Processing Controls
 *
 * Dedicated page for built-in DSP processors:
 * - Standalone Controls: Compressor, Limiter, Noise Gate, Parametric EQ
 * - Native JUCE Plugin Catalog: all built-in processors available in the Grid editor
 */

import { useState } from 'react'
import { Waves, Sliders, LayoutGrid, Timer, Music2, Zap, Guitar, Sparkles, Volume2, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CompressorCard, LimiterCard, GateCard } from '../components/Dynamics'
import { EQCard } from '../components/EQ'

type ActiveSection = 'dynamics' | 'eq' | 'catalog' | 'all'

// Native JUCE processors available in the Grid editor
const NATIVE_PLUGINS = [
  { uri: 'map2://juce/dynamics/compressor', name: 'Compressor', category: 'Dynamics', color: '#ff6644', standalone: true },
  { uri: 'map2://juce/dynamics/celestial', name: 'Celestial Compressor', category: 'Dynamics', color: '#c084fc', standalone: false },
  { uri: 'map2://juce/dynamics/limiter', name: 'Limiter', category: 'Dynamics', color: '#ff4488', standalone: true },
  { uri: 'map2://juce/dynamics/gate', name: 'Noise Gate', category: 'Dynamics', color: '#44aaff', standalone: true },
  { uri: 'map2://juce/eq/parametric', name: 'Parametric EQ', category: 'EQ', color: '#44ff88', standalone: true },
  { uri: 'map2://juce/delay', name: 'Stereo Delay', category: 'Delay', color: '#a78bfa' },
  { uri: 'map2://juce/modulation/chorus', name: 'Chorus', category: 'Modulation', color: '#06b6d4' },
  { uri: 'map2://juce/modulation/phaser', name: 'Phaser', category: 'Modulation', color: '#ec4899' },
  { uri: 'map2://juce/modulation/intellifx', name: 'IntelliFX', category: 'Modulation', color: '#14b8a6' },
  { uri: 'map2://juce/pitch/shifter', name: 'EVH Harmonizer', category: 'Pitch', color: '#eab308' },
  { uri: 'map2://juce/pitch/interval', name: 'Interval Shifter', category: 'Pitch', color: '#f59e0b' },
  { uri: 'map2://juce/pitch/boss-xs1', name: 'Boss XS-1 Poly Shifter', category: 'Pitch', color: '#f97316' },
  { uri: 'map2://juce/pitch/h3000', name: 'H3000 Ultra-Harmonizer', category: 'Pitch', color: '#8b5cf6' },
  { uri: 'map2://juce/reverb/pcm70', name: 'Lexi Love (PCM 70)', category: 'Reverb', color: '#22c55e' },
  { uri: 'map2://juce/convolution/cabinet', name: 'Cabinet IR', category: 'Convolution', color: '#78716c' },
  { uri: 'map2://juce/convolution/reverb', name: 'Reverb IR', category: 'Convolution', color: '#a3a3a3' },
  { uri: 'map2://juce/nam', name: 'Neural Amp Modeler', category: 'Amp Modeling', color: '#ef4444' },
  { uri: 'map2://juce/amp/peavey5150', name: 'Peavey 5150', category: 'Amp Models', color: '#dc2626' },
  { uri: 'map2://juce/amp/tweedbassman', name: 'Tweed Bassman 5F6-A', category: 'Amp Models', color: '#d97706' },
  { uri: 'map2://juce/multieffect/shoegaze', name: 'ShoeGaze', category: 'Multi-FX', color: '#6366f1' },
  { uri: 'map2://juce/multieffect/passionfx', name: 'PassionFX', category: 'Multi-FX', color: '#e11d48' },
  { uri: 'map2://juce/effects/eventide-h9', name: 'Eventide H9', category: 'Multi-FX', color: '#0ea5e9' },
]

export function DSPPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('all')
  const navigate = useNavigate()

  // Group native plugins by category
  const pluginsByCategory = NATIVE_PLUGINS.reduce((acc, plugin) => {
    if (!acc[plugin.category]) acc[plugin.category] = []
    acc[plugin.category].push(plugin)
    return acc
  }, {} as Record<string, typeof NATIVE_PLUGINS>)

  return (
    <div className="dsp-page">
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Waves size={32} style={{ color: '#3b82f6' }} />
          <div>
            <h1>Native DSP Processors</h1>
            <p className="page-subtitle">Built-in JUCE audio engine — {NATIVE_PLUGINS.length} processors available</p>
          </div>
        </div>
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
        <button
          className={`section-tab ${activeSection === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveSection('catalog')}
        >
          Native Plugin Catalog
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

        {/* Native Plugin Catalog */}
        {(activeSection === 'all' || activeSection === 'catalog') && (
          <section className="dsp-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Native JUCE Plugin Catalog</h2>
              <button
                onClick={() => navigate('/grid')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                }}
              >
                <LayoutGrid size={14} /> Open in Grid Editor
              </button>
            </div>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
              All {NATIVE_PLUGINS.length} built-in JUCE processors. Add them to your signal chain via the Grid editor.
            </p>
            {Object.entries(pluginsByCategory).map(([category, plugins]) => (
              <div key={category} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  {category} <span style={{ color: '#555' }}>({plugins.length})</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {plugins.map(p => (
                    <div
                      key={p.uri}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px',
                        background: '#1a1a2e',
                        border: '1px solid #2a2a3e',
                        borderLeft: `3px solid ${p.color}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => navigate('/grid')}
                      onMouseEnter={e => { e.currentTarget.style.background = '#222240'; e.currentTarget.style.borderColor = '#444' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.borderColor = '#2a2a3e' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#fff' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{p.uri}</div>
                      </div>
                      {p.standalone && (
                        <span style={{ fontSize: 10, padding: '2px 6px', background: '#22c55e22', color: '#22c55e', borderRadius: 4 }}>
                          Standalone
                        </span>
                      )}
                      <ChevronRight size={14} style={{ color: '#555' }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
