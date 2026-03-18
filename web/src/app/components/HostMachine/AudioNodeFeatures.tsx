/**
 * Audio Node Features - MAP2 Audio Optimization Highlights
 */

import { ChartLine as TrendUp, Flash as Lightning, Meter, Music, Security as Shield, Windy as Wind } from '@carbon/icons-react'
import type { HostMachineInfo, SystemHealthOverview, BrandingAssets } from '@/map2/types'

interface AudioFeaturesProps {
  machineInfo: HostMachineInfo
  healthOverview?: SystemHealthOverview
  branding: BrandingAssets
}

interface Feature {
  icon: React.ReactNode
  title: string
  description: string
  tone: 'success' | 'warning' | 'info'
  badge?: string
}

export default function AudioNodeFeatures({ machineInfo, healthOverview, branding }: AudioFeaturesProps) {
  const features: Feature[] = [
    {
      icon: <Lightning size={18} />,
      title: 'Multi-Core Processing',
      description: `${machineInfo.cpu_threads} logical CPUs available for parallel DSP and plugin processing`,
      tone: machineInfo.cpu_cores >= 4 ? 'success' : machineInfo.cpu_cores >= 2 ? 'success' : 'warning',
      badge: machineInfo.cpu_cores >= 4 ? 'OPTIMAL' : undefined,
    },
    {
      icon: <Music size={18} />,
      title: 'Large Buffer Support',
      description: `${(machineInfo.total_memory_mb / 1024).toFixed(1)} GB RAM supports large buffer sizes for ultra-low latency monitoring`,
      tone: machineInfo.total_memory_mb >= 8192 ? 'success' : machineInfo.total_memory_mb >= 4096 ? 'success' : 'warning',
      badge: machineInfo.total_memory_mb >= 8192 ? 'OPTIMAL' : undefined,
    },
    {
      icon: <Wind size={18} />,
      title: 'Thermal Management',
      description: `${branding.sff_optimized ? 'SFF-optimized' : 'Compact'} design with efficient cooling for sustained real-time audio`,
      tone: healthOverview?.overall_health === 'excellent' ? 'success' : 'success',
    },
    {
      icon: <Meter size={18} />,
      title: 'Real-Time Capable',
      description: 'CPU frequency scaling and RT scheduling support for predictable audio performance',
      tone: machineInfo.cpu_cores >= 4 ? 'success' : 'success',
      badge: machineInfo.cpu_cores >= 4 ? 'OPTIMAL' : undefined,
    },
    {
      icon: <TrendUp size={18} />,
      title: 'Live Performance Metrics',
      description: 'CPU, memory, temperature, and latency monitoring for audio optimization',
      tone: 'info',
    },
    {
      icon: <Shield size={18} />,
      title: 'Dedicated Audio Cores',
      description: 'Isolated CPU cores for JUCE engine, LV2 plugins, and DSP graph processing',
      tone: 'info',
    },
  ]

  const guidelines = [
    { label: 'Max Plugin Chain', value: '25–30 plugins @ 48 kHz / 256 samples' },
    { label: 'RT Headroom Target', value: '≤ 70% CPU utilization' },
    { label: 'IR Processing', value: '2× 8192-point convolutions real-time' },
    { label: 'Recommended Buffer', value: '256 samples (5.3 ms @ 48 kHz)' },
  ]

  return (
    <div className="hm-audio-features">

      {/* Summary banner */}
      <div className="hm-audio-banner">
        <div className="hm-audio-banner__title">MAP2 Audio Performance Profile</div>
        <p className="hm-audio-banner__body">
          This {branding.sff_optimized ? 'compact ' : ''}system is optimized for real-time audio production
          with the MAP2 Audio Platform. The {machineInfo.cpu_cores}-core processor and{' '}
          {(machineInfo.total_memory_mb / 1024).toFixed(1)} GB of memory provide excellent headroom for
          complex plugin chains, neural amp modeling, and impulse response convolution at low latencies.
        </p>
      </div>

      {/* Feature cards */}
      <div className="hm-feature-grid">
        {features.map((f) => (
          <div key={f.title} className={`hm-feature-card hm-feature-card--${f.tone}`}>
            <div className="hm-feature-card__top">
              <span className="hm-feature-card__icon">{f.icon}</span>
              <span className="hm-feature-card__title">{f.title}</span>
              {f.badge && <span className="hm-feature-card__badge">{f.badge}</span>}
            </div>
            <p className="hm-feature-card__desc">{f.description}</p>
          </div>
        ))}
      </div>

      {/* Workloads */}
      <div className="hm-workloads">
        <div className="hm-section-card">
          <div className="hm-section-card__title">Well-Suited For</div>
          <ul className="hm-check-list">
            <li>Complex guitar processing chains (10+ effects)</li>
            <li>Real-time NAM (Neural Amp Modeler) inference</li>
            <li>Convolution reverbs &amp; cabinet IR processing</li>
            <li>Live performance with complex setups</li>
            <li>Recording &amp; streaming applications</li>
          </ul>
        </div>
        <div className="hm-section-card">
          <div className="hm-section-card__title">Configuration Notes</div>
          <ul className="hm-info-list">
            <li>Use SFF-optimized cooling for sustained RT operation</li>
            <li>Monitor CPU &amp; thermal status in the Performance tab</li>
            <li>Configure audio buffer size to match latency requirements</li>
            <li>Use the Cluster Dashboard for multi-node distributed processing</li>
            <li>Enable RT priority scheduling for critical audio threads</li>
          </ul>
        </div>
      </div>

      {/* Performance guidelines */}
      <div className="hm-guidelines">
        <div className="hm-guidelines__title">Performance Guidelines</div>
        <div className="hm-guidelines__grid">
          {guidelines.map(({ label, value }) => (
            <div key={label} className="hm-guideline-item">
              <div className="hm-guideline-item__label">{label}</div>
              <div className="hm-guideline-item__value">{value}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
