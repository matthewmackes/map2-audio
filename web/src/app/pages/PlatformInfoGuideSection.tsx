import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { Button, Tag } from '@carbon/react'
import { Book, Document, Launch, RecentlyViewed, Search } from '@carbon/icons-react'
import { useLocation, useSearchParams } from 'react-router-dom'

interface DocumentRecord {
  name: string
  title: string
  summary?: string | null
  category?: string | null
  headings?: string[]
  keywords?: string[]
}

interface SelectedDocument extends DocumentRecord {
  content: string
}

interface RecentDocumentRecord {
  name: string
  openedAt: number
  count: number
}

const RECENT_DOCS_STORAGE_KEY = 'map2_doc_library_recent_v1'
const MAX_RECENT_DOCS = 6

function normalizeDocumentList(payload: unknown): DocumentRecord[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const normalized: DocumentRecord[] = []
  const seen = new Set<string>()

  for (const entry of payload) {
    if (typeof entry !== 'string' && (typeof entry !== 'object' || entry === null)) {
      continue
    }

    const record = typeof entry === 'string'
      ? { name: entry, title: entry.replace(/\.md$/i, '').replace(/[_/]+/g, ' ') }
      : {
          name: typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name : '',
          title: typeof (entry as { title?: unknown }).title === 'string'
            ? (entry as { title: string }).title
            : '',
          summary: typeof (entry as { summary?: unknown }).summary === 'string'
            ? (entry as { summary: string }).summary
            : null,
          category: typeof (entry as { category?: unknown }).category === 'string'
            ? (entry as { category: string }).category
            : null,
          headings: Array.isArray((entry as { headings?: unknown[] }).headings)
            ? (entry as { headings: unknown[] }).headings.filter((value): value is string => typeof value === 'string')
            : [],
          keywords: Array.isArray((entry as { keywords?: unknown[] }).keywords)
            ? (entry as { keywords: unknown[] }).keywords.filter((value): value is string => typeof value === 'string')
            : [],
        }

    if (!record.name || seen.has(record.name)) {
      continue
    }

    seen.add(record.name)
    normalized.push({
      name: record.name,
      title: record.title || humanizeDocumentName(record.name),
      summary: record.summary ?? null,
      category: record.category ?? 'General',
      headings: record.headings ?? [],
      keywords: record.keywords ?? [],
    })
  }

  return normalized
}

function humanizeDocumentName(name: string): string {
  const tail = name.split('/').pop() ?? name
  return tail.replace(/\.md$/i, '').replace(/[_-]+/g, ' ')
}

function normalizeCategory(category: string | null | undefined): string {
  return category?.trim() || 'General'
}

function buildSearchIndex(doc: DocumentRecord): string {
  return [
    doc.name,
    doc.title,
    doc.summary ?? '',
    normalizeCategory(doc.category),
    ...(doc.headings ?? []),
    ...(doc.keywords ?? []),
  ].join(' ').toLowerCase()
}

function safeReadRecentDocs(): RecentDocumentRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(RECENT_DOCS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is RecentDocumentRecord => (
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as { name?: unknown }).name === 'string'
      && typeof (entry as { openedAt?: unknown }).openedAt === 'number'
      && typeof (entry as { count?: unknown }).count === 'number'
    ))
  } catch {
    return []
  }
}

function writeRecentDocs(records: RecentDocumentRecord[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(RECENT_DOCS_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECENT_DOCS)))
}

function rememberDocumentOpen(name: string, current: RecentDocumentRecord[]): RecentDocumentRecord[] {
  const next = [...current]
  const existingIndex = next.findIndex((entry) => entry.name === name)
  const now = Date.now()

  if (existingIndex >= 0) {
    const existing = next.splice(existingIndex, 1)[0]
    next.unshift({ name, openedAt: now, count: existing.count + 1 })
  } else {
    next.unshift({ name, openedAt: now, count: 1 })
  }

  writeRecentDocs(next)
  return next.slice(0, MAX_RECENT_DOCS)
}

function suggestionScore(doc: DocumentRecord, context: string): number {
  const index = buildSearchIndex(doc)
  const normalizedContext = context.toLowerCase()
  if (!normalizedContext) {
    return 0
  }

  const contextTerms = normalizedContext.split(/[^a-z0-9]+/).filter(Boolean)
  return contextTerms.reduce((score, term) => score + (index.includes(term) ? 2 : 0), 0)
}

function docsForNames(names: string[], documents: DocumentRecord[]): DocumentRecord[] {
  const byName = new Map(documents.map((doc) => [doc.name, doc]))
  return names.map((name) => byName.get(name)).filter((doc): doc is DocumentRecord => Boolean(doc))
}

function DocumentLibrary() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SelectedDocument | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '')
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [recentDocs, setRecentDocs] = useState<RecentDocumentRecord[]>(() => safeReadRecentDocs())

  const selectedDocName = searchParams.get('doc')
  const contextParam = searchParams.get('context') ?? ''
  const routeContext = useMemo(() => `${location.pathname} ${contextParam}`.trim(), [contextParam, location.pathname])

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
        setError(null)
      } catch {
        setError('Network error — document list unavailable')
        setDocuments([])
      } finally {
        setLoading(false)
      }
    }

    loadDocs()
  }, [])

  useEffect(() => {
    const query = searchParams.get('q') ?? ''
    setSearchTerm((current) => (current === query ? current : query))
  }, [searchParams])

  const persistSearchParams = (updates: { doc?: string | null; q?: string | null; context?: string | null }) => {
    const nextParams = new URLSearchParams(searchParams)

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value)
      } else {
        nextParams.delete(key)
      }
    })

    setSearchParams(nextParams, { replace: true })
  }

  const loadDocument = async (doc: DocumentRecord) => {
    try {
      setDocLoading(true)
      const response = await fetch(`/api/system/docs/${encodeURIComponent(doc.name)}`)
      if (!response.ok) {
        setError(`Failed to load ${doc.title} (${response.status})`)
        return
      }

      const content = await response.text()
      setSelectedDoc({ ...doc, content })
      setError(null)
      persistSearchParams({ doc: doc.name })
      setRecentDocs((current) => rememberDocumentOpen(doc.name, current))
    } catch {
      setError(`Network error — unable to open ${doc.title}`)
    } finally {
      setDocLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedDocName || documents.length === 0) {
      return
    }

    if (selectedDoc?.name === selectedDocName) {
      return
    }

    const match = documents.find((doc) => doc.name === selectedDocName)
    if (match) {
      void loadDocument(match)
    }
  }, [documents, selectedDoc?.name, selectedDocName])

  const filteredDocs = useMemo(() => {
    const lowered = searchTerm.trim().toLowerCase()
    return documents
      .filter((doc) => (lowered ? buildSearchIndex(doc).includes(lowered) : true))
      .sort((a, b) => {
        const categoryCompare = normalizeCategory(a.category).localeCompare(normalizeCategory(b.category))
        if (categoryCompare !== 0) {
          return categoryCompare
        }
        return sortAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
      })
  }, [documents, searchTerm, sortAsc])

  const groupedDocs = useMemo(() => {
    const groups = new Map<string, DocumentRecord[]>()
    filteredDocs.forEach((doc) => {
      const category = normalizeCategory(doc.category)
      const current = groups.get(category) ?? []
      current.push(doc)
      groups.set(category, current)
    })
    return Array.from(groups.entries())
  }, [filteredDocs])

  const recentDocCards = useMemo(
    () => docsForNames(recentDocs.map((entry) => entry.name), documents),
    [documents, recentDocs],
  )

  const recommendedDocs = useMemo(() => {
    const scored = documents
      .map((doc) => ({ doc, score: suggestionScore(doc, routeContext) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
      .map((entry) => entry.doc)

    if (scored.length > 0) {
      return scored.slice(0, 6)
    }

    return documents
      .filter((doc) => ['General', 'Setup And Deployment', 'Performance'].includes(normalizeCategory(doc.category)))
      .slice(0, 6)
  }, [documents, routeContext])

  const renderedHtml = useMemo((): string => {
    if (!selectedDoc) return ''
    return String(marked(selectedDoc.content))
  }, [selectedDoc])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    persistSearchParams({ q: value || null })
  }

  const clearSelectedDocument = () => {
    setSelectedDoc(null)
    persistSearchParams({ doc: null })
  }

  return (
    <div
      style={{
        background: 'var(--cds-layer)',
        border: '1px solid var(--cds-border-subtle)',
        overflow: 'hidden',
      }}
    >
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
            Browse grouped references, jump in from `JUCE-GRID`, and reopen recent support docs without leaving the shell.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          minHeight: 560,
          maxHeight: 'calc(100vh - 320px)',
        }}
      >
        <div
          style={{
            borderRight: '1px solid var(--cds-border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--cds-layer)',
          }}
        >
          <div
            style={{
              padding: '12px',
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
                marginBottom: 8,
              }}
            >
              <Search size={14} style={{ color: 'var(--cds-text-placeholder)', flexShrink: 0 }} />
              <input
                aria-label="Filter documentation"
                type="text"
                placeholder="Search title, summary, headings…"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
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

          {!loading && !error && (
            <div
              style={{
                padding: '12px',
                borderBottom: '1px solid var(--cds-border-subtle)',
                display: 'grid',
                gap: 12,
              }}
            >
              {recommendedDocs.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Book size={14} />
                    <strong style={{ fontSize: 12 }}>Recommended</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {recommendedDocs.map((doc) => (
                      <button
                        key={`recommended-${doc.name}`}
                        onClick={() => void loadDocument(doc)}
                        style={{
                          border: '1px solid var(--cds-border-subtle)',
                          background: 'var(--cds-layer-accent)',
                          padding: '4px 8px',
                          color: 'var(--cds-text-primary)',
                          cursor: 'pointer',
                          fontSize: 11,
                          textAlign: 'left',
                        }}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentDocCards.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <RecentlyViewed size={14} />
                    <strong style={{ fontSize: 12 }}>Recent</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {recentDocCards.map((doc) => (
                      <button
                        key={`recent-${doc.name}`}
                        onClick={() => void loadDocument(doc)}
                        style={{
                          border: '1px solid var(--cds-border-subtle)',
                          background: 'transparent',
                          padding: '4px 8px',
                          color: 'var(--cds-text-secondary)',
                          cursor: 'pointer',
                          fontSize: 11,
                          textAlign: 'left',
                        }}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--cds-text-placeholder)', fontSize: 12 }}>
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
            ) : groupedDocs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--cds-text-placeholder)', fontSize: 12 }}>
                No documents match
              </div>
            ) : (
              groupedDocs.map(([category, docs]) => (
                <section key={category} aria-label={category}>
                  <div
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      background: 'var(--cds-layer-accent)',
                      borderBottom: '1px solid var(--cds-border-subtle)',
                      padding: '8px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--cds-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.32,
                    }}
                  >
                    {category}
                  </div>
                  {docs.map((doc) => {
                    const isActive = selectedDoc?.name === doc.name
                    return (
                      <button
                        key={doc.name}
                        onClick={() => void loadDocument(doc)}
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
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Document size={14} style={{ flexShrink: 0, color: 'var(--cds-link-primary)' }} />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              fontWeight: 600,
                            }}
                          >
                            {doc.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--cds-text-helper)' }}>
                          {doc.summary || humanizeDocumentName(doc.name)}
                        </span>
                      </button>
                    )
                  })}
                </section>
              ))
            )}
          </div>

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

        {selectedDoc ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--cds-layer-02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid var(--cds-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexShrink: 0,
                background: 'var(--cds-layer-accent)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--cds-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedDoc.title}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <Tag type="cool-gray">{normalizeCategory(selectedDoc.category)}</Tag>
                  <Tag type="gray">{selectedDoc.name}</Tag>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Launch}
                  onClick={() => {
                    const href = `/platform?panel=about&doc=${encodeURIComponent(selectedDoc.name)}`
                    window.open(href, '_blank', 'noopener,noreferrer')
                  }}
                >
                  Deep link
                </Button>
                <Button kind="ghost" size="sm" onClick={clearSelectedDocument}>
                  Close
                </Button>
              </div>
            </div>

            {docLoading ? (
              <div style={{ padding: 24, fontSize: 12, color: 'var(--cds-text-placeholder)' }}>Loading document…</div>
            ) : (
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
    font-family: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
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
    font-family: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
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
                title={selectedDoc.title}
                style={{
                  flex: 1,
                  border: 'none',
                  width: '100%',
                  minHeight: 0,
                }}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              alignContent: 'start',
              padding: 24,
              background: 'var(--cds-background)',
              color: 'var(--cds-text-primary)',
            }}
          >
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Document size={32} style={{ opacity: 0.45 }} />
              <div>
                <strong>Select a document to read</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--cds-text-secondary)', fontSize: 13 }}>
                  Start with recommended guides, reopen a recent doc, or use search to jump straight into a topic.
                </p>
              </div>
            </div>

            {recommendedDocs.slice(0, 3).map((doc) => (
              <button
                key={`empty-recommended-${doc.name}`}
                onClick={() => void loadDocument(doc)}
                style={{
                  border: '1px solid var(--cds-border-subtle)',
                  background: 'var(--cds-layer)',
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{doc.title}</strong>
                  <Tag type="blue">{normalizeCategory(doc.category)}</Tag>
                </div>
                <p style={{ margin: '8px 0 0', color: 'var(--cds-text-secondary)', fontSize: 12 }}>
                  {doc.summary || humanizeDocumentName(doc.name)}
                </p>
              </button>
            ))}

            {recentDocCards.slice(0, 2).map((doc) => (
              <button
                key={`empty-recent-${doc.name}`}
                onClick={() => void loadDocument(doc)}
                style={{
                  border: '1px solid var(--cds-border-subtle)',
                  background: 'var(--cds-layer-accent)',
                  padding: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RecentlyViewed size={16} />
                  <strong>{doc.title}</strong>
                </div>
                <p style={{ margin: '8px 0 0', color: 'var(--cds-text-secondary)', fontSize: 12 }}>
                  Reopen this recent reference.
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface PlatformInfoGuideSectionProps {
  themeCard?: React.ReactNode
}

export function PlatformInfoGuideSection({ themeCard }: PlatformInfoGuideSectionProps) {
  return (
    <div id="guide" style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
      {themeCard ?? null}
      <DocumentLibrary />
    </div>
  )
}
