import { useEffect, useMemo, useState } from 'react'
import { Button, Column, Grid, Tag, TextInput } from '@carbon/react'
import { Book, Document, Download, RecentlyViewed, Search } from '@carbon/icons-react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'

import './PlatformInfoGuideSection.css'

interface DocumentRecord {
  name: string
  title: string
  summary?: string | null
  category?: string | null
  headings?: string[]
  keywords?: string[]
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

function buildDocumentHref(name: string): string {
  return `/api/system/docs/${encodeURIComponent(name)}`
}

function startDocumentDownload(name: string) {
  if (typeof document === 'undefined') {
    return
  }

  const link = document.createElement('a')
  link.href = buildDocumentHref(name)
  link.download = ''
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function DocumentLibrary() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [recentDocs, setRecentDocs] = useState<RecentDocumentRecord[]>(() => safeReadRecentDocs())

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

    void loadDocs()
  }, [])

  useEffect(() => {
    const query = searchParams.get('q') ?? ''
    setSearchTerm((current) => (current === query ? current : query))
  }, [searchParams])

  const persistSearchQuery = (query: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (query) {
      nextParams.set('q', query)
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
  }

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

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    persistSearchQuery(value)
  }

  const handleDownload = (doc: DocumentRecord) => {
    setRecentDocs((current) => rememberDocumentOpen(doc.name, current))
    startDocumentDownload(doc.name)
  }

  return (
    <section className="platform-guide-library">
      <div className="platform-guide-library__header">
        <div className="platform-guide-library__title-row">
          <Book size={24} />
          <div>
            <h2>Documentation library</h2>
            <p>Browse grouped references and download original source documents directly from one scrollable library.</p>
          </div>
        </div>

        <div className="platform-guide-library__controls">
          <TextInput
            id="platform-guide-library-search"
            aria-label="Filter documentation"
            labelText=""
            placeholder="Search title, summary, headings…"
            value={searchTerm}
            onChange={(event) => handleSearchChange(event.currentTarget.value)}
          />
          <div className="platform-guide-library__sort-group" aria-label="Sort documents">
            <Button kind={sortAsc ? 'primary' : 'tertiary'} size="sm" onClick={() => setSortAsc(true)}>
              A to Z
            </Button>
            <Button kind={!sortAsc ? 'primary' : 'tertiary'} size="sm" onClick={() => setSortAsc(false)}>
              Z to A
            </Button>
          </div>
        </div>

        {!loading && !error && (
          <div className="platform-guide-library__summary">
            <Tag type="cool-gray">{filteredDocs.length} visible</Tag>
            <Tag type="blue">{documents.length} total</Tag>
            <Tag type="gray">Direct download</Tag>
          </div>
        )}

        {!loading && !error && (recommendedDocs.length > 0 || recentDocCards.length > 0) ? (
          <Grid condensed fullWidth className="platform-guide-library__highlights">
            {recommendedDocs.length > 0 ? (
              <Column sm={4} md={4} lg={8}>
                <div className="platform-guide-library__highlight-card">
                  <div className="platform-guide-library__highlight-heading">
                    <Book size={16} />
                    <strong>Recommended</strong>
                  </div>
                  <div className="platform-guide-library__chip-list">
                    {recommendedDocs.map((doc) => (
                      <button
                        key={`recommended-${doc.name}`}
                        type="button"
                        className="platform-guide-library__chip"
                        onClick={() => handleDownload(doc)}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                </div>
              </Column>
            ) : null}

            {recentDocCards.length > 0 ? (
              <Column sm={4} md={4} lg={8}>
                <div className="platform-guide-library__highlight-card">
                  <div className="platform-guide-library__highlight-heading">
                    <RecentlyViewed size={16} />
                    <strong>Recent</strong>
                  </div>
                  <div className="platform-guide-library__chip-list">
                    {recentDocCards.map((doc) => (
                      <button
                        key={`recent-${doc.name}`}
                        type="button"
                        className="platform-guide-library__chip platform-guide-library__chip--muted"
                        onClick={() => handleDownload(doc)}
                      >
                        {doc.title}
                      </button>
                    ))}
                  </div>
                </div>
              </Column>
            ) : null}
          </Grid>
        ) : null}
      </div>

      <div className="platform-guide-library__body">
        {loading ? (
          <LoadingState className="platform-guide-library__state" description="Loading platform documents" />
        ) : error ? (
          <div className="platform-guide-library__state platform-guide-library__state--error">{error}</div>
        ) : groupedDocs.length === 0 ? (
          <EmptyState
            className="platform-guide-library__state"
            compact
            icon={<Search size={18} />}
            title="No documents match the current filter"
            description="Try adjusting the search terms or clear the filter to browse the full library."
          />
        ) : (
          groupedDocs.map(([category, docs]) => (
            <section key={category} className="platform-guide-library__group" aria-label={category}>
              <div className="platform-guide-library__group-header">
                <h3>{category}</h3>
                <Tag type="cool-gray">{docs.length}</Tag>
              </div>

              <Grid condensed fullWidth className="platform-guide-library__grid">
                {docs.map((doc) => (
                  <Column key={doc.name} sm={4} md={4} lg={8}>
                    <article className="platform-guide-library__card">
                      <div className="platform-guide-library__card-top">
                        <div className="platform-guide-library__card-title-row">
                          <Document size={18} />
                          <h4>{doc.title}</h4>
                        </div>
                        <Tag type="gray">{normalizeCategory(doc.category)}</Tag>
                      </div>

                      <p className="platform-guide-library__card-summary">
                        {doc.summary || humanizeDocumentName(doc.name)}
                      </p>

                      {doc.keywords && doc.keywords.length > 0 ? (
                        <div className="platform-guide-library__keyword-row" aria-label={`${doc.title} keywords`}>
                          {doc.keywords.slice(0, 4).map((keyword) => (
                            <Tag key={`${doc.name}-${keyword}`} type="warm-gray" size="sm">
                              {keyword}
                            </Tag>
                          ))}
                        </div>
                      ) : null}

                      <div className="platform-guide-library__card-footer">
                        <span className="platform-guide-library__filename">{doc.name}</span>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Download}
                          onClick={() => handleDownload(doc)}
                        >
                          Download
                        </Button>
                      </div>
                    </article>
                  </Column>
                ))}
              </Grid>
            </section>
          ))
        )}
      </div>
    </section>
  )
}

interface PlatformInfoGuideSectionProps {
  themeCard?: React.ReactNode
}

export function PlatformInfoGuideSection({ themeCard }: PlatformInfoGuideSectionProps) {
  return (
    <div id="guide" className="platform-guide-library-shell">
      {themeCard ?? null}
      <DocumentLibrary />
    </div>
  )
}
