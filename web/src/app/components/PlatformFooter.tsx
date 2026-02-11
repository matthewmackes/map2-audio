import { Code, GithubLogo, Heart } from '@phosphor-icons/react'

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
const PARTNERS: Partner[] = [
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
    name: 'JUCE',
    logo: 'https://juce.com/wp-content/uploads/2022/08/juce-logo.svg',
    url: 'https://juce.com/',
    category: 'Audio Engine',
    services: ['JUCE Audio Engine', 'JUCE DSP Graph', 'JUCE MIDI / I/O'],
    description: 'Professional C++ audio engine for real-time DSP and plugin hosting',
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
    services: ['UI / API Server', 'Engine Monitoring'],
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

export function PlatformFooter() {
  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '2px solid rgba(100,181,246,0.2)' }}>
      {/* Horizontal Header */}
      <div className="flex" style={{ gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 24 }}>🏗️</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, background: 'linear-gradient(90deg, #64b5f6 0%, #81c784 50%, #ffa726 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Architecture & Partnerships
          </h3>
        </div>
      </div>

      {/* HORIZONTAL LAYOUT - Three Rows */}
      <div className="stack" style={{ gap: 20 }}>
        
        {/* Row 1: Architecture Highlights - Horizontal Scroll */}
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
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
              </div>
            ))}
          </div>
        </div>

        {/* Row 2: Technology Partners - Horizontal Scroll with Logos */}
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
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

        {/* Row 3: Acknowledgments - Horizontal Flex */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ padding: 8, background: 'rgba(129,199,132,0.05)', border: '1px solid rgba(129,199,132,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#81c784', marginBottom: 2, fontSize: 9 }}>🎸 Audio</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>NAM, LV2, IR</div>
          </div>
          
          <div style={{ padding: 8, background: 'rgba(255,167,38,0.05)', border: '1px solid rgba(255,167,38,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ffa726', marginBottom: 2, fontSize: 9 }}>🔧 Engine</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>JUCE, ALSA</div>
          </div>
          
          <div style={{ padding: 8, background: 'rgba(100,181,246,0.05)', border: '1px solid rgba(100,181,246,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#64b5f6', marginBottom: 2, fontSize: 9 }}>⚙️ Backend</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Python, FastAPI</div>
          </div>
          
          <div style={{ padding: 8, background: 'rgba(239,83,80,0.05)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ef5350', marginBottom: 2, fontSize: 9 }}>⏱️ OS</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Fedora PREEMPT_RT</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(76,175,80,0.05)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#4caf50', marginBottom: 2, fontSize: 9 }}>🤝 Community</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Open Source</div>
          </div>

          <div style={{ padding: 8, background: 'rgba(156,39,176,0.05)', border: '1px solid rgba(156,39,176,0.2)', borderRadius: 4, fontSize: 10, color: '#9ca3af', flex: '1 1 auto', minWidth: '180px' }}>
            <div style={{ fontWeight: 700, color: '#ab47bc', marginBottom: 2, fontSize: 9 }}>💡 Innovation</div>
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>Musicians & Devs</div>
          </div>
        </div>

        {/* Footer Links */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 8, fontSize: 10, borderTop: '1px solid rgba(100,181,246,0.1)' }}>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
            <GithubLogo size={12} weight="duotone" /> GitHub
          </a>
          <div style={{ color: '#6b7280' }}>•</div>
          <a href="https://juce.com/" target="_blank" rel="noreferrer" style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, transition: 'color 150ms ease' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = '#64b5f6'}>
            <Code size={12} weight="duotone" /> JUCE
          </a>
          <div style={{ color: '#6b7280' }}>•</div>
          <div style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Heart size={12} weight="duotone" style={{ color: '#ef5350' }} /> Made with passion
          </div>
        </div>
      </div>
    </div>
  )
}
