/**
 * T2521-6c — SonoBusGroupsPage.
 *
 * Operator Groups workspace for /sonobus/groups. Read-only projection
 * derived from `/api/sonobus/groups`.
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusGroups,
  type SonoBusGroupSummary,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

function GroupCard({ group }: { group: SonoBusGroupSummary }) {
  return (
    <Tile
      className="sonobus-overview__tile"
      data-testid={`sonobus-group-${group.group_id}`}
    >
      <header className="sonobus-overview__tile-header">
        <h3 className="sonobus-overview__tile-title">{group.group_id}</h3>
        <Tag type="cool-gray" size="sm">
          {`${group.enabled_binding_count} / ${group.binding_count}`}
        </Tag>
      </header>
      <div className="sonobus-overview__kind-rows">
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Session</span>
          <span>{group.session_label ?? '—'}</span>
        </div>
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Channels (sum)</span>
          <Tag type={group.channel_count_total > 0 ? 'green' : 'cool-gray'} size="sm">
            {group.channel_count_total}
          </Tag>
        </div>
      </div>
    </Tile>
  )
}

export function SonoBusGroupsPage() {
  const groups = useSonoBusGroups()
  const list = groups.data ?? []

  return (
    <Section className="sonobus-overview" data-testid="sonobus-groups-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Groups</Heading>
          <p className="sonobus-overview__subtitle">
            Channel-groups (Q14 multichannel from day one) derived from
            the SonoBus binding authority. Per-binding edit lands with
            the binding wizard in a later T2521-6 slice.
          </p>
          {groups.isError && (
            <Tag type="red" size="sm">
              Groups query failed
            </Tag>
          )}
          {groups.isLoading && (
            <Tag type="cool-gray" size="sm">
              Loading…
            </Tag>
          )}
        </header>
      </Layer>
      <Layer level={1}>
        <div className="sonobus-overview__tiles" data-testid="sonobus-groups-grid">
          {list.length === 0 ? (
            <Tile
              className="sonobus-overview__tile"
              data-testid="sonobus-groups-empty"
            >
              <p className="sonobus-overview__tile-body">
                No groups yet. Bindings with a <code>group_id</code> will
                appear here aggregated by group.
              </p>
            </Tile>
          ) : (
            list.map((g) => <GroupCard key={g.group_id} group={g} />)
          )}
        </div>
      </Layer>
    </Section>
  )
}

export default SonoBusGroupsPage
