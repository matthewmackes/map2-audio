import { useMemo, useState } from 'react'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `Array(${value.length})`
  if (isObject(value)) return `Object(${Object.keys(value).length})`
  return String(value)
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function flattenSearchText(path: string, key: string, value: unknown): string {
  return `${path} ${key} ${valueType(value)} ${formatValue(value)}`.toLowerCase()
}

function JsonNode({
  value,
  path,
  level,
  search,
  collapsed,
  onToggle,
}: {
  value: unknown
  path: string
  level: number
  search: string
  collapsed: Set<string>
  onToggle: (path: string) => void
}) {
  const isCollapsed = collapsed.has(path)
  const indent = level * 14

  if (!isObject(value) && !Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: indent, display: 'flex', alignItems: 'center', gap: 8 }}>
        <code style={{ color: '#93c5fd' }}>{formatValue(value)}</code>
        <span style={{ color: '#64748b', fontSize: 11 }}>{valueType(value)}</span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value)

  const filteredEntries = search
    ? entries.filter(([key, item]) => flattenSearchText(path, key, item).includes(search))
    : entries

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(path)}
        style={{
          marginLeft: indent,
          border: 'none',
          background: 'transparent',
          color: '#cbd5f5',
          cursor: 'pointer',
          padding: '2px 0',
          fontWeight: 600,
        }}
      >
        {isCollapsed ? '▸' : '▾'} {Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`}
      </button>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredEntries.map(([key, item]) => {
            const childPath = `${path}.${key}`
            const primitive = !isObject(item) && !Array.isArray(item)
            return (
              <div key={childPath}>
                <div style={{ paddingLeft: indent + 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        void navigator.clipboard.writeText(childPath)
                      }
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#a5b4fc',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 12,
                    }}
                    title="Copy JSONPath"
                  >
                    {key}
                  </button>
                  {primitive && (
                    <>
                      <code style={{ color: '#e2e8f0' }}>{formatValue(item)}</code>
                      <span style={{ color: '#64748b', fontSize: 11 }}>{valueType(item)}</span>
                    </>
                  )}
                </div>
                {!primitive && (
                  <JsonNode
                    value={item}
                    path={childPath}
                    level={level + 2}
                    search={search}
                    collapsed={collapsed}
                    onToggle={onToggle}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function JsonTreeViewer({
  value,
  maxHeight = 360,
}: {
  value: unknown
  maxHeight?: number
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [searchRaw, setSearchRaw] = useState('')

  const search = useMemo(() => searchRaw.trim().toLowerCase(), [searchRaw])

  return (
    <div
      style={{
        border: '1px solid rgba(71, 85, 105, 0.5)',
        borderRadius: 12,
        background: 'rgba(2, 6, 23, 0.78)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: 10,
          borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
        }}
      >
        <input
          value={searchRaw}
          onChange={(event) => setSearchRaw(event.target.value)}
          placeholder="Search JSON"
          style={{
            flex: 1,
            borderRadius: 8,
            border: '1px solid rgba(71, 85, 105, 0.65)',
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#e2e8f0',
            padding: '6px 9px',
            fontSize: 12,
          }}
        />
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(71, 85, 105, 0.65)',
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#cbd5e1',
            padding: '6px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Expand All
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set(['$']))}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(71, 85, 105, 0.65)',
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#cbd5e1',
            padding: '6px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Collapse Root
        </button>
      </div>
      <div style={{ maxHeight, overflow: 'auto', padding: 10, fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        <JsonNode
          value={value}
          path="$"
          level={0}
          search={search}
          collapsed={collapsed}
          onToggle={(path) => {
            setCollapsed((prev) => {
              const next = new Set(prev)
              if (next.has(path)) {
                next.delete(path)
              } else {
                next.add(path)
              }
              return next
            })
          }}
        />
      </div>
    </div>
  )
}

export default JsonTreeViewer
