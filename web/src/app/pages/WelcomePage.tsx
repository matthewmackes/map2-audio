import { Link } from 'react-router-dom'
import {
  LayoutGrid,
  Play,
  Save,
  Zap,
  ArrowRight,
  Radio,
  Keyboard,
  Terminal,
  Globe,
  Cpu,
  GitBranch,
  CheckCircle2
} from 'lucide-react'

// SVG Diagram showing the Flow -> Chain -> Activation concept
function PlatformDiagram() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      borderRadius: 'var(--border-radius-lg)',
      padding: 32,
      border: '1px solid var(--border)',
    }}>
      {/* Title */}
      <h3 style={{
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 24,
        textAlign: 'center',
        color: 'var(--primary)'
      }}>
        How Mackes Audio Platform Works
      </h3>

      {/* Three-stage visual flow */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 32,
      }}>
        {/* Stage 1: Build */}
        <div style={{
          background: 'rgba(249, 115, 22, 0.1)',
          border: '2px solid rgba(249, 115, 22, 0.3)',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#f97316',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 12,
            letterSpacing: '0.05em',
          }}>
            STEP 1
          </div>
          <LayoutGrid size={40} style={{ color: '#f97316', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#f97316' }}>
            Build a Flow
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Combine effects in the <strong>Grid Editor</strong> to create your signal chain
          </p>
        </div>

        {/* Arrow 1 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              flex: 1,
              height: 2,
              background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.5) 0%, rgba(34, 197, 94, 0.5) 100%)',
            }} />
            <ArrowRight size={24} style={{ color: '#22c55e', margin: '0 -4px' }} />
          </div>
        </div>

        {/* Stage 2: Save */}
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          border: '2px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#22c55e',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 12,
            letterSpacing: '0.05em',
          }}>
            STEP 2
          </div>
          <Save size={40} style={{ color: '#22c55e', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#22c55e' }}>
            Save as Chain
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            A saved Flow becomes a <strong>Chain</strong> ready to be activated
          </p>
        </div>
      </div>

      {/* Stage 3: Activate - Full width */}
      <div style={{
        background: 'rgba(0, 212, 255, 0.1)',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--primary)',
          color: '#000',
          fontSize: 10,
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: 12,
          letterSpacing: '0.05em',
        }}>
          STEP 3
        </div>
        <Zap size={36} style={{ color: 'var(--primary)', margin: '8px auto 12px' }} />
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--primary)' }}>
          Activate to Go Live
        </h4>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Chains are NOT live until activated. Activate via any of these methods:
        </p>

        {/* Activation methods */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
        }}>
          {[
            { icon: Radio, label: 'MIDI', color: '#ec4899' },
            { icon: Cpu, label: 'API', color: '#8b5cf6' },
            { icon: Keyboard, label: 'Keyboard', color: '#f59e0b' },
            { icon: Terminal, label: 'TUI', color: '#10b981' },
            { icon: Globe, label: 'Web Interface', color: '#00d4ff' },
          ].map(method => (
            <div
              key={method.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 20,
                border: `1px solid ${method.color}40`,
              }}
            >
              <method.icon size={14} style={{ color: method.color }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: method.color }}>{method.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Visual Flow representation */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(249, 115, 22, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: '#f97316',
        }}>
          <GitBranch size={12} />
          Flow (Editing)
        </div>
        <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(34, 197, 94, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: '#22c55e',
        }}>
          <Save size={12} />
          Chain (Saved)
        </div>
        <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(0, 212, 255, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--primary)',
        }}>
          <Play size={12} />
          Active (Live Audio)
        </div>
      </div>
    </div>
  )
}

// Key concept card
function ConceptCard({
  icon: Icon,
  title,
  description,
  color
}: {
  icon: typeof LayoutGrid
  title: string
  description: string
  color: string
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--border-radius-md)',
      padding: 20,
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <div style={{
        background: `${color}20`,
        borderRadius: 8,
        padding: 10,
        flexShrink: 0,
      }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color }}>{title}</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  )
}

export function WelcomePage() {
  return (
    <div className="stack" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          background: 'linear-gradient(135deg, var(--primary) 0%, #00ff88 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Welcome to Mackes Audio Platform
        </h1>
        <p style={{
          fontSize: 14,
          color: 'var(--muted)',
          maxWidth: 600,
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          A professional audio processing platform featuring Neural Amp Modeling,
          LV2 plugins, convolution reverb, and real-time signal routing.
        </p>
      </div>

      {/* Main Diagram */}
      <PlatformDiagram />

      {/* Key Concepts */}
      <div>
        <h3 style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          Key Concepts
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <ConceptCard
            icon={GitBranch}
            title="Flow"
            description="A Flow is an arrangement of effects in the Grid Editor. You can freely edit, rearrange, and experiment without affecting live audio."
            color="#f97316"
          />
          <ConceptCard
            icon={Save}
            title="Chain"
            description="A Chain is a saved Flow. Think of it as a preset that captures your entire signal routing. Chains wait in standby until activated."
            color="#22c55e"
          />
          <ConceptCard
            icon={Zap}
            title="Activation"
            description="Activating a Chain makes it live and processes actual audio. You can switch between Chains instantly via MIDI, keyboard, or the web interface."
            color="#00d4ff"
          />
          <ConceptCard
            icon={LayoutGrid}
            title="Parallel Routing"
            description="The Grid Editor supports parallel signal paths, allowing you to layer effects, create wet/dry blends, and build complex routing configurations."
            color="#8b5cf6"
          />
        </div>
      </div>

      {/* Important Note */}
      <div style={{
        background: 'rgba(249, 115, 22, 0.1)',
        border: '1px solid rgba(249, 115, 22, 0.3)',
        borderRadius: 'var(--border-radius-md)',
        padding: 20,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}>
        <div style={{
          background: 'rgba(249, 115, 22, 0.2)',
          borderRadius: '50%',
          padding: 8,
          flexShrink: 0,
        }}>
          <Play size={18} style={{ color: '#f97316' }} />
        </div>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#f97316' }}>
            Editing is Non-Destructive
          </h4>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            The process of editing a Flow, laying out multiple flows in parallel, or configuring other routing options
            does <strong>NOT</strong> make them live. Your live audio continues uninterrupted while you build and
            experiment with new configurations. Only when you explicitly <strong>activate</strong> a Chain does it
            become the live signal path.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div style={{
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
        paddingTop: 8,
      }}>
        <Link
          to="/grid"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--primary)',
            color: '#000',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 212, 255, 0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <LayoutGrid size={18} />
          Open Grid Editor
        </Link>
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'inherit',
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 14,
            textDecoration: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          View System Overview
        </Link>
      </div>
    </div>
  )
}
