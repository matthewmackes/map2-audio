/**
 * Minimum viable GUI viewport.
 *
 * The MAP2 Audio operator surface is not designed for mobile or tablet
 * viewports — every workspace assumes at least 1366x768 of usable
 * pixels. Below that, the layout stays at full size (CSS `min-width`
 * on `html, body, #root`) and the browser shows scrollbars; the
 * `WindowTooSmallOverlay` mounted by `AppShell` surfaces a banner so
 * the operator knows their window is below the supported minimum.
 *
 * If you need to change either dimension, update this file AND the
 * matching `min-width`/`min-height` rules in `web/src/index.css`.
 */
export const MIN_VIEWPORT_WIDTH = 1366
export const MIN_VIEWPORT_HEIGHT = 768
