// SnapshotEditor routing inspector modal (T2473 part 11).
// Pure presentational sub-component. Renders the per-routing
// inspector tile-grid (heading, summary copy, tag chips, and
// the labeled value rows). Owns no state — content + close
// handler come from the parent.

import { Modal, Tag, Tile } from '@carbon/react'
import type { RoutingInspectorContent } from './snapshotEditorPageTypes'

export interface SnapshotEditorRoutingInspectorProps {
  content: RoutingInspectorContent | null
  onClose: () => void
}

export function SnapshotEditorRoutingInspector({
  content,
  onClose,
}: SnapshotEditorRoutingInspectorProps) {
  if (!content) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading={content.heading}
      modalLabel="Routing inspector"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      <div className="juce-grid-page__routing-inspector">
        <p className="juce-grid-page__routing-inspector-copy">{content.summary}</p>
        <div className="juce-grid-page__compact-tags">
          {content.tags.map((tag) => (
            <Tag key={tag} type="cool-gray">
              {tag}
            </Tag>
          ))}
        </div>
        <div
          className="juce-grid-page__routing-inspector-grid"
          role="list"
          aria-label="Routing details"
        >
          {content.rows.map((row) => (
            <Tile
              key={row.label}
              className="juce-grid-page__routing-inspector-row"
              role="listitem"
            >
              <p className="juce-grid-page__routing-inspector-row-label">
                {row.label}
              </p>
              <h3 className="juce-grid-page__routing-inspector-row-value">
                {row.value}
              </h3>
            </Tile>
          ))}
        </div>
      </div>
    </Modal>
  )
}
