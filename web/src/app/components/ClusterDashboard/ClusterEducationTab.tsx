import { CaretDown, CaretRight, Lightning } from '@phosphor-icons/react'
import { useState } from 'react'

interface EducationSection {
  id: string
  title: string
  icon: React.ReactNode
  description: string
  content: React.ReactNode
}

export function ClusterEducationTab() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['what-is']))

  const toggleSection = (id: string) => {
    const newSet = new Set(expandedSections)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setExpandedSections(newSet)
  }

  const sections: EducationSection[] = [
    {
      id: 'what-is',
      title: 'What is a Cluster?',
      icon: <Lightning size={20} weight="duotone" />,
      description: 'Learn the basics of audio clustering',
      content: (
        <div style={{ lineHeight: 1.6, color: '#d0d0d0', fontSize: 13 }}>
          <p>
            A cluster is a group of computers (nodes) working together to process audio. Instead of running all audio
            processing on a single machine, you can distribute the load across multiple nodes, enabling:
          </p>
          <ul style={{ marginTop: 12, marginLeft: 20 }}>
            <li>✅ <strong>Higher processing capacity</strong> - More plugins running simultaneously</li>
            <li>✅ <strong>Redundancy</strong> - Flows continue if a node fails</li>
            <li>✅ <strong>Better organization</strong> - Dedicated audio nodes + management node</li>
            <li>✅ <strong>Remote control</strong> - Manage cluster from any device on network</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Think of it like a studio: one machine handles recording/audio (AUDIO-NODE), while another handles monitoring
            and control (CONTROL-NODE).
          </p>
        </div>
      ),
    },
    {
      id: 'deployment-modes',
      title: 'Deployment Modes',
      icon: <Lightning size={20} weight="duotone" />,
      description: 'Different ways to deploy the system',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            {
              name: 'ALL-IN-ONE',
              emoji: '🖥️',
              description: 'Everything on one machine',
              use: 'Laptop, desktop, development',
            },
            {
              name: 'AUDIO-NODE',
              emoji: '🎵',
              description: 'Dedicated audio processor',
              use: 'Server with audio gear',
            },
            {
              name: 'CONTROL-NODE',
              emoji: '🎚️',
              description: 'UI and management',
              use: 'Remote control machine',
            },
            {
              name: 'FRONTEND-ONLY',
              emoji: '📱',
              description: 'Thin client UI',
              use: 'Tablet, minimal device',
            },
          ].map(mode => (
            <div
              key={mode.name}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid #444',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {mode.emoji} {mode.name}
              </div>
              <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 6 }}>{mode.description}</div>
              <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Best for: {mode.use}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'node-roles',
      title: 'Node Roles',
      icon: <Lightning size={20} weight="duotone" />,
      description: 'Different types of nodes in a cluster',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'rgba(0, 255, 65, 0.1)', border: '1px solid #00ff41', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#00ff41', marginBottom: 4 }}>🎵 Audio Node</div>
            <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.5 }}>
              Handles real-time audio processing. Runs plugins, manages audio I/O, reports metrics to management node.
            </div>
          </div>

          <div style={{ background: 'rgba(37, 99, 235, 0.1)', border: '1px solid #2563eb', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', marginBottom: 4 }}>🏚️ Management Node</div>
            <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.5 }}>
              Orchestrates the cluster. Manages node discovery, flow distribution, monitoring, and provides web UI for control.
            </div>
          </div>

          <div style={{ background: 'rgba(255, 170, 0, 0.1)', border: '1px solid #ffaa00', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffaa00', marginBottom: 4 }}>🔄 Standby Node</div>
            <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.5 }}>
              Backup management node that takes over if primary fails. Syncs state regularly for fast failover.
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'data-flow',
      title: 'How Data Flows',
      icon: <Lightning size={20} weight="duotone" />,
      description: 'Data transmission between nodes',
      content: (
        <div style={{ lineHeight: 1.6, color: '#d0d0d0', fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Three types of data flow in a cluster:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(0, 255, 65, 0.1)', padding: '10px 12px', borderRadius: 6 }}>
              <strong>🔊 Audio Data</strong>
              <div style={{ color: '#a0a0a0', fontSize: 12, marginTop: 4 }}>
                JACK audio I/O (local). Complete flows run independently on each node.
              </div>
            </div>
            <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '10px 12px', borderRadius: 6 }}>
              <strong>⚡ Events</strong>
              <div style={{ color: '#a0a0a0', fontSize: 12, marginTop: 4 }}>
                WebSocket real-time events (status changes, alerts, system events). Broadcast to all nodes.
              </div>
            </div>
            <div style={{ background: 'rgba(255, 170, 0, 0.1)', padding: '10px 12px', borderRadius: 6 }}>
              <strong>📊 Metrics</strong>
              <div style={{ color: '#a0a0a0', fontSize: 12, marginTop: 4 }}>
                REST API (30s intervals). Health scores, CPU, memory, DSP load, network latency.
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'redundancy',
      title: 'Redundancy & Failover',
      icon: <Lightning size={20} weight="duotone" />,
      description: 'How the cluster stays online',
      content: (
        <div style={{ lineHeight: 1.6, color: '#d0d0d0', fontSize: 13 }}>
          <p>
            <strong>Redundant Flows:</strong> Critical flows can run on multiple nodes (Primary + Standby). If the primary
            fails, audio automatically switches to standby in &lt;2 seconds.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Management Failover:</strong> A standby management node monitors the primary. If the primary becomes
            unresponsive, the standby automatically takes over cluster control.
          </p>
          <div
            style={{
              background: 'rgba(0, 255, 65, 0.1)',
              border: '1px solid #00ff41',
              borderRadius: 8,
              padding: '12px',
              marginTop: 12,
              fontSize: 12,
            }}
          >
            <strong style={{ color: '#00ff41' }}>✅ Result:</strong> Zero downtime for critical paths. Audio continues
            even if hardware fails.
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="cluster-education-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: 'linear-gradient(155deg, #2d2d2d, #333333)',
          border: '2px solid #2563eb',
          borderRadius: 12,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>📚 Cluster Learning Guide</div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.6 }}>
          Learn how the MAP2 cluster works, from basic concepts to advanced topics. Expand each section to dive deeper.
        </div>
      </div>

      {sections.map(section => (
        <div
          key={section.id}
          style={{
            background: expandedSections.has(section.id) ? 'rgba(37, 99, 235, 0.05)' : 'rgba(255, 255, 255, 0.02)',
            border: '2px solid ' + (expandedSections.has(section.id) ? '#2563eb' : '#333'),
            borderRadius: 12,
            overflow: 'hidden',
            transition: 'all 0.2s',
          }}
        >
          <button
            onClick={() => toggleSection(section.id)}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: expandedSections.has(section.id) ? '#2563eb' : '#d0d0d0',
              transition: 'color 0.2s',
            }}
          >
            {expandedSections.has(section.id) ? <CaretDown size={18} weight="bold" /> : <CaretRight size={18} weight="bold" />}
            <div style={{ fontSize: 16 }}>{section.icon}</div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              {section.title}
              <div style={{ fontSize: 11, fontWeight: 400, color: '#a0a0a0', marginTop: 2 }}>{section.description}</div>
            </div>
          </button>

          {expandedSections.has(section.id) && (
            <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid #333' }}>{section.content}</div>
          )}
        </div>
      ))}
    </div>
  )
}
