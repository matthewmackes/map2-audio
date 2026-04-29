// SnapshotEditor Perform full-screen overlay (T2473 part 3).
// Animated wrapper that mounts the standalone <PerformPage>
// over the editor when the operator hits the Perform button.
// Pure presentational sub-component — owns no state.

import { motion } from 'framer-motion'
import { PerformPage } from '../PerformPage'

export interface SnapshotEditorPerformOverlayProps {
  open: boolean
  onExit: () => void
}

export function SnapshotEditorPerformOverlay({
  open,
  onExit,
}: SnapshotEditorPerformOverlayProps) {
  if (!open) return null
  return (
    <motion.div
      className="juce-grid-page__perform-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <PerformPage onExit={onExit} />
    </motion.div>
  )
}
