import type { CSSProperties, ComponentType } from 'react'
import {
  ChartLine,
  Code,
  CodeReference,
  FavoriteFilled,
  Globe,
  Lightning,
  LogoGithub,
  Package,
  Renew,
  Security,
  Terminal,
} from '@carbon/icons-react'
import {
  MapAmplifierIcon,
  MapClusterFabricIcon,
  MapMatrixProcessorIcon,
  MapRackDeviceIcon,
  MapRealtimeEngineIcon,
  MapSignalFlowIcon,
} from './icons/map'

type FooterIcon = ComponentType<{ size?: number; style?: CSSProperties; className?: string }>

interface Partner {
  name: string
  url: string
  category: string
  services: string[]
  description: string
  role: 'Audio Processing' | 'Backend' | 'Platform'
  icon: FooterIcon
}

interface Highlight {
  title: string
  description: string
  color: string
  icon: FooterIcon
}

const PARTNERS: Partner[] = [
  {
    name: 'Neural Amp Modeler',
    url: 'https://www.neuralampmodeler.com/',
    category: 'Audio Processing',
    services: ['NAM Models', 'All Plugins (LV2)'],
    description: 'Neural amp modeling support inside the MAP2 plugin ecosystem.',
    role: 'Audio Processing',
    icon: MapAmplifierIcon,
  },
  {
    name: 'LV2 Plugin Format',
    url: 'https://lv2plug.in/',
    category: 'Plugin Infrastructure',
    services: ['All Plugins (LV2)', 'IR Processing', 'NAM Models'],
    description: 'Standard plugin contract used across the platform.',
    role: 'Audio Processing',
    icon: CodeReference,
  },
  {
    name: 'JUCE',
    url: 'https://juce.com/',
    category: 'Audio Engine',
    services: ['JUCE Audio Engine', 'JUCE DSP Graph', 'JUCE MIDI / I/O'],
    description: 'Realtime DSP and plugin hosting foundation.',
    role: 'Audio Processing',
    icon: MapSignalFlowIcon,
  },
  {
    name: 'Python',
    url: 'https://www.python.org/',
    category: 'Backend Language',
    services: ['UI / API Server', 'Background Tasks', 'Monitoring'],
    description: 'Service orchestration and API runtime.',
    role: 'Backend',
    icon: Code,
  },
  {
    name: 'FastAPI',
    url: 'https://fastapi.tiangolo.com/',
    category: 'Web Framework',
    services: ['UI / API Server', 'Engine Monitoring'],
    description: 'REST and WebSocket delivery layer.',
    role: 'Backend',
    icon: Terminal,
  },
  {
    name: 'Fedora Linux',
    url: 'https://getfedora.org/',
    category: 'Operating System',
    services: ['All Services', 'System Core'],
    description: 'Realtime-capable Linux host environment.',
    role: 'Platform',
    icon: MapRackDeviceIcon,
  },
]

const ARCHITECTURE_HIGHLIGHTS: Highlight[] = [
  {
    title: 'Modular Design',
    description: 'Decoupled services for flexibility and resilience',
    color: '#4caf50',
    icon: Package,
  },
  {
    title: 'Realtime Priority',
    description: 'Kernel-level audio processing with minimal jitter',
    color: '#64b5f6',
    icon: Lightning,
  },
  {
    title: 'Hot Reloading',
    description: 'Update plugins and configs without stopping audio',
    color: '#81c784',
    icon: Renew,
  },
  {
    title: 'Failover Ready',
    description: 'Automatic service recovery and circuit breakers',
    color: '#ffa726',
    icon: Security,
  },
  {
    title: 'Metrics First',
    description: 'Comprehensive profiling and performance tracking',
    color: '#ef5350',
    icon: ChartLine,
  },
  {
    title: 'Network Ready',
    description: 'Remote control and monitoring over LAN/WAN',
    color: '#64b5f6',
    icon: Globe,
  },
]

const ACKNOWLEDGEMENT_CARDS: Array<{
  title: string
  text: string
  color: string
  icon: FooterIcon
}> = [
  {
    title: 'Audio',
    text: 'NAM, LV2, IR',
    color: '#81c784',
    icon: MapAmplifierIcon,
  },
  {
    title: 'Engine',
    text: 'JUCE, ALSA',
    color: '#ffa726',
    icon: MapRealtimeEngineIcon,
  },
  {
    title: 'Backend',
    text: 'Python, FastAPI',
    color: '#64b5f6',
    icon: Code,
  },
  {
    title: 'OS',
    text: 'Fedora PREEMPT_RT',
    color: '#ef5350',
    icon: MapRackDeviceIcon,
  },
  {
    title: 'Community',
    text: 'Open Source',
    color: '#4caf50',
    icon: MapClusterFabricIcon,
  },
  {
    title: 'Innovation',
    text: 'Musicians and Devs',
    color: '#ab47bc',
    icon: MapMatrixProcessorIcon,
  },
]

export function PlatformFooter() {
  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '2px solid rgba(100,181,246,0.2)' }}>
      <div className="flex" style={{ gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background: 'rgba(100,181,246,0.12)',
            color: '#64b5f6',
          }}
        >
          <MapSignalFlowIcon size={20} />
        </div>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              background: 'linear-gradient(90deg, #64b5f6 0%, #81c784 50%, #ffa726 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Architecture & Partnerships
          </h3>
        </div>
      </div>

      <div className="stack" style={{ gap: 20 }}>
        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 'min-content' }}>
            {ARCHITECTURE_HIGHLIGHTS.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  style={{
                    padding: 12,
                    background: 'rgba(0,0,0,0.3)',
                    border: `1px solid ${item.color}33`,
                    borderRadius: 6,
                    minWidth: '148px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      marginBottom: 6,
                      color: item.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{item.description}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'min-content' }}>
            {PARTNERS.map((partner) => {
              const Icon = partner.icon
              return (
                <a key={partner.name} href={partner.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      padding: 10,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(100,181,246,0.2)',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: '116px',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        background: 'rgba(100,181,246,0.1)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(100,181,246,0.2)',
                        color: '#64b5f6',
                      }}
                    >
                      <Icon size={26} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{partner.name}</div>
                      <div style={{ fontSize: 9, color: '#ffa726', fontWeight: 600 }}>{partner.role}</div>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACKNOWLEDGEMENT_CARDS.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                style={{
                  padding: 8,
                  background: `${item.color}0d`,
                  border: `1px solid ${item.color}33`,
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#9ca3af',
                  flex: '1 1 auto',
                  minWidth: '180px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Icon size={12} style={{ color: item.color }} />
                  <div style={{ fontWeight: 700, color: item.color, fontSize: 9 }}>{item.title}</div>
                </div>
                <div style={{ fontSize: 9, lineHeight: 1.3 }}>{item.text}</div>
              </div>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            paddingTop: 8,
            fontSize: 10,
            borderTop: '1px solid rgba(100,181,246,0.1)',
          }}
        >
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <LogoGithub size={12} /> GitHub
          </a>
          <div style={{ color: '#6b7280' }}>•</div>
          <a
            href="https://juce.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#64b5f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Code size={12} /> JUCE
          </a>
          <div style={{ color: '#6b7280' }}>•</div>
          <div style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FavoriteFilled size={12} style={{ color: '#ef5350' }} /> Built for audio work
          </div>
        </div>
      </div>
    </div>
  )
}
