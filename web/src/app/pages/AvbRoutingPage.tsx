import React from 'react'
import { AvbRoutingApp } from '../components/AvbRouting'

export function AvbRoutingPage() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(90deg, rgba(8,145,178,0.2) 0%, rgba(30,41,59,0.6) 100%)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
          Unified Routing Studio
        </div>
        <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.75)' }}>
          Topology + matrix + signal-chain mapping with canonical AVB health diagnostics
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <AvbRoutingApp />
      </div>
    </div>
  )
}
