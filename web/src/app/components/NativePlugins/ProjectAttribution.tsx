import { ExternalLink, Github, Heart } from 'lucide-react'

export interface ProjectInfo {
  name: string
  tagline: string
  description: string
  maintainer: string
  maintainerUrl?: string
  projectUrl: string
  githubUrl?: string
  logoUrl?: string
  logoFallback?: string // emoji or text fallback
  accentColor: string
  accentColorRgb: string
  license?: string
  version?: string
  features?: string[]
}

// Project metadata for all native plugins
export const NATIVE_PLUGIN_PROJECTS: Record<string, ProjectInfo> = {
  nam: {
    name: 'Neural Amp Modeler',
    tagline: 'AI-Powered Amp Simulation',
    description: 'Machine learning-based guitar amplifier emulation using neural networks. Captures the exact character of real tube amplifiers with stunning accuracy.',
    maintainer: 'Steven Atkinson',
    maintainerUrl: 'https://github.com/sdatkinson',
    projectUrl: 'https://www.neuralampmodeler.com/',
    githubUrl: 'https://github.com/sdatkinson/NeuralAmpModelerPlugin',
    logoUrl: 'https://raw.githubusercontent.com/sdatkinson/NeuralAmpModelerPlugin/main/NeuralAmpModeler/resources/img/ModelIcon.svg',
    logoFallback: '🎸',
    accentColor: '#ff6b35',
    accentColorRgb: '255, 107, 53',
    license: 'MIT',
    features: ['Neural network amp modeling', 'Low latency inference', 'Thousands of community models']
  },
  cabinet: {
    name: 'Graphical IR Loader',
    tagline: 'FFT-Based IR Visualization',
    description: 'Advanced impulse response loader with real-time FFT frequency visualization. See your cabinet\'s frequency response as you browse and load IRs.',
    maintainer: 'James Stubbs',
    maintainerUrl: 'https://github.com/JamesStubbsEng',
    projectUrl: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    githubUrl: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    logoUrl: 'https://raw.githubusercontent.com/JamesStubbsEng/GraphicalIRLoader/master/Resources/icon.png',
    logoFallback: '🎛️',
    accentColor: '#ffb84d',
    accentColorRgb: '255, 184, 77',
    license: 'GPL-3.0',
    features: ['Real-time FFT visualization', 'Low-latency convolution', 'Drag & drop IR loading']
  },
  reverb: {
    name: 'Convolution Reverb',
    tagline: 'Zero-Latency IR Convolution',
    description: 'High-quality convolution reverb engine optimized for real-time performance. Load any impulse response to recreate acoustic spaces with zero latency.',
    maintainer: 'MAP2 Audio',
    maintainerUrl: 'https://github.com/map2-audio',
    projectUrl: 'https://github.com/map2-audio',
    logoUrl: '/assets/map2-logo.svg',
    logoFallback: '✨',
    accentColor: '#a855f7',
    accentColorRgb: '168, 85, 247',
    license: 'MIT',
    features: ['Zero-latency processing', 'Pattern sequencing', 'Envelope modulation']
  },
  delay: {
    name: 'Cocoa Delay',
    tagline: 'Warm Delay with Character',
    description: 'A warm and inviting delay plugin featuring analog-style drift, ducking, and saturation. Perfect for adding depth and movement to any source.',
    maintainer: 'tesselode',
    maintainerUrl: 'https://github.com/tesselode',
    projectUrl: 'https://github.com/tesselode/cocoa-delay',
    githubUrl: 'https://github.com/tesselode/cocoa-delay',
    logoUrl: 'https://raw.githubusercontent.com/tesselode/cocoa-delay/master/images/screenshot.png',
    logoFallback: '☕',
    accentColor: '#d4a574',
    accentColorRgb: '212, 165, 116',
    license: 'MIT',
    features: ['Analog-style drift (wow/flutter)', 'Intelligent ducking', 'Airwindows-based saturation']
  },
  autotune: {
    name: 'Zita AT1',
    tagline: 'Auto-Tune with Clean Resampling',
    description: 'High-quality pitch correction using clean sinc resampling. Part of the Zita audio toolkit, known for its pristine audio quality and low CPU usage.',
    maintainer: 'Fons Adriaensen',
    maintainerUrl: 'http://kokkinizita.linuxaudio.org/',
    projectUrl: 'https://kokkinizita.linuxaudio.org/linuxaudio/',
    githubUrl: 'https://github.com/royvegard/zita-at1',
    logoUrl: 'https://kokkinizita.linuxaudio.org/ostlogo.png',
    logoFallback: '🎤',
    accentColor: '#4ade80',
    accentColorRgb: '74, 222, 128',
    license: 'GPL-3.0',
    features: ['Clean sinc resampling', 'MIDI note control', 'Low latency mode (~10ms)']
  },
  triplespread: {
    name: 'TripleSpread',
    tagline: 'Stereo Width Enhancement',
    description: 'Part of the legendary Airwindows plugin collection. Widens stereo image using three-way frequency-dependent spreading for a natural, phase-coherent result.',
    maintainer: 'Chris Johnson',
    maintainerUrl: 'https://www.airwindows.com/',
    projectUrl: 'https://www.airwindows.com/',
    githubUrl: 'https://github.com/airwindows/airwindows',
    logoUrl: 'https://www.airwindows.com/wp-content/uploads/2023/01/cropped-airwindowslogo-1-192x192.png',
    logoFallback: '↔️',
    accentColor: '#a78bfa',
    accentColorRgb: '167, 139, 250',
    license: 'MIT',
    features: ['Frequency-dependent spreading', 'Phase-coherent widening', 'Zero-latency processing']
  },
  valentine: {
    name: 'Valentine',
    tagline: 'Aggressive Compressor/Saturator',
    description: 'A character compressor with attitude. Features crushing, compression, and saturation in one aggressive package. Perfect for adding energy and excitement.',
    maintainer: 'Tote Bag Labs',
    maintainerUrl: 'https://github.com/tote-bag-labs',
    projectUrl: 'https://github.com/tote-bag-labs/valentine',
    githubUrl: 'https://github.com/tote-bag-labs/valentine',
    logoUrl: 'https://raw.githubusercontent.com/tote-bag-labs/valentine/main/valentine/Resources/logo.png',
    logoFallback: '💔',
    accentColor: '#e11d48',
    accentColorRgb: '225, 29, 72',
    license: 'GPL-3.0',
    features: ['Crush mode (27.5kHz downsample)', 'Variable ratio compression', 'Tube-style saturation']
  },
  zlequalizer: {
    name: 'ZL Equalizer',
    tagline: '16-Band Dynamic Parametric EQ',
    description: 'A professional-grade parametric equalizer with 16 fully-featured bands. Each band supports dynamic processing, multiple filter types, and advanced sidechain options.',
    maintainer: 'ZL-Audio',
    maintainerUrl: 'https://github.com/ZL-Audio',
    projectUrl: 'https://zl-audio.github.io/ZLEqualizer/',
    githubUrl: 'https://github.com/ZL-Audio/ZLEqualizer',
    logoUrl: 'https://raw.githubusercontent.com/ZL-Audio/ZLEqualizer/master/docs/screenshot.png',
    logoFallback: '📊',
    accentColor: '#06b6d4',
    accentColorRgb: '6, 182, 212',
    license: 'GPL-3.0',
    features: ['16 fully-featured bands', 'Per-band dynamics', 'Multiple phase modes (0ms - 171ms)']
  },
  freeverb3: {
    name: 'Freeverb3',
    tagline: 'SIMD-Optimized Algorithmic Reverb',
    description: 'A high-quality signal processing library featuring multiple reverb algorithms with SIMD optimization. Provides studio-grade algorithmic reverbs including Freeverb, STRev, NRev, Progenitor, and more.',
    maintainer: 'Teru Kamogashira',
    maintainerUrl: 'https://www.nongnu.org/freeverb3/',
    projectUrl: 'https://www.nongnu.org/freeverb3/',
    githubUrl: 'https://github.com/gitGNU/gnu_freeverb3',
    logoUrl: 'https://www.gnu.org/graphics/heckert_gnu.transp.small.png',
    logoFallback: '🌊',
    accentColor: '#6366f1',
    accentColorRgb: '99, 102, 241',
    license: 'GPL-2.0',
    features: ['Multiple reverb algorithms', 'SIMD optimization (SSE/AVX)', 'Zero-latency processing', 'Modulation & diffusion']
  }
}

interface ProjectAttributionProps {
  projectId: keyof typeof NATIVE_PLUGIN_PROJECTS
  compact?: boolean
  showFeatures?: boolean
}

export function ProjectAttribution({ projectId, compact = false, showFeatures = true }: ProjectAttributionProps) {
  const project = NATIVE_PLUGIN_PROJECTS[projectId]
  if (!project) return null

  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      style={{
        background: `linear-gradient(135deg, rgba(${project.accentColorRgb}, 0.08), rgba(0, 0, 0, 0.4))`,
        border: `1px solid rgba(${project.accentColorRgb}, ${isHovered ? 0.4 : 0.2})`,
        borderRadius: 12,
        padding: compact ? 12 : 16,
        marginBottom: compact ? 12 : 20,
        transition: 'all 0.3s ease',
        boxShadow: isHovered ? `0 0 20px rgba(${project.accentColorRgb}, 0.15)` : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header with logo and title */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: compact ? 10 : 14,
      }}>
        {/* Logo */}
        <div
          style={{
            width: compact ? 40 : 52,
            height: compact ? 40 : 52,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${project.accentColor}30, ${project.accentColor}10)`,
            border: `1px solid ${project.accentColor}50`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: `0 0 15px rgba(${project.accentColorRgb}, 0.2)`,
          }}
        >
          {project.logoUrl && !imageError ? (
            <img
              src={project.logoUrl}
              alt={project.name}
              style={{
                width: '80%',
                height: '80%',
                objectFit: 'contain',
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <span style={{ fontSize: compact ? 20 : 26 }}>{project.logoFallback}</span>
          )}
        </div>

        {/* Title and tagline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: compact ? 14 : 16,
            fontWeight: 700,
            color: project.accentColor,
            marginBottom: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {project.name}
            {project.license && (
              <span style={{
                fontSize: 9,
                padding: '2px 6px',
                background: `rgba(${project.accentColorRgb}, 0.15)`,
                border: `1px solid rgba(${project.accentColorRgb}, 0.3)`,
                borderRadius: 4,
                color: project.accentColor,
                fontWeight: 500,
              }}>
                {project.license}
              </span>
            )}
          </div>
          <div style={{
            fontSize: compact ? 11 : 12,
            color: '#999',
            fontWeight: 500,
            fontStyle: 'italic',
          }}>
            {project.tagline}
          </div>
        </div>
      </div>

      {/* Description */}
      {!compact && (
        <p style={{
          fontSize: 12,
          color: '#aaa',
          lineHeight: 1.6,
          margin: '0 0 14px 0',
        }}>
          {project.description}
        </p>
      )}

      {/* Features */}
      {showFeatures && project.features && !compact && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 14,
        }}>
          {project.features.map((feature, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                padding: '4px 8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                color: '#888',
              }}
            >
              {feature}
            </span>
          ))}
        </div>
      )}

      {/* Maintainer and links */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: compact ? 10 : 12,
        borderTop: `1px solid rgba(${project.accentColorRgb}, 0.15)`,
      }}>
        {/* Maintainer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <Heart size={12} style={{ color: project.accentColor, opacity: 0.7 }} />
          <span style={{ fontSize: 11, color: '#888' }}>
            by{' '}
            {project.maintainerUrl ? (
              <a
                href={project.maintainerUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: project.accentColor,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {project.maintainer}
              </a>
            ) : (
              <span style={{ color: project.accentColor, fontWeight: 600 }}>
                {project.maintainer}
              </span>
            )}
          </span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: 8 }}>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                color: '#888',
                fontSize: 10,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `rgba(${project.accentColorRgb}, 0.15)`
                e.currentTarget.style.borderColor = `rgba(${project.accentColorRgb}, 0.3)`
                e.currentTarget.style.color = project.accentColor
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                e.currentTarget.style.color = '#888'
              }}
            >
              <Github size={12} />
              Source
            </a>
          )}
          <a
            href={project.projectUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: `rgba(${project.accentColorRgb}, 0.15)`,
              border: `1px solid rgba(${project.accentColorRgb}, 0.3)`,
              borderRadius: 4,
              color: project.accentColor,
              fontSize: 10,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = project.accentColor
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `rgba(${project.accentColorRgb}, 0.15)`
              e.currentTarget.style.color = project.accentColor
            }}
          >
            <ExternalLink size={11} />
            Website
          </a>
        </div>
      </div>
    </div>
  )
}

// Need to import useState for the component
import { useState } from 'react'
