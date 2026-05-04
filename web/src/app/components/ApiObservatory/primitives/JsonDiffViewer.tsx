import { useMemo, useState } from 'react'

function flatten(value: unknown, basePath = '$'): Map<string, unknown> {
  const map = new Map<string, unknown>()

  const walk = (item: unknown, path: string) => {
    if (Array.isArray(item)) {
      map.set(path, `Array(${item.length})`)
      item.forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }

    if (item && typeof item === 'object') {
      map.set(path, `Object(${Object.keys(item as Record<string, unknown>).length})`)
      Object.entries(item as Record<string, unknown>).forEach(([key, entry]) => {
        walk(entry, `${path}.${key}`)
      })
      return
    }

    map.set(path, item)
  }

  walk(value, basePath)
  return map
}

function safeStringify(value: unknown) {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  return JSON.stringify(value)
}

export function JsonDiffViewer({
  left,
  right,
}: {
  left: unknown
  right: unknown
}) {
  const [hideUnchanged, setHideUnchanged] = useState(true)

  const rows = useMemo(() => {
    const leftMap = flatten(left)
    const rightMap = flatten(right)
    const paths = new Set([...leftMap.keys(), ...rightMap.keys()])

    return [...paths]
      .sort()
      .map((path) => {
        const leftValue = leftMap.get(path)
        const rightValue = rightMap.get(path)
        const hasLeft = leftMap.has(path)
        const hasRight = rightMap.has(path)
        const equal = hasLeft && hasRight && JSON.stringify(leftValue) === JSON.stringify(rightValue)
        let change: 'added' | 'removed' | 'modified' | 'same' = 'same'
        if (!hasLeft && hasRight) {
          change = 'added'
        } else if (hasLeft && !hasRight) {
          change = 'removed'
        } else if (!equal) {
          change = 'modified'
        }

        return {
          path,
          leftValue,
          rightValue,
          change,
        }
      })
      .filter((row) => (hideUnchanged ? row.change !== 'same' : true))
  }, [hideUnchanged, left, right])

  return (
    <div style={{ borderRadius: 12, border: '1px solid rgba(71, 85, 105, 0.5)', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          // carbon-allow: dense surface; off-grid between Carbon stops.
          padding: '10px 12px',
          borderBottom: '1px solid rgba(71, 85, 105, 0.35)',
          background: 'rgba(15, 23, 42, 0.9)',
        }}
      >
        <strong style={{ color: 'var(--cds-text-primary)', fontSize: 13 }}>JSON Diff</strong>
        <label style={{ color: 'var(--cds-text-secondary)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={hideUnchanged}
            onChange={(event) => setHideUnchanged(event.target.checked)}
          />
          Hide unchanged
        </label>
      </div>

      <div style={{ maxHeight: 280, overflow: 'auto', background: 'rgba(2, 6, 23, 0.9)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, color: 'var(--cds-text-secondary)' }}>Path</th>
              <th style={{ textAlign: 'left', padding: 8, color: 'var(--cds-text-secondary)' }}>Left</th>
              <th style={{ textAlign: 'left', padding: 8, color: 'var(--cds-text-secondary)' }}>Right</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone = row.change === 'added'
                ? 'rgba(22, 163, 74, 0.18)'
                : row.change === 'removed'
                  ? 'rgba(127, 29, 29, 0.25)'
                  : row.change === 'modified'
                    ? 'rgba(217, 119, 6, 0.2)'
                    : 'transparent'
              return (
                <tr key={row.path} style={{ background: tone, borderTop: '1px solid rgba(30, 41, 59, 0.6)' }}>
                  <td style={{ padding: 8, color: 'var(--cds-text-primary)', whiteSpace: 'nowrap' }}>{row.path}</td>
                  <td style={{ padding: 8, color: '#bfdbfe' }}><code>{safeStringify(row.leftValue)}</code></td>
                  <td style={{ padding: 8, color: '#fde68a' }}><code>{safeStringify(row.rightValue)}</code></td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: 'var(--cds-text-secondary)', textAlign: 'center' }}>
                  No differences.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default JsonDiffViewer
