import { useMemo, useState } from 'react'

export interface RequestSnippetModel {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''")
}

export function buildSnippets(model: RequestSnippetModel): Record<string, string> {
  const method = model.method.toUpperCase()
  const headerFlags = Object.entries(model.headers)
    .map(([key, value]) => `-H '${escapeSingleQuotes(`${key}: ${value}`)}'`)
    .join(' ')
  const bodyFlag = model.body ? `--data '${escapeSingleQuotes(model.body)}'` : ''

  const curl = `curl -X ${method} ${headerFlags} ${bodyFlag} '${escapeSingleQuotes(model.url)}'`.replace(/\s+/g, ' ').trim()

  const pythonRequests = `import requests\n\nresponse = requests.request(\n    method='${method}',\n    url='${model.url}',\n    headers=${JSON.stringify(model.headers, null, 4)},\n    data=${JSON.stringify(model.body)},\n)\nprint(response.status_code)\nprint(response.text)`

  const pythonHttpx = `import httpx\n\nwith httpx.Client(timeout=30.0) as client:\n    response = client.request(\n        method='${method}',\n        url='${model.url}',\n        headers=${JSON.stringify(model.headers, null, 8)},\n        content=${JSON.stringify(model.body)},\n    )\nprint(response.status_code)\nprint(response.text)`

  const jsFetch = `const response = await fetch('${model.url}', {\n  method: '${method}',\n  headers: ${JSON.stringify(model.headers, null, 2)},\n  body: ${model.body ? JSON.stringify(model.body) : 'undefined'},\n});\nconst text = await response.text();\nconsole.log(response.status, text);`

  const jsAxios = `import axios from 'axios'\n\nconst response = await axios.request({\n  method: '${method.toLowerCase()}',\n  url: '${model.url}',\n  headers: ${JSON.stringify(model.headers, null, 2)},\n  data: ${model.body ? JSON.stringify(model.body) : 'undefined'},\n})\nconsole.log(response.status, response.data)`

  const tsFetch = `const response = await fetch('${model.url}', {\n  method: '${method}',\n  headers: ${JSON.stringify(model.headers, null, 2)} as HeadersInit,\n  body: ${model.body ? JSON.stringify(model.body) : 'undefined'},\n})\nconst text = await response.text()\nconsole.log(response.status, text)`

  return {
    curl,
    python_requests: pythonRequests,
    python_httpx: pythonHttpx,
    javascript_fetch: jsFetch,
    javascript_axios: jsAxios,
    typescript_fetch: tsFetch,
  }
}

const LABELS: Array<{ key: keyof ReturnType<typeof buildSnippets>; label: string }> = [
  { key: 'curl', label: 'curl' },
  { key: 'python_requests', label: 'Python requests' },
  { key: 'python_httpx', label: 'Python httpx' },
  { key: 'javascript_fetch', label: 'JS fetch' },
  { key: 'javascript_axios', label: 'JS axios' },
  { key: 'typescript_fetch', label: 'TS fetch' },
]

export function CodeSnippetGenerator({ request }: { request: RequestSnippetModel }) {
  const snippets = useMemo(() => buildSnippets(request), [request])
  const [activeKey, setActiveKey] = useState<keyof typeof snippets>('curl')

  return (
    <div style={{ border: '1px solid rgba(71, 85, 105, 0.45)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 10, background: 'rgba(15, 23, 42, 0.88)' }}>
        {LABELS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveKey(item.key)}
            style={{
              borderRadius: 999,
              border: `1px solid ${item.key === activeKey ? 'rgba(139, 92, 246, 0.6)' : 'rgba(71, 85, 105, 0.5)'}`,
              background: item.key === activeKey ? 'rgba(91, 33, 182, 0.25)' : 'rgba(15, 23, 42, 0.88)',
              color: item.key === activeKey ? '#ede9fe' : '#cbd5e1',
              fontSize: 11,
              fontWeight: 700,
              // carbon-allow: dense surface; off-grid between Carbon stops.
              padding: '5px 9px',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(snippets[activeKey])
            }
          }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            borderRadius: 8,
            border: '1px solid rgba(148, 163, 184, 0.45)',
            background: 'rgba(15, 23, 42, 0.92)',
            color: 'var(--cds-text-primary)',
            fontSize: 11,
            fontWeight: 700,
            padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
            cursor: 'pointer',
          }}
        >
          Copy
        </button>
        <pre style={{ margin: 0, padding: 14, overflowX: 'auto', background: 'rgba(2, 6, 23, 0.94)', color: 'var(--cds-text-primary)', fontSize: 12 }}>
          <code>{snippets[activeKey]}</code>
        </pre>
      </div>
    </div>
  )
}

export default CodeSnippetGenerator
