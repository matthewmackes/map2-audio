import { useState } from 'react'
import { ExternalLink, Github, Heart, Sparkles } from 'lucide-react'

export interface ProjectInfo {
  name: string
  tagline: string
  description: string
  maintainer: string
  maintainerUrl?: string
  projectUrl: string
  githubUrl?: string
  logoUrl?: string
  logoFallback?: string
  accentColor: string
  accentColorRgb: string
  license?: string
  version?: string
  features?: string[]
  // Hardware reference image
  hardwareImage?: {
    url: string
    alt: string
    caption: string
  }
}

// Project metadata for all native plugins - Enhanced with detailed descriptions
export const NATIVE_PLUGIN_PROJECTS: Record<string, ProjectInfo> = {
  nam: {
    name: 'Neural Amp Modeler',
    tagline: 'AI-Powered Amp Simulation',
    description: `Neural Amp Modeler (NAM) uses deep temporal convolutional networks trained on real amplifier recordings to deliver tone so authentic it's virtually indistinguishable from the original hardware. Unlike traditional circuit modeling that attempts to recreate what gear should sound like, NAM actually listens to and learns from physical equipment—capturing subtle nonlinear interactions, complex harmonic content, and dynamic touch sensitivity that circuit modeling often misses.

The technology rivals expensive commercial solutions like Kemper, TONEX, and Neural DSP while remaining completely free and open-source. With a worldwide community on TONE3000, you have access to thousands of amp and pedal captures. Perhaps most importantly, NAM belongs to everyone—ensuring it continues evolving through community innovation.`,
    maintainer: 'Steven Atkinson',
    maintainerUrl: 'https://github.com/sdatkinson',
    projectUrl: 'https://www.neuralampmodeler.com/',
    githubUrl: 'https://github.com/sdatkinson/NeuralAmpModelerPlugin',
    logoUrl: 'https://raw.githubusercontent.com/sdatkinson/NeuralAmpModelerPlugin/main/NeuralAmpModeler/resources/img/ModelIcon.svg',
    logoFallback: '🎸',
    accentColor: '#ff6b35',
    accentColorRgb: '255, 107, 53',
    license: 'MIT',
    features: ['Deep learning neural networks', 'Professional-level accuracy', 'Thousands of community models', 'Low-latency inference', 'Captures nonlinear tube behavior'],
  },
  cabinet: {
    name: 'Graphical IR Loader',
    tagline: 'FFT-Based IR Visualization',
    description: `This advanced impulse response loader brings your cabinet simulation to life with real-time FFT frequency visualization. Watch your cabinet's frequency response update instantly as you browse and audition different IRs—an invaluable tool for understanding how each cabinet colors your tone.

The convolution engine uses highly optimized algorithms for minimal latency, making it perfect for live performance and tracking. Drag-and-drop any WAV impulse response file and immediately see its spectral characteristics displayed in beautiful detail. The visual feedback helps you make informed decisions about cabinet selection and mic positioning within your virtual signal chain.`,
    maintainer: 'James Stubbs',
    maintainerUrl: 'https://github.com/JamesStubbsEng',
    projectUrl: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    githubUrl: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    logoUrl: 'https://raw.githubusercontent.com/JamesStubbsEng/GraphicalIRLoader/master/Resources/icon.png',
    logoFallback: '🎛️',
    accentColor: '#ffb84d',
    accentColorRgb: '255, 184, 77',
    license: 'GPL-3.0',
    features: ['Real-time FFT visualization', 'Low-latency convolution', 'Drag & drop IR loading', 'Spectral analysis display', 'Optimized DSP algorithms'],
  },
  reverb: {
    name: 'Convolution Reverb',
    tagline: 'Zero-Latency IR Convolution',
    description: `Recreate the acoustic signature of any physical space using impulse response technology. From legendary recording studios and concert halls to unique acoustic environments, convolution reverb captures the complete frequency and time-domain characteristics of real spaces.

The engine uses zero-latency partitioned convolution algorithms with SIMD optimization, delivering studio-grade quality without the processing delays that plague lesser implementations. Load IRs from world-famous spaces or create your own captures to build a library of acoustic environments that define your signature sound.`,
    maintainer: 'MAP2 Audio',
    maintainerUrl: 'https://github.com/map2-audio',
    projectUrl: 'https://github.com/map2-audio',
    logoUrl: '/assets/map2-logo.svg',
    logoFallback: '✨',
    accentColor: '#a855f7',
    accentColorRgb: '168, 85, 247',
    license: 'MIT',
    features: ['Zero-latency processing', 'SIMD-optimized convolution', 'Any IR format support', 'Pattern sequencing', 'Envelope modulation'],
  },
  delay: {
    name: 'Cocoa Delay',
    tagline: 'Warm Delay with Character',
    description: `Cocoa Delay delivers the warmth and musicality of classic analog delays with modern flexibility. The drift control adds authentic wow and flutter that brings the delay to life—especially effective on melodic and harmonic material where subtle pitch modulation creates beautiful, evolving textures.

The standout ducking feature automatically reduces wet signal when you're playing, keeping peaks controlled and the mix clean—then brings the delay back during pauses for seamless, professional results. The saturation section, crafted using legendary Airwindows code, can range from subtle warming to aggressive overdrive. Users consistently describe it as one of the best free delays available, surpassing many paid alternatives.`,
    maintainer: 'tesselode',
    maintainerUrl: 'https://github.com/tesselode',
    projectUrl: 'https://github.com/tesselode/cocoa-delay',
    githubUrl: 'https://github.com/tesselode/cocoa-delay',
    logoUrl: 'https://raw.githubusercontent.com/tesselode/cocoa-delay/master/images/screenshot.png',
    logoFallback: '☕',
    accentColor: '#d4a574',
    accentColorRgb: '212, 165, 116',
    license: 'MIT',
    features: ['Analog drift (wow/flutter)', 'Intelligent ducking system', 'Airwindows saturation engine', 'Ping-pong & circular pan', 'Stereo offset widening'],
  },
  autotune: {
    name: 'Zita AT1',
    tagline: 'Auto-Tune with Clean Resampling',
    description: `Zita AT1 represents the pinnacle of open-source pitch correction, developed by renowned audio engineer Fons Adriaensen. The consensus among audio professionals favors Zita-AT1 for its superior quality over alternatives, using advanced sinc resampling algorithms that deliver remarkably clean, artifact-free pitch correction.

The algorithm excels at subtle pitch refinement where you want correction that's felt but not heard—preserving the natural character of the voice while ensuring pitch accuracy. With MIDI note control, you can define exactly which notes the singer should hit, enabling both corrective and creative pitch manipulation. Low latency mode (~10ms) makes it usable for live performance.`,
    maintainer: 'Fons Adriaensen',
    maintainerUrl: 'http://kokkinizita.linuxaudio.org/',
    projectUrl: 'https://kokkinizita.linuxaudio.org/linuxaudio/',
    githubUrl: 'https://github.com/royvegard/zita-at1',
    logoUrl: 'https://kokkinizita.linuxaudio.org/ostlogo.png',
    logoFallback: '🎤',
    accentColor: '#4ade80',
    accentColorRgb: '74, 222, 128',
    license: 'GPL-3.0',
    features: ['Superior sinc resampling', 'MIDI note control', 'Low latency (~10ms)', 'Artifact-free correction', 'Professional voice processing'],
  },
  triplespread: {
    name: 'TripleSpread',
    tagline: 'Stereo Width Enhancement',
    description: `From the legendary Airwindows collection by mastering engineer Chris Johnson, TripleSpread is a stereo tripler that creates massive width using pitch-shifted copies panned hard left and right. Based on GlitchShifter technology, it splits your track into three voices—one pitched slightly down and panned left, one centered, one pitched up and panned right.

The magic is in how the effect progressively fades out mid content as you increase wet mix, creating hyper-wide stereo that seamlessly transitions from your direct sound. On mono sources it creates lush width; on stereo pairs it sounds like a wall of instruments. Users describe it as "such a neat thickener" that they prefer over most chorus/doubler effects.`,
    maintainer: 'Chris Johnson',
    maintainerUrl: 'https://www.airwindows.com/',
    projectUrl: 'https://www.airwindows.com/',
    githubUrl: 'https://github.com/airwindows/airwindows',
    logoUrl: 'https://www.airwindows.com/wp-content/uploads/2023/01/cropped-airwindowslogo-1-192x192.png',
    logoFallback: '↔️',
    accentColor: '#a78bfa',
    accentColorRgb: '167, 139, 250',
    license: 'MIT',
    features: ['GlitchShifter-based tripling', 'Phase-coherent widening', 'Mid-content fade control', 'Zero-latency processing', 'Mastering-grade quality'],
  },
  valentine: {
    name: 'Valentine',
    tagline: 'Aggressive Compressor/Saturator',
    description: `Valentine is a compressor and distortion processor inspired by the hyper-compressed, crushed textures of Justice's seminal record "†". The signal path—Crush → Compress → Saturate → Soft Clip—is designed for character and attitude, not transparency.

The Crush mode downsamples to 27.5kHz with high-quality bit crushing for lo-fi destruction. The compressor's "Infinity" ratio (actually ~1000:1) with auto-adjusting threshold and knee delivers extreme pumping and breathing when pushed. The real magic happens when processing signals with ambience—with the right release settings, you can introduce musical pumping that breathes life into any source. Though designed for aggressive application, Valentine is flexible enough for subtle enhancement too.`,
    maintainer: 'Tote Bag Labs',
    maintainerUrl: 'https://github.com/tote-bag-labs',
    projectUrl: 'https://github.com/tote-bag-labs/valentine',
    githubUrl: 'https://github.com/tote-bag-labs/valentine',
    logoUrl: 'https://raw.githubusercontent.com/tote-bag-labs/valentine/main/valentine/Resources/logo.png',
    logoFallback: '💔',
    accentColor: '#e11d48',
    accentColorRgb: '225, 29, 72',
    license: 'GPL-3.0',
    features: ['Crush mode (27.5kHz downsample)', 'Infinity ratio compression', 'Tube-style saturation', 'Soft clip limiting', 'Pumping & breathing artifacts'],
  },
  zlequalizer: {
    name: 'ZL Equalizer',
    tagline: '16-Band Dynamic Parametric EQ',
    description: `ZL Equalizer delivers FabFilter Pro-Q level quality in a free, open-source package. With 16 fully-featured bands, each supporting dynamic processing with independent sidechain filtering, it's described by users as "without a doubt the best equalizer—free or paid."

Everything is rendered in 64-bit floating-point with precise de-cramped filters, ensuring pristine audio quality across the entire frequency spectrum. The visual interface provides intuitive control with multiple phase modes ranging from 0ms to 171ms latency depending on precision requirements. Per-band dynamics with relative threshold behavior makes surgical frequency-dependent compression accessible and musical.`,
    maintainer: 'ZL-Audio',
    maintainerUrl: 'https://github.com/ZL-Audio',
    projectUrl: 'https://zl-audio.github.io/ZLEqualizer/',
    githubUrl: 'https://github.com/ZL-Audio/ZLEqualizer',
    logoUrl: 'https://raw.githubusercontent.com/ZL-Audio/ZLEqualizer/master/docs/screenshot.png',
    logoFallback: '📊',
    accentColor: '#06b6d4',
    accentColorRgb: '6, 182, 212',
    license: 'GPL-3.0',
    features: ['16 dynamic bands', '64-bit float processing', 'De-cramped filters', 'Per-band sidechain', 'FabFilter Pro-Q inspired'],
  },
  freeverb3: {
    name: 'Freeverb3',
    tagline: 'SIMD-Optimized Algorithmic Reverb',
    description: `Freeverb3 is a comprehensive signal processing library featuring multiple studio-grade reverb algorithms with extensive SIMD optimization (3DNow!/SSE/SSE3/AVX/FMA) for maximum performance. The reverb collection includes algorithms used in legendary Lexicon hardware.

STRev delivers Lexicon-style plate reverb based on Jon Dattorro's AES algorithm. ProG Reverb recreates the 224XL Concert Hall—one of the best room reverbs available. NRev provides classic CCRMA plate character. Hibiki delivers "exceptionally 3D sounding" reverb that users describe as "on par with commercial stuff." Zero-latency multithreaded processing ensures real-time performance even with complex reverb tails.`,
    maintainer: 'Teru Kamogashira',
    maintainerUrl: 'https://www.nongnu.org/freeverb3/',
    projectUrl: 'https://www.nongnu.org/freeverb3/',
    githubUrl: 'https://github.com/gitGNU/gnu_freeverb3',
    logoUrl: 'https://www.gnu.org/graphics/heckert_gnu.transp.small.png',
    logoFallback: '🌊',
    accentColor: '#6366f1',
    accentColorRgb: '99, 102, 241',
    license: 'GPL-2.0',
    features: ['SSE/AVX SIMD optimization', 'Lexicon-style algorithms', 'ProG 224XL Concert Hall', 'STRev plate reverb', 'Zero-latency processing'],
  },
  whammy: {
    name: 'dm-Whammy',
    tagline: 'Pitch Shifting Perfection',
    description: `dm-Whammy brings the iconic sound of the DigiTech Whammy pedal to your DAW with a focus on CPU efficiency and audio quality. Written in Rust for maximum performance, it delivers ±24 semitone pitch shifting (2 full octaves up or down) with smooth, grain-based processing.

Developed as a less CPU-hungry alternative that still sounds great, it's perfect for dive bombs, harmony generation, and the dramatic pitch sweeps that defined countless rock and metal recordings. Available in LV2, VST3, CLAP, and AUv2 formats for cross-platform compatibility.`,
    maintainer: 'Dave Mollen',
    maintainerUrl: 'https://github.com/davemollen',
    projectUrl: 'https://github.com/davemollen/dm-Whammy',
    githubUrl: 'https://github.com/davemollen/dm-Whammy',
    logoUrl: 'https://raw.githubusercontent.com/davemollen/dm-Whammy/main/nih-plug/resources/icon.png',
    logoFallback: '🎵',
    accentColor: '#ec4899',
    accentColorRgb: '236, 72, 153',
    license: 'GPL-3.0',
    features: ['±24 semitone range', 'Grain-based processing', 'Low CPU usage', 'Written in Rust', 'Multi-format support'],
  },
  dragonfly: {
    name: 'Dragonfly Reverb',
    tagline: 'Studio-Quality Algorithmic Reverbs',
    description: `Dragonfly Reverb is a bundle of four meticulously crafted reverb plugins built on Freeverb3's Hibiki algorithms. Hall delivers concert hall acoustics with rich, dimensional tails. Room creates intimate acoustic environments perfect for tracking. Plate provides classic studio reverb character. Early Reflections handles spatial positioning with surgical precision.

Users describe the sound as "fantastic in a mix" with "no logical reason for not having such high quality reverb in your DAW." The warmth and unique character of these reverbs has won over even demanding users who claim they "won't be needing any other reverb plugins anymore." Low CPU usage, 100+ factory presets, and light/dark UI themes complete the package.`,
    maintainer: 'Michael Willis',
    maintainerUrl: 'https://github.com/michaelwillis',
    projectUrl: 'https://michaelwillis.github.io/dragonfly-reverb/',
    githubUrl: 'https://github.com/michaelwillis/dragonfly-reverb',
    logoUrl: 'https://raw.githubusercontent.com/michaelwillis/dragonfly-reverb/master/common/artwork/dragonfly.png',
    logoFallback: '🐉',
    accentColor: '#8b5cf6',
    accentColorRgb: '139, 92, 246',
    license: 'GPL-3.0',
    features: ['4 specialized algorithms', 'Hibiki/Freeverb3 based', '100+ factory presets', 'Low CPU usage', 'Light/dark UI themes'],
  }
}

interface ProjectAttributionProps {
  projectId: keyof typeof NATIVE_PLUGIN_PROJECTS
  compact?: boolean
  showFeatures?: boolean
}

export function ProjectAttribution({
  projectId,
  compact = false,
  showFeatures = true,
}: ProjectAttributionProps) {
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
        padding: compact ? 12 : 20,
        marginBottom: compact ? 12 : 20,
        transition: 'all 0.3s ease',
        boxShadow: isHovered ? `0 0 20px rgba(${project.accentColorRgb}, 0.15)` : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Enlarged Project Logo - Prominent Display */}
      {!compact && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 20,
        }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${project.accentColor}25, ${project.accentColor}10)`,
              border: `2px solid ${project.accentColor}60`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: `0 0 30px rgba(${project.accentColorRgb}, 0.3), inset 0 0 20px rgba(${project.accentColorRgb}, 0.1)`,
              transition: 'all 0.3s ease',
              transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {project.logoUrl && !imageError ? (
              <img
                src={project.logoUrl}
                alt={project.name}
                style={{
                  width: '75%',
                  height: '75%',
                  objectFit: 'contain',
                  filter: `drop-shadow(0 0 8px rgba(${project.accentColorRgb}, 0.5))`,
                }}
                onError={() => setImageError(true)}
              />
            ) : (
              <span style={{ fontSize: 48 }}>{project.logoFallback}</span>
            )}
          </div>
        </div>
      )}

      {/* Header with title and tagline - Centered when not compact */}
      <div style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'flex-start' : 'center',
        gap: compact ? 14 : 8,
        marginBottom: compact ? 10 : 16,
        textAlign: compact ? 'left' : 'center',
      }}>
        {/* Small logo for compact mode */}
        {compact && (
          <div
            style={{
              width: 40,
              height: 40,
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
              <span style={{ fontSize: 20 }}>{project.logoFallback}</span>
            )}
          </div>
        )}

        {/* Title and tagline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: compact ? 14 : 20,
            fontWeight: 700,
            color: project.accentColor,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: compact ? 'flex-start' : 'center',
            gap: 8,
            flexWrap: 'wrap',
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
            fontSize: compact ? 11 : 13,
            color: '#999',
            fontWeight: 500,
            fontStyle: 'italic',
          }}>
            {project.tagline}
          </div>
        </div>
      </div>

      {/* Detailed Description */}
      {!compact && (
        <div style={{
          fontSize: 12,
          color: '#bbb',
          lineHeight: 1.7,
          margin: '0 0 16px 0',
          whiteSpace: 'pre-line',
        }}>
          {project.description.split('\n\n').map((paragraph, idx) => (
            <p key={idx} style={{
              margin: idx === 0 ? 0 : '12px 0 0 0',
              padding: 0,
            }}>
              {paragraph}
            </p>
          ))}
        </div>
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
