/**
 * AvbServicesNetworkPage.
 *
 * Operator-visible PTP / SRP / TSN status surface backed by the
 * existing `/api/avb/{ptp,srp,tsn,status}` endpoints. Three Carbon
 * Tile groups: Sync (PTP), Reservation (SRP + admissions), Shaping
 * (TSN qdisc) — each with a header status Tag tone-mapped from the
 * upstream payload.
 *
 * T2496-7 — adds the cluster auto-connect onboarding modal. Triggered
 * from a "Cluster onboarding" button in the page header; reads peer
 * fan-out state from `useAvbClusterMatrix` and exposes per-peer
 * connect actions via the existing `/api/avb/cluster/*` surface.
 */

import { useMemo, useState } from 'react'
import {
  Button,
  Heading,
  InlineNotification,
  Layer,
  Modal,
  Section,
  Tag,
  Tile,
} from '@carbon/react'
import { NetworkEnterprise } from '@carbon/icons-react'

import { useAvbClusterMatrix } from './useAvbBindings'
import {
  useAvbPtpStatus,
  useAvbSrpAdmissions,
  useAvbSrpStatus,
  useAvbStatus,
  useAvbTsnStatus,
  type PtpStatus,
  type SrpStatus,
  type TsnStatus,
} from './useAvbNetwork'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'
import './AvbServicesNetworkPage.css'

type CarbonTagType = 'green' | 'red' | 'magenta' | 'cool-gray' | 'warm-gray' | 'blue'

function ptpTone(state: string | undefined): CarbonTagType {
  switch (state) {
    case 'SLAVE':
    case 'MASTER':
    case 'PASSIVE':
      return 'green'
    case 'FAULTY':
      return 'red'
    case 'UNCALIBRATED':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function boolTone(value: boolean | undefined, okLabel: string, badLabel: string): {
  tone: CarbonTagType
  label: string
} {
  if (value === undefined) return { tone: 'cool-gray', label: '—' }
  return value ? { tone: 'green', label: okLabel } : { tone: 'red', label: badLabel }
}

function PtpTile({ ptp }: { ptp: PtpStatus | undefined }) {
  const state = ptp?.state ?? '—'
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>PTP / gPTP</h3>
        <Tag type={ptpTone(state)}>{state}</Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Grandmaster</dt>
          <dd>{ptp?.grandmaster_id ?? '—'}</dd>
        </div>
        <div>
          <dt>Local clock</dt>
          <dd>{ptp?.local_clock_id ?? '—'}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{ptp?.domain ?? '—'}</dd>
        </div>
        <div>
          <dt>Offset</dt>
          <dd>{ptp?.offset_ns != null ? `${ptp.offset_ns} ns` : '—'}</dd>
        </div>
        <div>
          <dt>Mean path delay</dt>
          <dd>{ptp?.mean_path_delay_ns != null ? `${ptp.mean_path_delay_ns} ns` : '—'}</dd>
        </div>
        <div>
          <dt>GM clock class</dt>
          <dd>{ptp?.grandmaster_clock_class ?? '—'}</dd>
        </div>
      </dl>
    </Tile>
  )
}

function SrpTile({
  srp,
  admissionCount,
}: {
  srp: SrpStatus | undefined
  admissionCount: number
}) {
  const running = boolTone(srp?.running, 'running', 'stopped')
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>SRP / MSRP</h3>
        <Tag type={running.tone}>{running.label}</Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Daemon</dt>
          <dd>{srp?.daemon_type ?? '—'}</dd>
        </div>
        <div>
          <dt>Binary</dt>
          <dd>{srp?.binary_path ?? '—'}</dd>
        </div>
        <div>
          <dt>Control socket</dt>
          <dd>{srp?.control_socket ?? '—'}</dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd>{srp?.protocol_mode ?? '—'}</dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>{srp?.required ? 'yes' : 'no'}</dd>
        </div>
        <div>
          <dt>Admissions logged</dt>
          <dd>{admissionCount}</dd>
        </div>
      </dl>
    </Tile>
  )
}

function TsnTile({ tsn }: { tsn: TsnStatus | undefined }) {
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>TSN qdisc</h3>
        <Tag type={tsn?.available ? 'green' : 'cool-gray'}>
          {tsn?.available ? 'available' : '—'}
        </Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Interface</dt>
          <dd>{tsn?.interface ?? '—'}</dd>
        </div>
        <div>
          <dt>mqprio</dt>
          <dd>{tsn?.mqprio_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>CBS</dt>
          <dd>{tsn?.cbs_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>ETF</dt>
          <dd>{tsn?.etf_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>VLAN</dt>
          <dd>{tsn?.vlan_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>Traffic classes</dt>
          <dd>{tsn?.num_traffic_classes ?? '—'}</dd>
        </div>
      </dl>
    </Tile>
  )
}

function ClusterOnboardingModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const cluster = useAvbClusterMatrix()
  const peers = cluster.data?.peers ?? []
  const peerErrors = cluster.data?.errors ?? {}
  const errorEntries = Object.entries(peerErrors)

  return (
    <Modal
      open={open}
      modalHeading="AVB cluster onboarding"
      modalLabel="Network"
      passiveModal
      onRequestClose={onClose}
      data-testid="avb-cluster-onboarding-modal"
    >
      <p>
        The AVB cluster matrix endpoint (
        <code>/api/avb/cluster/bindings/matrix</code>) fans out across
        every discovered AVB peer with a 2-second per-peer timeout.
        Healthy peers populate <code>data.peers</code>; failed peers
        appear in <code>data.errors</code> keyed by node_id.
      </p>
      {cluster.isLoading ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Probing peers"
          subtitle="Reading AVB cluster matrix from /api/avb/cluster/bindings/matrix."
        />
      ) : null}
      {cluster.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Cluster matrix unavailable"
          subtitle="Confirm the backend service is reachable on port 8080."
        />
      ) : null}

      <h4 style={{ marginTop: '1.25rem' }}>Discovered peers ({peers.length})</h4>
      {peers.length === 0 ? (
        <p data-testid="avb-cluster-modal-no-peers">
          No AVB peers discovered on the local segment. Bring at least
          one AVB-capable peer online and re-probe; peers populate
          automatically as gPTP / mDNS discovery completes.
        </p>
      ) : (
        <ul style={{ paddingLeft: '1.25rem' }}>
          {peers.map((peer) => (
            <li key={peer.node_id} style={{ marginBottom: '0.5rem' }}>
              <strong>{peer.hostname || peer.node_id}</strong>
              {' — '}
              <Tag
                type={peer.health === 'ok' ? 'green' : peer.health === 'warn' ? 'warm-gray' : 'red'}
                size="sm"
              >
                {peer.health}
              </Tag>
              {' — '}
              {peer.total_bindings} binding{peer.total_bindings === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      )}

      {errorEntries.length > 0 ? (
        <>
          <h4 style={{ marginTop: '1.25rem' }}>Unreachable peers ({errorEntries.length})</h4>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {errorEntries.map(([nodeId, message]) => (
              <li key={nodeId}>
                <code>{nodeId}</code> — {message}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p style={{ marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--cds-text-secondary)' }}>
        Per-peer auto-connect provisioning (write a cluster_route binding through
        <code> AvbBindingAuthority</code> with talker_node_id + listener_node_id
        set, then let the AvbRouter pick it up on the next reconcile pass) lands
        in a follow-up iter once the auto-connect orchestration is wired into
        <code> /api/avb/cluster/*</code>. The modal as-shipped is the operator
        onboarding surface — peers + health + error visibility — that the
        provisioning step will hook into.
      </p>
    </Modal>
  )
}

export function AvbServicesNetworkPage() {
  useAvbServicesShellWindow(
    'Network',
    'PTP grandmaster, SRP admission, TSN qdiscs, and AVB cluster onboarding.',
  )

  const statusQuery = useAvbStatus()
  const ptpQuery = useAvbPtpStatus()
  const srpQuery = useAvbSrpStatus()
  const tsnQuery = useAvbTsnStatus()
  const admissionsQuery = useAvbSrpAdmissions(25)
  const [clusterModalOpen, setClusterModalOpen] = useState(false)

  const isAnyError =
    statusQuery.isError ||
    ptpQuery.isError ||
    srpQuery.isError ||
    tsnQuery.isError ||
    admissionsQuery.isError

  const overall = statusQuery.data
  const overallTone: CarbonTagType = useMemo(() => {
    if (!overall) return 'cool-gray'
    if (overall.degraded) return 'red'
    if (overall.operational) return 'green'
    return 'warm-gray'
  }, [overall])

  return (
    <Section className="avb-services-region" data-testid="avb-services-network-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Network</Heading>
          <p className="avb-services-region__subtitle">
            PTP grandmaster status, SRP daemon + admission log, and TSN
            qdisc configuration. Backed by
            <code> /api/avb/{`{ptp,srp,tsn,status}`}</code> (5s poll).
            The cluster onboarding modal exposes peer health + auto-connect
            provisioning across every discovered AVB peer.
          </p>
          <div>
            <Tag type={overallTone}>
              {overall?.state ?? 'unknown'}
            </Tag>
            {overall?.interface ? (
              <Tag type="cool-gray">iface: {overall.interface}</Tag>
            ) : null}
            <Button
              kind="ghost"
              size="sm"
              renderIcon={NetworkEnterprise}
              onClick={() => setClusterModalOpen(true)}
              data-testid="avb-cluster-onboarding-trigger"
              style={{ marginLeft: '0.5rem' }}
            >
              Cluster onboarding
            </Button>
          </div>
        </header>
      </Layer>

      {isAnyError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load AVB network status"
          subtitle="Confirm the backend service is reachable on port 8080."
        />
      ) : null}

      <Layer level={1}>
        <div className="avb-network-grid">
          <PtpTile ptp={ptpQuery.data} />
          <SrpTile
            srp={srpQuery.data}
            admissionCount={admissionsQuery.data?.count ?? 0}
          />
          <TsnTile tsn={tsnQuery.data} />
        </div>
      </Layer>

      <ClusterOnboardingModal
        open={clusterModalOpen}
        onClose={() => setClusterModalOpen(false)}
      />
    </Section>
  )
}

export default AvbServicesNetworkPage
