import { useCallback, useEffect, useState } from 'react'
import { Layer, Tag, Tile, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react'
import { MorphPad } from '../components/StateAuthority/MorphPad'
import { BlockPicker } from '../components/StateAuthority/BlockPicker'
import {
  stateAuthorityApi,
  type StateAuthorityCatalogEntry,
  type StateAuthorityReconciliationMetrics,
} from '../../map2/clients/stateAuthority'
import './StateAuthorityPage.css'

// Dedicated State Authority workspace — dashboard for the tonechaser workflow:
//   1. Morph Pad — A/B/C/D quad XY control bound to the C++ MorphEngine.
//   2. Block Picker — tonechaser URI catalog browser with search + type filter.
//   3. Reconciliation — live Layer 1 / Layer 2 metrics from the scheduler
//      (empty-counter fallback when the scheduler isn't running).
//
// This is the dedicated, no-surprises view — the Snapshot Editor will mount
// the same components inline in a follow-up.

export function StateAuthorityPage() {
  const [lastPicked, setLastPicked] = useState<StateAuthorityCatalogEntry | null>(null)
  const [metrics, setMetrics] = useState<StateAuthorityReconciliationMetrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const refreshMetrics = useCallback(async () => {
    try {
      const payload = await stateAuthorityApi.getReconciliationMetrics()
      setMetrics(payload)
      setMetricsError(null)
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refreshMetrics()
    const handle = setInterval(refreshMetrics, 5000)
    return () => clearInterval(handle)
  }, [refreshMetrics])

  return (
    <Layer className="state-authority-page">
      <header className="state-authority-page__header">
        <h1>State Authority</h1>
        <p>
          Tonechaser workflow — morph between A/B/C/D tones, browse the canonical URI catalog,
          and watch reconciliation metrics tick live.
        </p>
      </header>

      <Tabs>
        <TabList aria-label="State Authority workspaces">
          <Tab>Morph Pad</Tab>
          <Tab>Block Picker</Tab>
          <Tab>Reconciliation</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="state-authority-page__section">
              <h2>A/B/C/D Quad Morph</h2>
              <p className="state-authority-page__help">
                Drag the knob inside the pad. X and Y are interpolated at audio-block rate in the
                C++ MorphEngine — continuous parameters sweep smoothly, discrete parameters snap
                at 50%.
              </p>
              <MorphPad size={280} />
            </div>
          </TabPanel>

          <TabPanel>
            <div className="state-authority-page__section">
              <h2>Tonechaser Block Picker</h2>
              <p className="state-authority-page__help">
                Every block in the canonical <code>map2:&#123;fx|io|sys|ctrl&#125;:name</code>{' '}
                catalog, searchable by label, category, URI, or description. System-managed
                blocks (auto-injected at runtime) are hidden by default.
              </p>
              <BlockPicker
                onPick={(entry) => setLastPicked(entry)}
                hideSystemManaged
              />
              {lastPicked ? (
                <Tile className="state-authority-page__last-pick">
                  <div className="state-authority-page__last-pick-header">
                    <span className="state-authority-page__last-pick-label">
                      Last picked
                    </span>
                    <Tag size="sm" type="cyan">{lastPicked.type}</Tag>
                  </div>
                  <div className="state-authority-page__last-pick-body">
                    <strong>{lastPicked.label}</strong>
                    <code>{lastPicked.uri}</code>
                    <p>{lastPicked.description}</p>
                  </div>
                </Tile>
              ) : null}
            </div>
          </TabPanel>

          <TabPanel>
            <div className="state-authority-page__section">
              <h2>Reconciliation</h2>
              <p className="state-authority-page__help">
                Layer 1 (local self-heal) ticks every 5 seconds with 1% parameter drift
                tolerance. Layer 2 (management-node coordination) runs only when this node is
                management; currently <em>disabled in this environment</em> until the etcd
                aggregator is wired.
              </p>
              {metricsError ? (
                <Tile className="state-authority-page__metrics-error">
                  Failed to load metrics: {metricsError}
                </Tile>
              ) : null}
              {metrics ? (
                <div className="state-authority-page__metrics">
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Local runs</Tag>
                    <span>{metrics.metrics.local_runs_total}</span>
                  </div>
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Local drift observed</Tag>
                    <span>{metrics.metrics.local_drift_detected_total}</span>
                  </div>
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Corrections applied</Tag>
                    <span>{metrics.metrics.local_corrections_applied_total}</span>
                  </div>
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Reactivations required</Tag>
                    <span>{metrics.metrics.local_reactivations_required_total}</span>
                  </div>
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Last status</Tag>
                    <Tag
                      size="sm"
                      type={
                        metrics.metrics.last_local_status === 'healthy' ||
                        metrics.metrics.last_local_status === 'self_healed'
                          ? 'green'
                          : metrics.metrics.last_local_status === 'error'
                          ? 'red'
                          : 'warm-gray'
                      }
                    >
                      {metrics.metrics.last_local_status}
                    </Tag>
                  </div>
                  {metrics.metrics.last_local_error ? (
                    <div className="state-authority-page__metric-row">
                      <Tag type="red">Last error</Tag>
                      <span className="state-authority-page__metric-error">
                        {metrics.metrics.last_local_error}
                      </span>
                    </div>
                  ) : null}
                  <div className="state-authority-page__metric-row">
                    <Tag type="outline">Cluster runs</Tag>
                    <span>{metrics.metrics.cluster_runs_total}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Layer>
  )
}

export default StateAuthorityPage
