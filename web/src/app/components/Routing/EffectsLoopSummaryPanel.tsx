import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Renew as ArrowsClockwise, Renew as SpinnerGap, Waveform as WaveSine, WarningAlt as WarningCircle } from '@carbon/icons-react'
import type { Chain, EffectsLoop, LoopInsertion } from '../../../map2/types'
import { effectsLoopsApi } from '../../../map2/api'
import { LegacyButton } from '../shared/LegacyButton'
import { useToasts } from '../Toasts'

interface EffectsLoopSummaryPanelProps {
  nodeId?: string | null
  chains: Chain[]
  remoteLabel?: string | null
  latencyMs?: number | null
}

export function EffectsLoopSummaryPanel({
  nodeId,
  chains,
  remoteLabel,
  latencyMs,
}: EffectsLoopSummaryPanelProps) {
  const qc = useQueryClient()
  const { pushToast } = useToasts()
  const [selectedChainId, setSelectedChainId] = useState<number | null>(chains[0]?.id ?? null)

  const loopsQuery = useQuery({
    queryKey: ['effects-loops', nodeId ?? 'local', 'list'],
    queryFn: async () => (await effectsLoopsApi.list(nodeId)).loops,
    staleTime: 5000,
  })

  const insertionsQuery = useQuery({
    queryKey: ['effects-loops', nodeId ?? 'local', 'chain-insertions', selectedChainId],
    queryFn: async () => {
      if (selectedChainId === null) {
        return {
          chain_id: 0,
          loop_insertions: [] as LoopInsertion[],
          effects_loops: [] as EffectsLoop[],
          count: 0,
        }
      }
      return effectsLoopsApi.listChainInsertions(selectedChainId, nodeId)
    },
    enabled: selectedChainId !== null,
    staleTime: 5000,
  })

  useEffect(() => {
    if (selectedChainId === null && chains.length > 0) {
      setSelectedChainId(chains[0].id)
    }
  }, [chains, selectedChainId])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['effects-loops', nodeId ?? 'local'] })
  }

  const activateLoop = useMutation({
    mutationFn: async (loopId: string) => effectsLoopsApi.activate(loopId, { audition_mode: false }, nodeId),
    onSuccess: invalidate,
  })
  const calibrateLoop = useMutation({
    mutationFn: async (loopId: string) => effectsLoopsApi.calibrate(loopId, {}, nodeId),
    onSuccess: invalidate,
  })
  const bypassLoop = useMutation({
    mutationFn: async ({ loopId, bypass }: { loopId: string; bypass: boolean }) => effectsLoopsApi.bypass(loopId, bypass, nodeId),
    onSuccess: invalidate,
  })

  const loops = loopsQuery.data ?? []
  const insertions = insertionsQuery.data?.loop_insertions ?? []
  const insertionIds = useMemo(() => new Set(insertions.map((insertion) => insertion.loop_id)), [insertions])

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid rgba(168, 85, 247, 0.16)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.82))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <WaveSine size={18} style={{ color: '#c084fc' }} />
          <strong>Effects Loops</strong>
          <span className="pill muted">{loops.length} loops</span>
          {remoteLabel && <span className="pill success">Remote Control · {remoteLabel}</span>}
          {remoteLabel && typeof latencyMs === 'number' && latencyMs > 10 && (
            <span className="pill warn">{latencyMs.toFixed(1)} ms</span>
          )}
        </div>
        <LegacyButton variant="ghost" size="sm" iconDescription="Refresh effects loops" onClick={invalidate}>
          <ArrowsClockwise size={14} />
        </LegacyButton>
      </div>

      {chains.length > 0 && (
        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={{ marginBottom: 6, fontSize: 12, color: '#94a3b8' }}>Inspect chain insertions</div>
          <select
            value={selectedChainId ?? ''}
            onChange={(event) => setSelectedChainId(event.target.value ? Number(event.target.value) : null)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              color: '#e2e8f0',
            }}
          >
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {(loopsQuery.isLoading || insertionsQuery.isLoading) ? (
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <SpinnerGap size={16} className="spin" />
          <span className="muted">Loading loop state…</span>
        </div>
      ) : loopsQuery.isError ? (
        <div className="pill warn">Failed to load effects loops</div>
      ) : loops.length === 0 ? (
        <div className="muted" style={{ lineHeight: 1.6 }}>
          No effects loops are configured on this node.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {loops.map((loop) => {
            const inserted = insertionIds.has(loop.loop_id)
            const busy = activateLoop.isPending || calibrateLoop.isPending || bypassLoop.isPending
            return (
              <div
                key={loop.loop_id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(30, 41, 59, 0.55)',
                  border: inserted ? '1px solid rgba(168, 85, 247, 0.28)' : '1px solid rgba(148, 163, 184, 0.12)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{loop.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {loop.topology} · {loop.channels} ch · {loop.loop_id}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className={`pill ${loop.health_status === 'healthy' ? 'success' : 'warn'}`}>
                      {loop.health_status}
                    </span>
                    {inserted && <span className="pill success">In selected chain</span>}
                  </div>
                </div>

                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  State {loop.state_actual} · calibration {loop.calibration_status}
                  {loop.measured_added_latency_ms == null ? '' : ` · ${loop.measured_added_latency_ms.toFixed(1)} ms`}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <LegacyButton
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await activateLoop.mutateAsync(loop.loop_id)
                        pushToast(`Activated ${loop.name}`, 'success')
                      } catch (error) {
                        pushToast(error instanceof Error ? error.message : 'Failed to activate loop', 'error')
                      }
                    }}
                  >
                    Activate
                  </LegacyButton>
                  <LegacyButton
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await bypassLoop.mutateAsync({ loopId: loop.loop_id, bypass: loop.state_actual !== 'bypassed' })
                        pushToast(`Updated ${loop.name} bypass`, 'success')
                      } catch (error) {
                        pushToast(error instanceof Error ? error.message : 'Failed to update bypass', 'error')
                      }
                    }}
                  >
                    {loop.state_actual === 'bypassed' ? 'Enable' : 'Bypass'}
                  </LegacyButton>
                  <LegacyButton
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await calibrateLoop.mutateAsync(loop.loop_id)
                        pushToast(`Calibration started for ${loop.name}`, 'info')
                      } catch (error) {
                        pushToast(error instanceof Error ? error.message : 'Failed to calibrate loop', 'error')
                      }
                    }}
                  >
                    Calibrate
                  </LegacyButton>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {remoteLabel && typeof latencyMs === 'number' && latencyMs > 10 && (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            color: '#fbbf24',
            fontSize: 12,
          }}
        >
          <WarningCircle size={16} />
          Remote loop control may respond more slowly above 10 ms peer latency.
        </div>
      )}
    </div>
  )
}

export default EffectsLoopSummaryPanel
