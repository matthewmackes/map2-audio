/**
 * Regression guard for T2493 + T2494.
 *
 * MAP2 declares 1366×768 the minimum supported viewport
 * (`MIN_VIEWPORT_WIDTH = 1366`, see `viewportConstants.ts`). Any
 * `@media (max-width: <Npx-or-rem>)` query whose threshold is below
 * 1366 px is dead code — the layout never reaches that viewport in a
 * supported window. T2494 swept all 171 such queries out of `web/src`
 * on 2026-05-04.
 *
 * This test walks every CSS / module.css / TSX file under `web/src`
 * and fails CI if any new sub-1366 max-width media query is
 * reintroduced. It explicitly preserves:
 *   - `@container` queries (CSS Container Queries — element-scoped,
 *     not viewport-scoped; legitimate even inside a 1920px viewport).
 *   - Compound queries that include a `min-width: >=1366` clause.
 *   - Any query without `max-width:` at all (orientation, prefers-*,
 *     pointer, hover, print, forced-colors, etc.).
 */

import { promises as fs } from 'fs'
import * as path from 'path'

import { MIN_VIEWPORT_WIDTH } from './viewportConstants'

const PX_PER_REM = 16

// Resolve the web/src root from this file's location so the test runs
// the same whether jest is invoked from web/ or from the repo root.
const WEB_SRC_ROOT = path.resolve(__dirname, '..', '..')

const FILE_EXTS: ReadonlyArray<string> = [
  '.css',
  '.module.css',
  '.tsx',
  '.ts',
]

const SKIP_DIRS: ReadonlyArray<string> = ['node_modules', '__snapshots__']

interface Violation {
  file: string
  line: number
  prelude: string
  thresholdPx: number
}

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (SKIP_DIRS.includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, acc)
    } else if (entry.isFile()) {
      if (FILE_EXTS.some((ext) => entry.name.endsWith(ext))) {
        acc.push(full)
      }
    }
  }
  return acc
}

function thresholdToPx(threshold: string): number | null {
  const m = threshold.trim().match(/^([\d.]+)(px|rem|em)$/i)
  if (!m) return null
  const value = parseFloat(m[1])
  const unit = m[2].toLowerCase()
  return unit === 'px' ? value : value * PX_PER_REM
}

function findViolations(file: string, source: string): Violation[] {
  const violations: Violation[] = []
  // Match `@media` (NOT `@container`) followed by a parenthesised query
  // up to the opening `{`. We capture the prelude (everything between
  // `@media` and `{`) for inspection.
  const re = /@media\b([^{]*)\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const prelude = match[1]
    // Skip queries with no max-width at all.
    const maxWidths = [...prelude.matchAll(/max-width:\s*([\d.]+(?:px|rem|em))/gi)]
    if (maxWidths.length === 0) continue
    // If any min-width clause is >= the contract floor, the query can
    // still legitimately fire above 1366; skip.
    const minWidths = [...prelude.matchAll(/min-width:\s*([\d.]+(?:px|rem|em))/gi)]
    const hasMinAtOrAbove = minWidths.some((mw) => {
      const px = thresholdToPx(mw[1])
      return px !== null && px >= MIN_VIEWPORT_WIDTH
    })
    if (hasMinAtOrAbove) continue
    // Flag if every max-width threshold is below the contract.
    const allBelow =
      maxWidths.length > 0 &&
      maxWidths.every((mw) => {
        const px = thresholdToPx(mw[1])
        return px !== null && px < MIN_VIEWPORT_WIDTH
      })
    if (!allBelow) continue
    // Compute the line number of the @media keyword for diagnostics.
    const before = source.slice(0, match.index)
    const line = before.split('\n').length
    // The minimum threshold is the most informative for the message.
    const thresholdPx = Math.min(
      ...maxWidths
        .map((mw) => thresholdToPx(mw[1]))
        .filter((v): v is number => v !== null),
    )
    violations.push({
      file: path.relative(WEB_SRC_ROOT, file),
      line,
      prelude: prelude.trim(),
      thresholdPx,
    })
  }
  return violations
}

describe('T2493/T2494 viewport media-query contract', () => {
  it('no `@media (max-width: <1366px>)` queries exist anywhere under web/src', async () => {
    const files = await walk(WEB_SRC_ROOT)
    const allViolations: Violation[] = []
    for (const file of files) {
      const source = await fs.readFile(file, 'utf8')
      if (!source.includes('@media')) continue
      allViolations.push(...findViolations(file, source))
    }
    if (allViolations.length > 0) {
      const lines = allViolations
        .map(
          (v) =>
            `  ${v.file}:${v.line} — @media ${v.prelude} (min threshold ${v.thresholdPx}px < ${MIN_VIEWPORT_WIDTH}px)`,
        )
        .join('\n')
      throw new Error(
        `T2494 contract violation: ${allViolations.length} dead @media (max-width: <${MIN_VIEWPORT_WIDTH}px) ` +
          `queries detected. The layout never reaches these widths under the T2493 contract; remove the block. ` +
          `If the rule is intentionally testing a sub-minimum case (print stylesheet, accessibility), use a non-` +
          `viewport media feature (e.g. @media print) or annotate with a clear comment + worklist link.\n${lines}`,
      )
    }
  })
})
