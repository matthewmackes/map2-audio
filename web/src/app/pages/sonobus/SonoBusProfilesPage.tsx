/**
 * T2521-6f — SonoBusProfilesPage.
 *
 * Operator Profiles workspace for /sonobus/profiles. Read-only list
 * of built-in codec + jitter + resend presets sourced from
 * /api/sonobus/profiles. Operator-defined custom profiles land with
 * the daemon (T2521-4); the page contract stays the same.
 */

import {
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusProfiles,
  type SonoBusProfilePreset,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

type Tone = 'green' | 'cool-gray' | 'warm-gray' | 'magenta'

function resendTone(policy: string): Tone {
  switch (policy) {
    case 'burst_loss_only':
      return 'cool-gray'
    case 'full':
      return 'magenta'
    case 'off':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function ProfileCard({ preset }: { preset: SonoBusProfilePreset }) {
  return (
    <Tile
      className="sonobus-overview__tile"
      data-testid={`sonobus-profile-${preset.profile_id}`}
    >
      <header className="sonobus-overview__tile-header">
        <h3 className="sonobus-overview__tile-title">{preset.label}</h3>
        <Tag type="cool-gray" size="sm">
          {preset.profile_id}
        </Tag>
      </header>
      <p className="sonobus-overview__tile-body">{preset.description}</p>
      <div className="sonobus-overview__kind-rows">
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Codec / format</span>
          <Tag type="cool-gray" size="sm">
            {`${preset.codec_profile} · ${preset.stream_format}`}
          </Tag>
        </div>
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Jitter buffer</span>
          <Tag type="cool-gray" size="sm">
            {`${preset.jitter_buffer_ms} ms`}
          </Tag>
        </div>
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Resend policy</span>
          <Tag type={resendTone(preset.resend_policy)} size="sm">
            {preset.resend_policy.replace('_', ' ')}
          </Tag>
        </div>
        <div className="sonobus-overview__row">
          <span className="sonobus-overview__label">Latency target</span>
          <Tag type="cool-gray" size="sm">
            {`${preset.latency_target_ms} ms`}
          </Tag>
        </div>
      </div>
    </Tile>
  )
}

export function SonoBusProfilesPage() {
  const profiles = useSonoBusProfiles()
  const list = profiles.data ?? []

  return (
    <Section className="sonobus-overview" data-testid="sonobus-profiles-page">
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Profiles</Heading>
          <p className="sonobus-overview__subtitle">
            Built-in codec + jitter + resend presets sourced from the
            T2521 locked decisions (Q7/Q8/Q9). Operator-defined custom
            profiles land with the T2521-4 daemon.
          </p>
          {profiles.isError && (
            <Tag type="red" size="sm">
              Profiles query failed
            </Tag>
          )}
        </header>
      </Layer>

      <Layer level={1}>
        <div className="sonobus-overview__tiles" data-testid="sonobus-profiles-grid">
          {list.length === 0 ? (
            <Tile
              className="sonobus-overview__tile"
              data-testid="sonobus-profiles-empty"
            >
              <p className="sonobus-overview__tile-body">
                No profiles available — the backend has not seeded the
                built-in presets.
              </p>
            </Tile>
          ) : (
            list.map((p) => <ProfileCard key={p.profile_id} preset={p} />)
          )}
        </div>
      </Layer>
    </Section>
  )
}

export default SonoBusProfilesPage
