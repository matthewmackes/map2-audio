import { Button, InlineNotification, Layer, Tag } from '@carbon/react'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

export function MidiHubEventsPage() {
  return (
    <MidiHubAreaLayout
      routeKey="events"
      title="Event Lists"
      summary="This routed area is reserved for the Net3-style event list engine, MSC builder, learn mode, and timecode workflows."
      tags={[
        { label: 'New feature area', type: 'warm-gray' },
        { label: 'Timecode', type: 'blue' },
      ]}
    >
      <section className="midi-hub-page-band">
        <Layer className="midi-hub-area-page__placeholder">
          <div className="midi-hub-area-page__panel-heading">
            <h3>Event list engine</h3>
            <Tag type="cool-gray">T203-subE</Tag>
          </div>
          <p>
            Route scaffolding, state persistence, and status-bar integration are live. The event engine, MSC command builder,
            and learn mode implementation land in the next dependent bundle.
          </p>
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Area scaffolded"
            subtitle="Deep links, scroll persistence, and shell navigation are active now so the feature slice can land without another routing refactor."
          />
          <div className="midi-hub-area-page__cta-row">
            <Button kind="tertiary" size="sm" disabled>
              New event list
            </Button>
            <Button kind="ghost" size="sm" disabled>
              Open learn mode
            </Button>
          </div>
        </Layer>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubEventsPage
