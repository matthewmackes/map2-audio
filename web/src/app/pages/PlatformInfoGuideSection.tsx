import { Link } from 'react-router-dom'
import { useEffect, useState, type ComponentType, type CSSProperties } from 'react'
import {
  Api,
  ArrowRight,
  Book,
  Branch,
  CheckmarkFilled,
  Close,
  Document,
  Globe,
  Keyboard,
  Lightning,
  Music,
  Play,
  Renew,
  Save,
  Search,
  Terminal,
} from '@carbon/icons-react'
import { MapSignalFlowIcon } from '../components/icons/map'

interface DocumentRecord {
  name: string
}

interface SelectedDocument {
  name: string
  content: string
}

function PlatformDiagram() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: 32,
      }}
    >
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 24,
          textAlign: 'center',
          color: 'var(--text-primary)',
        }}
      >
        How MAP2 moves from edit state to live audio
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            padding: 20,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface-3)',
              color: 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 12px',
              border: '1px solid var(--border-strong)',
              letterSpacing: '0.05em',
            }}
          >
            STEP 1
          </div>
          <MapSignalFlowIcon size={40} style={{ color: 'var(--text-primary)', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
            Build a flow
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Arrange processors inside JUCE-GRID without disturbing the current live chain.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                flex: 1,
                height: 2,
                background: 'var(--border-strong)',
              }}
            />
            <ArrowRight size={24} style={{ color: 'var(--text-secondary)', margin: '0 -4px' }} />
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            padding: 20,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface-3)',
              color: 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 12px',
              border: '1px solid var(--border-strong)',
              letterSpacing: '0.05em',
            }}
          >
            STEP 2
          </div>
          <Save size={40} style={{ color: 'var(--text-primary)', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
            Save as a chain
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Turn the draft flow into a recallable chain that can be activated later.
          </p>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          padding: 24,
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-3)',
            color: 'var(--text-secondary)',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 12px',
            border: '1px solid var(--border-strong)',
            letterSpacing: '0.05em',
          }}
        >
          STEP 3
        </div>
        <Lightning size={36} style={{ color: 'var(--text-primary)', margin: '8px auto 12px' }} />
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          Activate when ready
        </h4>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Activation is the moment audio changes. Editing, reordering, and tuning remain offline until then.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
          }}
        >
            {[
              { icon: Music, label: 'MIDI' },
              { icon: Api, label: 'API' },
              { icon: Keyboard, label: 'Keyboard' },
              { icon: Terminal, label: 'TUI' },
              { icon: Globe, label: 'Web' },
          ].map((method) => (
            <div
              key={method.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <method.icon size={14} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{method.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          data-state="active"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
          }}
        >
          <Branch size={12} />
          Flow (editing)
        </div>
        <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
        <div
          data-state="active"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
          }}
        >
          <Save size={12} />
          Chain (saved)
        </div>
        <ArrowRight size={16} style={{ color: 'var(--muted)' }} />
        <div
          data-state="active"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'rgba(15, 98, 254, 0.16)',
            border: '1px solid var(--interactive)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--interactive)',
          }}
        >
          <Play size={12} />
          Active (live audio)
        </div>
      </div>
    </div>
  )
}

type GuideIcon = ComponentType<{ size?: number; style?: CSSProperties; className?: string }>

function ConceptCard({
  icon: Icon,
  title,
  description,
  color,
}: {
  icon: GuideIcon
  title: string
  description: string
  color: string
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: 20,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          padding: 10,
          flexShrink: 0,
        }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color }}>{title}</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  )
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
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name')

  useEffect(() => {
    const loadDocs = async () => {
      try {
        const response = await fetch('/api/system/docs/list')
        if (response.ok) {
          const docs = await response.json()
          setDocuments(normalizeDocumentList(docs))
        }
      } catch (error) {
        console.error('Failed to load documents:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDocs()
  }, [])

  const loadDocument = async (docName: string) => {
    try {
      const response = await fetch(`/api/system/docs/${docName}`)
      if (response.ok) {
        const content = await response.text()
        setSelectedDoc({ name: docName, content })
      }
    } catch (error) {
      console.error('Failed to load document:', error)
    }
  }

  const filteredDocs = documents
    .filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name)
      }

      return b.name.localeCompare(a.name)
    })

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--surface-2)',
          padding: '24px 32px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Book size={28} style={{ color: '#2563eb' }} />
        <div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: '0 0 4px 0',
              color: 'var(--text-primary)',
            }}
          >
            Documentation library
          </h2>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Read workflow notes, architecture docs, and operational references without leaving the shell.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedDoc ? '320px 1fr' : '1fr',
          minHeight: 'calc(100vh - 400px)',
          maxHeight: 'calc(100vh - 200px)',
          gap: 0,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            borderRight: selectedDoc ? '1px solid var(--border)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                padding: '8px 12px',
                gap: 8,
                marginBottom: '8px',
              }}
            >
              <Search size={16} style={{ color: 'rgba(242, 246, 255, 0.5)' }} />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: '#f2f6ff',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setSortBy('name')}
                aria-pressed={sortBy === 'name'}
                data-selected={sortBy === 'name' ? 'true' : 'false'}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: sortBy === 'name' ? 'rgba(15, 98, 254, 0.18)' : 'var(--surface)',
                  border: `1px solid ${sortBy === 'name' ? 'var(--interactive)' : 'var(--border)'}`,
                  color: '#f2f6ff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: sortBy === 'name' ? 600 : 400,
                  transition: 'all 0.2s ease',
                }}
              >
                A-Z
              </button>
              <button
                onClick={() => setSortBy('date')}
                aria-pressed={sortBy === 'date'}
                data-selected={sortBy === 'date' ? 'true' : 'false'}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: sortBy === 'date' ? 'rgba(15, 98, 254, 0.18)' : 'var(--surface)',
                  border: `1px solid ${sortBy === 'date' ? 'var(--interactive)' : 'var(--border)'}`,
                  color: '#f2f6ff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: sortBy === 'date' ? 600 : 400,
                  transition: 'all 0.2s ease',
                }}
              >
                Recent
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '8px 8px',
            }}
          >
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 200,
                  color: 'rgba(242, 246, 255, 0.5)',
                }}
              >
                <Renew
                  size={20}
                  style={{
                    animation: 'rotate 1s linear infinite',
                    transformOrigin: 'center',
                  }}
                />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div
                style={{
                  padding: '20px 12px',
                  color: 'rgba(242, 246, 255, 0.4)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                No documents found
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <button
                  key={doc.name}
                  onClick={() => loadDocument(doc.name)}
                  aria-pressed={selectedDoc?.name === doc.name}
                  data-selected={selectedDoc?.name === doc.name ? 'true' : 'false'}
                  style={{
                    width: '100%',
                    padding: '12px 12px',
                    marginBottom: '4px',
                    background: selectedDoc?.name === doc.name ? 'rgba(15, 98, 254, 0.18)' : 'var(--surface)',
                    border: `1px solid ${selectedDoc?.name === doc.name ? 'var(--interactive)' : 'var(--border)'}`,
                    color: '#f2f6ff',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Document size={14} style={{ flexShrink: 0, color: '#2563eb' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.name.replace(/\.md$/, '').replace(/_/g, ' ')}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {selectedDoc ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--surface-2)',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: '0 0 4px 0',
                    color: '#f2f6ff',
                  }}
                >
                  {selectedDoc.name.replace(/\.md$/, '').replace(/_/g, ' ')}
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: 'rgba(242, 246, 255, 0.5)',
                    margin: 0,
                  }}
                >
                  Markdown document
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{
                  padding: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                <Close size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--surface)',
              }}
            >
              <iframe
                key={selectedDoc.name}
                srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
    line-height: 1.8;
    color: #f4f4f4;
    background: #161616;
    padding: 40px;
    margin: 0;
    max-width: 900px;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #ffffff;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  h1 {
    font-size: 32px;
    border-bottom: 1px solid #525252;
    padding-bottom: 16px;
  }
  h2 {
    font-size: 24px;
    border-left: 2px solid #525252;
    padding-left: 16px;
  }
  h3 {
    font-size: 18px;
    color: #e0e7ff;
  }
  h4 {
    font-size: 16px;
    color: #c7d2fe;
  }
  p {
    margin-bottom: 1em;
    text-align: justify;
  }
  a {
    color: #60a5fa;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  ul, ol {
    margin: 1em 0;
    padding-left: 2em;
  }
  li {
    margin-bottom: 0.5em;
    line-height: 1.8;
  }
  blockquote {
    border-left: 2px solid #525252;
    padding-left: 20px;
    margin-left: 0;
    color: #c6c6c6;
    font-style: italic;
    background: #262626;
    padding-top: 12px;
    padding-bottom: 12px;
    padding-right: 16px;
  }
  code {
    background: #262626;
    padding: 2px 6px;
    font-family: 'IBM Plex Mono', monospace;
    color: #94e2d5;
    font-size: 14px;
  }
  pre {
    background: #262626;
    border: 1px solid #525252;
    padding: 16px;
    overflow-x: auto;
    font-family: 'IBM Plex Mono', monospace;
    color: #94e2d5;
    line-height: 1.5;
  }
  pre code {
    background: none;
    padding: 0;
    color: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
  }
  th, td {
    padding: 12px 16px;
    border: 1px solid #525252;
    text-align: left;
  }
  th {
    background: #262626;
    font-weight: 600;
  }
  hr {
    border: none;
    height: 1px;
    background: #525252;
    margin: 2em 0;
  }
  img {
    max-width: 100%;
    height: auto;
  }
</style>
</head>
<body>
${selectedDoc.content}
</body>
</html>`}
                style={{
                  flex: 1,
                  border: 'none',
                  background: '#050815',
                }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.1)',
              color: 'rgba(242, 246, 255, 0.4)',
              fontSize: 16,
              textAlign: 'center',
            }}
          >
            <div>
              <Document size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
              <p>Select a document to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function PlatformInfoGuideSection() {
  return (
    <div id="guide" style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
      <div style={{ textAlign: 'center', paddingTop: 4 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            marginBottom: 12,
            border: '1px solid rgba(59, 130, 246, 0.25)',
            background: 'rgba(59, 130, 246, 0.08)',
            color: '#93c5fd',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <Book size={14} />
          Platform guide
        </div>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            margin: '0 0 10px',
            color: 'var(--text-primary)',
          }}
        >
          One page for orientation, reference, and next steps
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted)',
            maxWidth: 760,
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          Use this surface as the canonical operator guide: understand how MAP2 moves from editing to activation,
          jump into the supported editor, and review the current documentation set alongside build and support data.
        </p>
      </div>

      <PlatformDiagram />

      <div>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckmarkFilled size={18} style={{ color: 'var(--success)' }} />
          Core operating concepts
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <ConceptCard
            icon={Branch}
            title="Flow"
            description="A flow is the editable draft of your signal path inside JUCE-GRID. It stays offline until you choose to save and activate it."
            color="#2563eb"
          />
          <ConceptCard
            icon={Save}
            title="Chain"
            description="A chain is a saved flow state. Treat it as the stable recall point you can activate during rehearsal, support, or live use."
            color="#60a5fa"
          />
          <ConceptCard
            icon={Lightning}
            title="Activation"
            description="Activation is the controlled cutover to live audio. MAP2 lets you rehearse edits first and change sound only when you intend to."
            color="#2563eb"
          />
          <ConceptCard
            icon={MapSignalFlowIcon}
            title="Parallel routing"
            description="JUCE-GRID supports layered and split paths so wet/dry blends, sidechains, and multi-branch structures can be built without hidden topology."
            color="#60a5fa"
          />
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          padding: 20,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border)',
            padding: 8,
            flexShrink: 0,
          }}
        >
          <Play size={18} style={{ color: 'var(--text-primary)' }} />
        </div>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
            Editing stays non-destructive
          </h4>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            Building a new flow, reordering plugins, or changing routing does not interrupt the active signal path.
            The current live chain keeps running until you explicitly activate a new state.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          paddingTop: 8,
        }}
      >
        <Link
          to="/juce-grid"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--primary)',
            color: '#000',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          <MapSignalFlowIcon size={18} />
          Open JUCE-GRID
        </Link>
        <Link
          to="/overview"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'inherit',
            fontWeight: 500,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          View system overview
        </Link>
      </div>

      <DocumentLibrary />
    </div>
  )
}
