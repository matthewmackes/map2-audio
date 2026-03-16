import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { Book, Close, Document, Search } from '@carbon/icons-react'

interface DocumentRecord {
  name: string
}

interface SelectedDocument {
  name: string
  content: string
}

function normalizeDocumentList(payload: unknown): DocumentRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const normalized: DocumentRecord[] = []
  const seen = new Set<string>()

  for (const entry of payload) {
    const name =
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string'
          ? (entry as { name: string }).name
          : ''

    if (!name || seen.has(name)) {
      continue
    }

    seen.add(name)
    normalized.push({ name })
  }

  return normalized
}

function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SelectedDocument | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    const loadDocs = async () => {
      try {
        const response = await fetch('/api/system/docs/list')
        if (!response.ok) {
          setError(`Failed to load documents (${response.status})`)
          setDocuments([])
          return
        }
        const docs = await response.json()
        setDocuments(normalizeDocumentList(docs))
      } catch {
        setError('Network error — document list unavailable')
        setDocuments([])
      } finally {
        setLoading(false)
      }
    }

    loadDocs()
  }, [])

  const loadDocument = async (docName: string) => {
    try {
      const response = await fetch(`/api/system/docs/${encodeURIComponent(docName)}`)
      if (response.ok) {
        const content = await response.text()
        setSelectedDoc({ name: docName, content })
      }
    } catch {
      // silent — user can retry by clicking again
    }
  }

  const filteredDocs = useMemo(
    () =>
      documents
        .filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))),
    [documents, searchTerm, sortAsc],
  )

  const renderedHtml = useMemo((): string => {
    if (!selectedDoc) return ''
    return String(marked(selectedDoc.content))
  }, [selectedDoc])

  return (
    <div
      style={{
        background: 'var(--cds-layer)',
        border: '1px solid var(--cds-border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--cds-layer-accent)',
          padding: '16px 24px',
          borderBottom: '1px solid var(--cds-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Book size={24} style={{ color: 'var(--cds-link-primary)', flexShrink: 0 }} />
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              margin: '0 0 2px',
              color: 'var(--cds-text-primary)',
            }}
          >
            Documentation library
          </h2>
          <p style={{ fontSize: 12, color: 'var(--cds-text-secondary)', margin: 0 }}>
            Browse and read workflow notes, architecture docs, and operational references without leaving the shell.
          </p>
        </div>
      </div>

      {/* Body — split pane */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedDoc ? '280px 1fr' : '280px 1fr',
          minHeight: 480,
          maxHeight: 'calc(100vh - 320px)',
        }}
      >
        {/* Left — file list */}
        <div
          style={{
            borderRight: '1px solid var(--cds-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--cds-layer)',
          }}
        >
          {/* Search + sort toolbar */}
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid var(--cds-border-subtle)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--cds-field)',
                border: '1px solid var(--cds-border-strong)',
                padding: '6px 10px',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Search size={14} style={{ color: 'var(--cds-text-placeholder)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter documents…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: 'var(--cds-text-primary)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setSortAsc(true)}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: sortAsc ? 'var(--cds-button-primary)' : 'var(--cds-layer-accent)',
                  border: '1px solid var(--cds-border-subtle)',
                  color: sortAsc ? 'var(--cds-text-on-color)' : 'var(--cds-text-secondary)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: sortAsc ? 600 : 400,
                }}
              >
                A → Z
              </button>
              <button
                onClick={() => setSortAsc(false)}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: !sortAsc ? 'var(--cds-button-primary)' : 'var(--cds-layer-accent)',
                  border: '1px solid var(--cds-border-subtle)',
                  color: !sortAsc ? 'var(--cds-text-on-color)' : 'var(--cds-text-secondary)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: !sortAsc ? 600 : 400,
                }}
              >
                Z → A
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--cds-text-placeholder)',
                  fontSize: 12,
                }}
              >
                Loading…
              </div>
            ) : error ? (
              <div
                style={{
                  padding: 16,
                  color: 'var(--cds-support-error)',
                  fontSize: 12,
                  borderTop: '1px solid var(--cds-support-error)',
                  background: 'var(--cds-notification-error-background)',
                }}
              >
                {error}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--cds-text-placeholder)',
                  fontSize: 12,
                }}
              >
                No documents match
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isActive = selectedDoc?.name === doc.name
                return (
                  <button
                    key={doc.name}
                    onClick={() => loadDocument(doc.name)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: isActive ? 'var(--cds-layer-selected)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--cds-border-subtle)',
                      borderLeft: isActive ? '2px solid var(--cds-border-interactive)' : '2px solid transparent',
                      color: isActive ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Document size={14} style={{ flexShrink: 0, color: 'var(--cds-link-primary)' }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {doc.name.replace(/\.md$/i, '').replace(/_/g, ' ')}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer count */}
          {!loading && !error && (
            <div
              style={{
                padding: '6px 12px',
                borderTop: '1px solid var(--cds-border-subtle)',
                fontSize: 11,
                color: 'var(--cds-text-placeholder)',
                flexShrink: 0,
              }}
            >
              {filteredDocs.length} of {documents.length} documents
            </div>
          )}
        </div>

        {/* Right — viewer */}
        {selectedDoc ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--cds-layer-02)',
              overflow: 'hidden',
            }}
          >
            {/* Viewer header */}
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--cds-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                background: 'var(--cds-layer-accent)',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--cds-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedDoc.name.replace(/\.md$/i, '').replace(/_/g, ' ')}
              </span>
              <button
                onClick={() => setSelectedDoc(null)}
                title="Close document"
                style={{
                  padding: 6,
                  background: 'transparent',
                  border: '1px solid var(--cds-border-subtle)',
                  color: 'var(--cds-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginLeft: 12,
                }}
              >
                <Close size={16} />
              </button>
            </div>

            {/* iframe content */}
            <iframe
              key={selectedDoc.name}
              srcDoc={`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
    line-height: 1.7;
    color: #f4f4f4;
    background: #161616;
    padding: 32px 40px;
    margin: 0;
    max-width: 860px;
  }
  h1 { font-size: 28px; color: #fff; border-bottom: 1px solid #393939; padding-bottom: 12px; margin-top: 0; }
  h2 { font-size: 20px; color: #f4f4f4; border-left: 3px solid #0f62fe; padding-left: 12px; margin-top: 2em; }
  h3 { font-size: 16px; color: #e0e0e0; margin-top: 1.6em; }
  h4 { font-size: 14px; color: #c6c6c6; margin-top: 1.4em; }
  h5, h6 { font-size: 13px; color: #a8a8a8; }
  p { margin: 0 0 1em; }
  a { color: #78a9ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { margin: 0.8em 0; padding-left: 1.8em; }
  li { margin-bottom: 0.3em; }
  blockquote {
    border-left: 3px solid #525252;
    margin: 1em 0;
    padding: 10px 16px;
    background: #262626;
    color: #c6c6c6;
    font-style: italic;
  }
  code {
    font-family: 'IBM Plex Mono', 'Consolas', monospace;
    font-size: 13px;
    background: #262626;
    color: #3ddbd9;
    padding: 1px 5px;
    border-radius: 2px;
  }
  pre {
    background: #262626;
    border: 1px solid #393939;
    border-left: 3px solid #0f62fe;
    padding: 16px;
    overflow-x: auto;
    border-radius: 2px;
    margin: 1em 0;
  }
  pre code { background: none; padding: 0; color: #3ddbd9; }
  table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 13px; }
  th {
    background: #262626;
    color: #f4f4f4;
    font-weight: 600;
    padding: 10px 14px;
    border: 1px solid #393939;
    text-align: left;
  }
  td { padding: 8px 14px; border: 1px solid #393939; color: #e0e0e0; }
  tr:nth-child(even) td { background: #1e1e1e; }
  hr { border: none; border-top: 1px solid #393939; margin: 2em 0; }
  img { max-width: 100%; height: auto; }
  strong { color: #f4f4f4; }
  em { color: #c6c6c6; }
</style>
</head>
<body>${renderedHtml}</body>
</html>`}
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                minHeight: 0,
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--cds-background)',
              color: 'var(--cds-text-placeholder)',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <Document size={40} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 13 }}>Select a document to read</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface PlatformInfoGuideSectionProps {
  themeCard: React.ReactNode
}

export function PlatformInfoGuideSection({ themeCard }: PlatformInfoGuideSectionProps) {
  return (
    <div id="guide" style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
      {themeCard}
      <DocumentLibrary />
    </div>
  )
}
