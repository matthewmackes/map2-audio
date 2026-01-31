import { Code2, Github, Heart, Cpu, CheckCircle2, Settings2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useEffect, useState } from 'react'
import { themes, darkThemes, lightThemes, applyTheme, getSavedThemeId } from '../theme'

interface Partner {
  name: string
  logo: string
  url: string
  category: string
  services: string[]
  description: string
  role: 'Audio Processing' | 'Backend' | 'Platform' | 'Real-time' | 'Infrastructure'
}

// Partner data with service connections
const JUCE_LOGO = 'https://raw.githubusercontent.com/juce-framework/JUCE/master/docs/images/juce-logo.svg';
const JUCE_URL = 'https://juce.com/';
const JUCE_PROJECT_NAME = 'JUCE Audio Engine';
const JUCE_SUMMARY = 'Professional-grade, cross-platform audio engine powering MAP2. Real-time LV2/VST3 plugin host, ultra-low latency, and robust audio/MIDI routing.';

const PARTNERS: Partner[] = [
  {
    name: JUCE_PROJECT_NAME,
    logo: JUCE_LOGO,
    url: JUCE_URL,
    category: 'Audio Engine',
    services: ['Audio Engine', 'Plugin Host', 'Real-time DSP'],
    description: JUCE_SUMMARY,
    role: 'Audio Processing',
  },
  {
    name: 'Neural Amp Modeler',
    logo: 'https://raw.githubusercontent.com/sdatkinson/NeuralAmpModelerPlugin/main/NeuralAmpModeler/resources/img/ModelIcon.svg',
    url: 'https://www.neuralampmodeler.com/',
    category: 'Audio Processing',
    services: ['NAM Models', 'All Plugins (LV2)'],
    description: 'Neural amp modeling - AI-powered guitar amplifier simulations',
    role: 'Audio Processing',
  },
  {
    name: 'LV2 Plugin Format',
    logo: 'https://raw.githubusercontent.com/lv2/lv2/master/resources/logo/lv2_flat_green.svg',
    url: 'https://lv2plug.in/',
    category: 'Plugin Infrastructure',
    services: ['All Plugins (LV2)', 'IR Processing', 'NAM Models'],
    description: 'Standard audio plugin architecture used across MAP2',
    role: 'Audio Processing',
  },
  {
    name: 'Python',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/python.svg',
    url: 'https://www.python.org/',
    category: 'Backend Language',
    services: ['UI / API Server', 'Background Tasks', 'Monitoring'],
    description: 'High-level language for services and control systems',
    role: 'Backend',
  },
  {
    name: 'FastAPI',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fastapi.svg',
    url: 'https://fastapi.tiangolo.com/',
    category: 'Web Framework',
    services: ['UI / API Server', 'PiPedal Monitoring'],
    description: 'Modern async web framework for REST and WebSocket APIs',
    role: 'Backend',
  },
  {
    name: 'Fedora Linux',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fedora.svg',
    url: 'https://getfedora.org/',
    category: 'Operating System',
    services: ['All Services', 'System Core'],
    description: 'Bleeding-edge Linux with real-time kernel support (PREEMPT_RT)',
    role: 'Platform',
  },
  {
    name: 'GraphicalIRLoader',
    logo: 'https://raw.githubusercontent.com/JamesStubbsEng/GraphicalIRLoader/master/Resources/icon.png',
    url: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    category: 'Audio Visualization',
    services: ['IR Processing', 'FFT Visualization'],
    description: 'FFT-based impulse response visualization and loading',
    role: 'Audio Processing',
  },
]

const ARCHITECTURE_HIGHLIGHTS = [
  {
    title: 'Modular Design',
    description: 'Decoupled services for flexibility and resilience',
    color: '#4caf50',
    icon: '📦',
  },
  {
    title: 'Real-time Priority',
    description: 'Kernel-level audio processing with minimal jitter',
    color: '#64b5f6',
    icon: '⚡',
  },
  {
    title: 'Hot Reloading',
    description: 'Update plugins and configs without stopping audio',
    color: '#81c784',
    icon: '🔄',
  },
  {
    title: 'Failover Ready',
    description: 'Automatic service recovery and circuit breakers',
    color: '#ffa726',
    icon: '🛡️',
  },
  {
    title: 'Metrics First',
    description: 'Comprehensive profiling and performance tracking',
    color: '#ef5350',
    icon: '📊',
  },
  {
    title: 'Network Ready',
    description: 'Remote control and monitoring over LAN/WAN',
    color: '#64b5f6',
    icon: '🌐',
  },
]

export function AboutPage() {
  // Live engine status (placeholder, replace with real API call if needed)
  const [engineStatus, setEngineStatus] = useState<any>(null);
  useEffect(() => {
    fetch('/api/engine/status').then(r => r.json()).then(setEngineStatus).catch(() => {});
  }, []);

  return (
    <div className="stack">
      {/* JUCE Audio Engine Feature */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <img src={JUCE_LOGO} alt="JUCE" style={{ height: 64, width: 64, background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: 8 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5, color: '#64b5f6', marginBottom: 2 }}>{JUCE_PROJECT_NAME}</div>
          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>{JUCE_SUMMARY}</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4caf50' }}>
              <CheckCircle2 size={16} style={{ color: '#4caf50' }} />
              Status: <b>{engineStatus?.running ? 'Running' : 'Stopped'}</b>
            </div>
            {/* Footer Links */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 12, fontSize: 10, borderTop: '1px solid rgba(100,181,246,0.1)' }}>
              <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
                <Github size={12} /> GitHub
              </a>
              <div style={{ color: '#666' }}>•</div>
              {/* <a href="https://github.com/rerdavies/pipedal" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
                <Code2 size={12} /> PiPedal
              </a> */}
              <div style={{ color: '#666' }}>•</div>
              <div style={{ color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Heart size={12} style={{ color: '#ef5350' }} /> Made with passion
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ffa726' }}>
              <Cpu size={16} style={{ color: '#ffa726' }} />
              Sample Rate: <b>{engineStatus?.sample_rate || '—'}</b>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#81c784' }}>
              <Settings2 size={16} style={{ color: '#81c784' }} />
              Plugins: <b>{engineStatus?.plugin_count || '—'}</b>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ef5350' }}>
              Health: <b>{engineStatus?.available ? 'Healthy' : 'Unavailable'}</b>
            </div>
          </div>
        </div>
        <a href={JUCE_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', marginLeft: 'auto', minWidth: 80 }}>
          <div style={{ background: '#64b5f6', color: '#fff', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13, textAlign: 'center', boxShadow: '0 2px 8px #64b5f633', transition: 'background 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1976d2')}
            onMouseLeave={e => (e.currentTarget.style.background = '#64b5f6')}
          >Learn More</div>
        </a>
      </div>

      <PageHeader
        title="About Gitz"
        subtitle="Project Partners, Architecture & Acknowledgments"
      />

      {/* Project Partners & Logos */}
      <div className="card">
        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🤝</span> Project Partners & Logos
        </h3>
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <a href="https://www.neuralampmodeler.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://raw.githubusercontent.com/sdatkinson/NeuralAmpModelerPlugin/main/NeuralAmpModeler/resources/img/ModelIcon.svg" alt="NAM" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">NAM</text></svg>' }} />
              <div className="stat-label">Neural Amp Modeler</div>
            </div>
          </a>
          <a href="https://lv2plug.in/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://raw.githubusercontent.com/lv2/lv2/master/resources/logo/lv2_flat_green.svg" alt="LV2" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">LV2</text></svg>' }} />
              <div className="stat-label">LV2</div>
            </div>
          </a>
          <a href="https://github.com/rerdavies/pipedal" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://raw.githubusercontent.com/rerdavies/pipedal/main/vite/public/logo192.png" alt="PiPedal" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">PiPedal</text></svg>' }} />
              <div className="stat-label">PiPedal</div>
            </div>
          </a>
          <a href="https://github.com/JamesStubbsEng/GraphicalIRLoader" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://raw.githubusercontent.com/JamesStubbsEng/GraphicalIRLoader/master/Resources/icon.png" alt="GraphicalIRLoader" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%231a1510" width="100" height="100" rx="10"/><path d="M10,60 Q25,30 40,50 T70,45 T90,55" fill="none" stroke="%23ffb84d" stroke-width="3"/><text x="50" y="85" text-anchor="middle" fill="%23ffb84d" font-size="10">IR Loader</text></svg>' }} />
              <div className="stat-label">GraphicalIRLoader</div>
            </div>
          </a>
          <a href="https://www.python.org/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/python.svg" alt="Python" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">Python</text></svg>' }} />
              <div className="stat-label">Python</div>
            </div>
          </a>
          <a href="https://fastapi.tiangolo.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fastapi.svg" alt="FastAPI" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">FastAPI</text></svg>' }} />
              <div className="stat-label">FastAPI</div>
            </div>
          </a>
          <a href="https://getfedora.org/" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="list-item" style={{ textAlign: 'center', cursor: 'pointer' }}>
              <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fedora.svg" alt="Fedora" style={{ height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ddd" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">Fedora</text></svg>' }} />
              <div className="stat-label">Fedora</div>
            </div>
          </a>
        </div>
      </div>

      {/* Thank You - Projects Compact */}
      <div className="card" style={{ fontSize: 13 }}>
        <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🙏</span> Thank You, Projects
        </h4>
        <div className="grid two" style={{ gap: 6 }}>
          <div className="list-item" style={{ padding: 8 }}><strong>NAM</strong> — neural amp modeling</div>
          <div className="list-item" style={{ padding: 8 }}><strong>LV2</strong> — plugin format</div>
          <div className="list-item" style={{ padding: 8 }}><strong>IR</strong> — cabinet/room responses</div>
          <div className="list-item" style={{ padding: 8 }}><strong>GraphicalIRLoader</strong> — FFT IR visualization</div>
          {/* <div className="list-item" style={{ padding: 8 }}><strong>PiPedal</strong> — pedalboard flows</div> */}
          <div className="list-item" style={{ padding: 8 }}><strong>JUCE</strong> — audio engine</div>
          <div className="list-item" style={{ padding: 8 }}><strong>Python/FastAPI</strong> — services</div>
          <div className="list-item" style={{ padding: 8 }}><strong>Fedora RT</strong> — low latency</div>
          <div className="list-item" style={{ padding: 8 }}><strong>PREEMPT_RT</strong> — realtime kernel</div>
        </div>
      </div>

      {/* Architecture & Partnerships */}
      <div className="card" style={{ marginTop: 8 }}>
        {/* Horizontal Header */}
        <div className="flex" style={{ gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 24 }}>🏗️</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, background: 'linear-gradient(90deg, #64b5f6 0%, #81c784 50%, #ffa726 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Architecture & Partnerships
            </h3>
          </div>
        </div>

        {/* Architecture Highlights */}
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 'min-content' }}>
            {ARCHITECTURE_HIGHLIGHTS.map((item, idx) => (
              <div key={idx} style={{
                padding: 12,
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${item.color}33`,
                borderRadius: 6,
                transition: 'all 150ms ease',
                cursor: 'pointer',
                minWidth: '140px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${item.color}11`;
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.title}</div>
                <div style={{ fontSize: 9, color: '#888', marginTop: 4, whiteSpace: 'normal' }}>{item.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Technology Partners */}
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'min-content' }}>
            {PARTNERS.map((partner, idx) => (
              <a key={idx} href={partner.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: 10,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(100,181,246,0.2)',
                  borderRadius: 8,
                  transition: 'all 150ms ease',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '100px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(100,181,246,0.1)';
                  e.currentTarget.style.border = '1px solid rgba(100,181,246,0.4)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(100,181,246,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,0.4)';
                  e.currentTarget.style.border = '1px solid rgba(100,181,246,0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>

                  {/* Logo */}
                  <div style={{
                    width: 48,
                    height: 48,
                    background: 'rgba(100,181,246,0.1)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                    border: '1px solid rgba(100,181,246,0.2)',
                  }}>
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      style={{ height: 32, width: 32, objectFit: 'contain' }}
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23444" width="100" height="100" rx="6"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23fff" font-size="20" font-weight="bold">' + partner.name.charAt(0) + '</text></svg>'
                      }}
                    />
                  </div>

                  {/* Name and Role */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{partner.name}</div>
                    <div style={{ fontSize: 9, color: '#ffa726', fontWeight: 600 }}>{partner.role}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Acknowledgments */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(129,199,132,0.05)', border: '1px solid rgba(129,199,132,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#81c784', marginBottom: 2, fontSize: 9 }}>🎸 Audio</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>NAM, LV2, IR</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(255,167,38,0.05)', border: '1px solid rgba(255,167,38,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ffa726', marginBottom: 2, fontSize: 9 }}>🔧 Engine</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>JUCE, JACK</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(100,181,246,0.05)', border: '1px solid rgba(100,181,246,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#64b5f6', marginBottom: 2, fontSize: 9 }}>⚙️ Backend</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Python, FastAPI</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(239,83,80,0.05)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ef5350', marginBottom: 2, fontSize: 9 }}>⏱️ OS</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Fedora PREEMPT_RT</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(76,175,80,0.05)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#4caf50', marginBottom: 2, fontSize: 9 }}>🤝 Community</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Open Source</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(156,39,176,0.05)', border: '1px solid rgba(156,39,176,0.2)', borderRadius: 4, fontSize: 10, color: '#aaa', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ab47bc', marginBottom: 2, fontSize: 9 }}>💡 Innovation</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Musicians & Devs</div>
          </div>
        </div>

        {/* Footer Links */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 12, fontSize: 10, borderTop: '1px solid rgba(100,181,246,0.1)' }}>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
            <Github size={12} /> GitHub
          </a>
          <div style={{ color: '#666' }}>•</div>
          {/* <a href="https://github.com/rerdavies/pipedal" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
            <Code2 size={12} /> PiPedal
          </a> */}
          <div style={{ color: '#666' }}>•</div>
          <div style={{ color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Heart size={12} style={{ color: '#ef5350' }} /> Made with passion
          </div>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="card" style={{ marginTop: 8, padding: 20, textAlign: 'center' }}>
        <h4 style={{ marginBottom: 16, fontSize: 17, fontWeight: 700, color: 'var(--primary)' }}>Theme Selection</h4>
        <select
          id="theme-selector"
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--border-radius-md)',
            fontSize: 14,
            background: 'var(--surface)',
            color: 'var(--muted)',
            border: '2px solid var(--primary)',
            outline: 'none',
            marginBottom: 12,
            cursor: 'pointer',
            minWidth: 200
          }}
          onChange={e => {
            applyTheme(e.target.value);
          }}
          defaultValue={getSavedThemeId()}
        >
          <optgroup label="Dark Themes">
            {darkThemes.map(id => (
              <option key={id} value={id}>{themes[id].name}</option>
            ))}
          </optgroup>
          <optgroup label="Light Themes">
            {lightThemes.map(id => (
              <option key={id} value={id}>{themes[id].name}</option>
            ))}
          </optgroup>
        </select>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          {themes[getSavedThemeId()]?.description || 'Select a theme for the interface.'}
        </div>
      </div>
    </div>
  )
}
