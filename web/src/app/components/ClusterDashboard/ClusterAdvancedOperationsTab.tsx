import { useEffect, useState } from 'react'
import { Renew as ArrowsClockwise, CheckmarkFilled as CheckCircle, WarningAlt as Warning } from '@carbon/icons-react'
import { LegacyButton } from '../shared/LegacyButton'

interface ResetPreviewResponse {
  status: string
  timestamp?: string
  identity?: {
    basic_node_id?: string | null
    enhanced_node_id?: string | null
    role?: string | null
    hostname?: string
    local_addresses?: string[]
  }
  targets?: {
    existing?: string[]
    missing?: string[]
  }
}

interface ResetExecuteResponse {
  status: string
  success?: boolean
  warnings?: string[]
  rejoin?: {
    success?: boolean
    error?: string
    message?: string
  }
  [key: string]: any
}

const CONFIRMATION_TEXT = 'RESET REJOIN'

export function ClusterAdvancedOperationsTab() {
  const [preview, setPreview] = useState<ResetPreviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [managementNodeIp, setManagementNodeIp] = useState('')
  const [rejoin, setRejoin] = useState(true)
  const [clearRegistryState, setClearRegistryState] = useState(true)
  const [confirmation, setConfirmation] = useState('')

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ResetExecuteResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const loadPreview = async () => {
    try {
      setLoadingPreview(true)
      setPreviewError(null)
      const response = await fetch('/api/cluster/node/reset-default-rejoin/preview')
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as ResetPreviewResponse
      setPreview(payload)
    } catch (error: any) {
      setPreview(null)
      setPreviewError(error?.message || String(error))
    } finally {
      setLoadingPreview(false)
    }
  }

  const runReset = async () => {
    try {
      setRunning(true)
      setRunError(null)
      setResult(null)

      const response = await fetch('/api/cluster/node/reset-default-rejoin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          management_node_ip: managementNodeIp.trim() || null,
          rejoin,
          clear_registry_state: clearRegistryState,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as ResetExecuteResponse
      setResult(payload)
      await loadPreview()
      setConfirmation('')
    } catch (error: any) {
      setRunError(error?.message || String(error))
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    loadPreview()
  }, [])

  const canExecute = confirmation.trim() === CONFIRMATION_TEXT && !running

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: 'linear-gradient(160deg, rgba(180, 83, 9, 0.15), rgba(127, 29, 29, 0.1))',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Warning size={18} style={{ color: '#f59e0b' }} />
          <div style={{ fontWeight: 700, color: '#fbbf24' }}>Reset to Default, Rejoin</div>
        </div>
        <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.5 }}>
          Use this on cloned nodes to clear persisted identity/trust state and re-register with the cluster.
          Audio content and preset data are preserved.
        </div>
      </div>

      <div
        style={{
          background: '#151a24',
          border: '1px solid #283043',
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Reset Preview
          </div>
          <LegacyButton variant="secondary" size="sm" renderIcon={ArrowsClockwise} onClick={loadPreview} disabled={loadingPreview}>
            {loadingPreview ? 'Refreshing...' : 'Refresh'}
          </LegacyButton>
        </div>

        {previewError && (
          <div style={{ color: '#fca5a5', fontSize: 13 }}>
            Failed to load preview: {previewError}
          </div>
        )}

        {!previewError && preview && (
          <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#d1d5db' }}>
            <div>Host: <strong>{preview.identity?.hostname || 'unknown'}</strong></div>
            <div>Basic Node ID: <strong>{preview.identity?.basic_node_id || 'not set'}</strong></div>
            <div>Enhanced Node ID: <strong>{preview.identity?.enhanced_node_id || 'not set'}</strong></div>
            <div>Role: <strong>{preview.identity?.role || 'unknown'}</strong></div>
            <div>
              Reset targets present: <strong>{preview.targets?.existing?.length || 0}</strong>
              {preview.targets?.existing && preview.targets.existing.length > 0 && (
                <div style={{ marginTop: 6, color: '#9ca3af', fontSize: 12 }}>
                  {preview.targets.existing.join(' | ')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          background: '#121720',
          border: '1px solid #243042',
          borderRadius: 10,
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Execution Options
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e7eb' }}>
          <input
            type="checkbox"
            checked={rejoin}
            onChange={event => setRejoin(event.target.checked)}
          />
          Rejoin cluster immediately after reset
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e7eb' }}>
          <input
            type="checkbox"
            checked={clearRegistryState}
            onChange={event => setClearRegistryState(event.target.checked)}
          />
          Clear local cluster registry membership before rejoin
        </label>

        <div style={{ display: 'grid', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#9ca3af' }}>Management Node IP (optional)</label>
          <input
            value={managementNodeIp}
            onChange={event => setManagementNodeIp(event.target.value)}
            placeholder="e.g., 192.168.10.20"
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#fff',
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#fbbf24' }}>
            Type <strong>{CONFIRMATION_TEXT}</strong> to enable execution
          </label>
          <input
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            placeholder={CONFIRMATION_TEXT}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid #b45309',
              background: '#1f2937',
              color: '#fff',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LegacyButton
            variant="danger"
            disabled={!canExecute}
            onClick={runReset}
            style={{
              background: canExecute ? 'linear-gradient(135deg, #b45309, #7f1d1d)' : 'rgba(75, 85, 99, 0.3)',
              border: canExecute ? '1px solid #f59e0b' : '1px solid #374151',
              color: '#fff',
              cursor: canExecute ? 'pointer' : 'not-allowed',
            }}
          >
            {running ? 'Running reset...' : 'Reset to Default, Rejoin'}
          </LegacyButton>
          {result?.success && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#34d399' }}>
              <CheckCircle size={14} />
              Completed
            </span>
          )}
        </div>

        {runError && (
          <div style={{ color: '#fca5a5', fontSize: 13 }}>
            Operation failed: {runError}
          </div>
        )}
      </div>

      {result && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: 8,
            padding: 12,
            color: '#cbd5e1',
            fontSize: 12,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
