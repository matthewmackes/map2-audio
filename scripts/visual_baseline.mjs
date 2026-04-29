// Visual regression baseline comparator for the MAP2 visual smoke harnesses.
//
// T2479 (E5): the existing run_home_visual_smoke.mjs and
// run_workspace_visual_smoke.mjs harnesses already capture screenshots
// per-run into a timestamped artifact directory but never compare them
// to anything. This module adds the comparison step.
//
// Comparison strategy: pixelmatch with `includeAA: false` to filter
// anti-aliasing noise (per the locked Q4=E answer in the E5
// clarification round). Threshold defaults to 0.05% of total pixels;
// callers may override.
//
// Baselines live at:
//   web/test-baselines/visual-smoke/<harness>/<scenarioKey>.png
//
// Update workflow:
//   --update-baselines  → write the current screenshot as the baseline,
//                         skip comparison entirely
//   (no flag)           → compare against baseline; throw on mismatch
//
// On comparison mismatch, an annotated diff PNG is written next to the
// run artifact so operators can see what changed.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_DIFF_THRESHOLD_PCT = 0.05
const PIXELMATCH_THRESHOLD = 0.1 // per-pixel sensitivity inside pixelmatch
const PIXELMATCH_INCLUDE_AA = false // filter anti-aliased edges per Q4=E

const pixelmatchModuleUrl = new URL(
  '../web/node_modules/pixelmatch/index.js',
  import.meta.url,
)
const pngjsModuleUrl = new URL(
  '../web/node_modules/pngjs/lib/png.js',
  import.meta.url,
)

let cachedPixelmatch = null
let cachedPNG = null

async function loadPixelmatch() {
  if (!cachedPixelmatch) {
    const mod = await import(pixelmatchModuleUrl.href)
    cachedPixelmatch = mod.default ?? mod
  }
  return cachedPixelmatch
}

async function loadPng() {
  if (!cachedPNG) {
    const mod = await import(pngjsModuleUrl.href)
    cachedPNG = mod.PNG ?? mod.default?.PNG ?? mod
  }
  return cachedPNG
}

function fileExists(p) {
  return readFile(p)
    .then(() => true)
    .catch(() => false)
}

/**
 * Resolve baseline storage location for a given harness.
 *
 * @param {object} params
 * @param {string} params.repoRoot Absolute path to the repo root.
 * @param {string} params.harness One of 'home' / 'workspace'.
 * @returns {string} Absolute baseline directory path.
 */
export function baselineDir({ repoRoot, harness }) {
  return path.join(repoRoot, 'web', 'test-baselines', 'visual-smoke', harness)
}

/**
 * Write the current screenshot as the baseline for `scenarioKey`. Used
 * when callers pass `--update-baselines`. Creates parents as needed.
 *
 * @param {object} params
 * @param {Buffer} params.screenshotBuffer The PNG bytes Playwright produced.
 * @param {string} params.repoRoot Absolute path to the repo root.
 * @param {string} params.harness 'home' / 'workspace'.
 * @param {string} params.scenarioKey Stable, filesystem-safe identifier.
 */
export async function writeBaseline({ screenshotBuffer, repoRoot, harness, scenarioKey }) {
  const dir = baselineDir({ repoRoot, harness })
  await mkdir(dir, { recursive: true })
  const baselinePath = path.join(dir, `${sanitizeScenarioKey(scenarioKey)}.png`)
  await writeFile(baselinePath, screenshotBuffer)
  return baselinePath
}

/**
 * Compare a current screenshot against its checked-in baseline.
 *
 * Returns:
 *   { status: 'pass', diffPct }                  — within threshold.
 *   { status: 'missing-baseline', baselinePath } — first run, no baseline exists.
 *   { status: 'fail', diffPct, threshold, ... }  — drift exceeds threshold.
 *   { status: 'size-mismatch', current, baseline } — geometry changed.
 *
 * On status === 'fail' or 'size-mismatch', a diff PNG is written to
 * `diffOutputPath` (when provided) so operators can inspect the change.
 *
 * @param {object} params
 * @param {Buffer} params.screenshotBuffer The current run's PNG bytes.
 * @param {string} params.repoRoot
 * @param {string} params.harness
 * @param {string} params.scenarioKey
 * @param {number=} params.thresholdPct Pixel-diff failure threshold (% of total). Defaults to 0.05.
 * @param {string=} params.diffOutputPath Where to write the annotated diff on mismatch.
 */
export async function compareToBaseline({
  screenshotBuffer,
  repoRoot,
  harness,
  scenarioKey,
  thresholdPct = DEFAULT_DIFF_THRESHOLD_PCT,
  diffOutputPath,
}) {
  const safeKey = sanitizeScenarioKey(scenarioKey)
  const baselinePath = path.join(baselineDir({ repoRoot, harness }), `${safeKey}.png`)
  const exists = await fileExists(baselinePath)
  if (!exists) {
    return { status: 'missing-baseline', baselinePath }
  }

  const [pixelmatch, PNG] = await Promise.all([loadPixelmatch(), loadPng()])
  const baselineBuffer = await readFile(baselinePath)
  const baseline = PNG.sync.read(baselineBuffer)
  const current = PNG.sync.read(screenshotBuffer)

  if (baseline.width !== current.width || baseline.height !== current.height) {
    if (diffOutputPath) {
      await mkdir(path.dirname(diffOutputPath), { recursive: true })
      await writeFile(diffOutputPath, screenshotBuffer)
    }
    return {
      status: 'size-mismatch',
      baselinePath,
      current: { width: current.width, height: current.height },
      baseline: { width: baseline.width, height: baseline.height },
    }
  }

  const diff = new PNG({ width: current.width, height: current.height })
  const diffPixelCount = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    current.width,
    current.height,
    {
      threshold: PIXELMATCH_THRESHOLD,
      includeAA: PIXELMATCH_INCLUDE_AA,
    },
  )
  const totalPixels = current.width * current.height
  const diffPct = (diffPixelCount / totalPixels) * 100

  if (diffPct > thresholdPct) {
    if (diffOutputPath) {
      await mkdir(path.dirname(diffOutputPath), { recursive: true })
      await writeFile(diffOutputPath, PNG.sync.write(diff))
    }
    return {
      status: 'fail',
      baselinePath,
      diffPixelCount,
      diffPct,
      threshold: thresholdPct,
      diffOutputPath,
    }
  }

  return { status: 'pass', diffPixelCount, diffPct, threshold: thresholdPct }
}

/**
 * Detect whether the host script was invoked with --update-baselines.
 * Centralized so both harnesses parse the flag identically.
 */
export function shouldUpdateBaselines(argv = process.argv) {
  return argv.includes('--update-baselines')
}

/**
 * Sanitize a scenario key for use as a filename. Reuses simple kebab-
 * case conventions; replaces anything outside [a-z0-9._-] with '_'.
 */
export function sanitizeScenarioKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9._-]+/g, '_')
}
