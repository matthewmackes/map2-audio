import { useState } from 'react'
import { Renew as ArrowsClockwise, Upload as CloudArrowUp, Download as CloudArrowDown, Security as ShieldCheck, WarningAlt as Warning } from '@carbon/icons-react'
import { LegacyButton } from '../shared/LegacyButton'

export function UpdatesTab() {
  const [nodeId, setNodeId] = useState('')
  const [status, setStatus] = useState('Idle')
  const [lastResult, setLastResult] = useState<any>(null)

  const post = async (path: string, payload?: any) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  const get = async (path: string) => {
    const res = await fetch(path)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  const run = async (label: string, fn: () => Promise<any>) => {
    try {
      setStatus(label)
      const result = await fn()
      setLastResult(result)
      setStatus('Done')
    } catch (e: any) {
      setLastResult({ error: e?.message || String(e) })
      setStatus('Failed')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <LegacyButton variant="secondary" renderIcon={CloudArrowUp} onClick={() => run('Triggering cluster update', () => post('/api/cluster/update/trigger', { target_version: 'latest', dry_run: false }))}>
          Update All Nodes
        </LegacyButton>
        <LegacyButton variant="secondary" renderIcon={ArrowsClockwise} onClick={() => run('Checking schedule', () => get('/api/cluster/update/schedule'))}>
          Check Schedule
        </LegacyButton>
        <LegacyButton variant="secondary" renderIcon={CloudArrowDown} onClick={() => run('Loading manifest', () => get('/api/cluster/update/manifest'))}>
          View Manifest
        </LegacyButton>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={nodeId}
          onChange={e => setNodeId(e.target.value)}
          placeholder="node id"
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #333', background: '#1f1f1f', color: '#fff' }}
        />
        <LegacyButton
          variant="secondary"
          renderIcon={ShieldCheck}
          onClick={() => run('Capturing manifest', () => post('/api/cluster/update/manifest/capture', { source_node_id: nodeId }))}
          disabled={!nodeId}
        >
          Capture Manifest
        </LegacyButton>
        <LegacyButton
          variant="secondary"
          renderIcon={Warning}
          onClick={() => run('Checking drift', () => get('/api/cluster/update/manifest/drift'))}
        >
          Check Drift
        </LegacyButton>
        <LegacyButton
          variant="secondary"
          renderIcon={ShieldCheck}
          onClick={() => run('Enforcing manifest', () => post('/api/cluster/update/manifest/enforce', { node_id: nodeId, dry_run: false }))}
          disabled={!nodeId}
        >
          Enforce Manifest
        </LegacyButton>
      </div>

      <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8, background: '#1a1a1a' }}>
        <div style={{ fontSize: 12, color: '#999' }}>Status</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>{status}</div>
      </div>

      {lastResult && (
        <pre style={{ whiteSpace: 'pre-wrap', background: '#111', padding: 12, borderRadius: 8, border: '1px solid #333', color: '#e0e0e0' }}>
{JSON.stringify(lastResult, null, 2)}
        </pre>
      )}
    </div>
  )
}
