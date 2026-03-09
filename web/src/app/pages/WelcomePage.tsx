import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  GridFour,
  Play,
  FloppyDisk,
  Lightning,
  ArrowRight,
  Broadcast,
  Keyboard,
  Terminal,
  Globe,
  Cpu,
  GitBranch,
  CheckCircle,
  BookOpen,
  FileText,
  MagnifyingGlass,
  X,
  ArrowSquareOut,
  SpinnerGap
} from '@phosphor-icons/react'

// SVG Diagram showing the Flow -> Chain -> Activation concept
function PlatformDiagram() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
      borderRadius: 'var(--border-radius-lg)',
      padding: 32,
      border: '1px solid var(--border)',
    }}>
      {/* Title */}
      <h3 style={{
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 24,
        textAlign: 'center',
        color: 'var(--primary)'
      }}>
        How Mackes Audio Platform Works
      </h3>

      {/* Three-stage visual flow */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 32,
      }}>
        {/* Stage 1: Build */}
        <div style={{
          background: 'rgba(37, 99, 235, 0.1)',
          border: '2px solid rgba(37, 99, 235, 0.3)',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2563eb',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 12,
            letterSpacing: '0.05em',
          }}>
            STEP 1
          </div>
          <GridFour size={40} weight="duotone" style={{ color: '#2563eb', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#2563eb' }}>
            Build a Flow
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            Combine effects in the <strong>Grid Editor</strong> to create your signal chain
          </p>
        </div>

        {/* Arrow 1 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              flex: 1,
              height: 2,
              background: 'linear-gradient(90deg, rgba(37, 99, 235, 0.5) 0%, rgba(96, 165, 250, 0.5) 100%)',
            }} />
            <ArrowRight size={24} weight="bold" style={{ color: '#60a5fa', margin: '0 -4px' }} />
          </div>
        </div>

        {/* Stage 2: Save */}
        <div style={{
          background: 'rgba(96, 165, 250, 0.1)',
          border: '2px solid rgba(96, 165, 250, 0.3)',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#60a5fa',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 12,
            letterSpacing: '0.05em',
          }}>
          STEP 2
        </div>
        <FloppyDisk size={40} weight="duotone" style={{ color: '#60a5fa', margin: '12px auto 12px' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#60a5fa' }}>
            Save as Chain
          </h4>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
            A saved Flow becomes a <strong>Chain</strong> ready to be activated
          </p>
        </div>
      </div>

      {/* Stage 3: Activate - Full width */}
      <div style={{
        background: 'rgba(37, 99, 235, 0.1)',
        border: '2px solid rgba(37, 99, 235, 0.3)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: -12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--primary)',
          color: '#000',
          fontSize: 10,
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: 12,
          letterSpacing: '0.05em',
        }}>
          STEP 3
        </div>
        <Lightning size={36} weight="duotone" style={{ color: 'var(--primary)', margin: '8px auto 12px' }} />
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--primary)' }}>
          Activate to Go Live
        </h4>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Chains are NOT live until activated. Activate via any of these methods:
        </p>

        {/* Activation methods */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
        }}>
          {[
            { icon: Broadcast, label: 'MIDI', color: '#60a5fa' },
            { icon: Cpu, label: 'API', color: '#60a5fa' },
            { icon: Keyboard, label: 'Keyboard', color: '#60a5fa' },
            { icon: Terminal, label: 'TUI', color: '#60a5fa' },
            { icon: Globe, label: 'Web Interface', color: '#2563eb' },
          ].map(method => (
            <div
              key={method.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 20,
                border: `1px solid ${method.color}40`,
              }}
            >
              <method.icon size={14} style={{ color: method.color }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: method.color }}>{method.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Visual Flow representation */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(37, 99, 235, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: '#2563eb',
        }}>
          <GitBranch size={12} weight="duotone" />
          Flow (Editing)
        </div>
        <ArrowRight size={16} weight="bold" style={{ color: 'var(--muted)' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(96, 165, 250, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: '#60a5fa',
        }}>
          <FloppyDisk size={12} weight="duotone" />
          Chain (Saved)
        </div>
        <ArrowRight size={16} weight="bold" style={{ color: 'var(--muted)' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'rgba(37, 99, 235, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--primary)',
        }}>
          <Play size={12} weight="duotone" />
          Active (Live Audio)
        </div>
      </div>
    </div>
  )
}

// Key concept card
function ConceptCard({
  icon: Icon,
  title,
  description,
  color
}: {
  icon: typeof GridFour
  title: string
  description: string
  color: string
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--border-radius-md)',
      padding: 20,
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <div style={{
        background: `${color}20`,
        borderRadius: 8,
        padding: 10,
        flexShrink: 0,
      }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color }}>{title}</h4>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  )
}

export function WelcomePage() {
  return (
    <div className="stack welcome-page" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Lightning size={32} weight="duotone" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #60a5fa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }} />
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            background: 'linear-gradient(135deg, var(--primary) 0%, #00ff88 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Welcome to Mackes Audio Platform
          </h1>
        </div>
        <p style={{
          fontSize: 14,
          color: 'var(--muted)',
          maxWidth: 600,
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          A professional audio processing platform featuring Neural Amp Modeling,
          LV2 plugins, convolution reverb, and real-time signal routing.
        </p>
      </div>

      {/* Main Diagram */}
      <PlatformDiagram />

      {/* Key Concepts */}
      <div>
        <h3 style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle size={18} weight="duotone" style={{ color: 'var(--success)' }} />
          Key Concepts
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <ConceptCard
            icon={GitBranch}
            title="Flow"
            description="A Flow is an arrangement of effects in the Grid Editor. You can freely edit, rearrange, and experiment without affecting live audio."
            color="#2563eb"
          />
          <ConceptCard
            icon={FloppyDisk}
            title="Chain"
            description="A Chain is a saved Flow. Think of it as a preset that captures your entire signal routing. Chains wait in standby until activated."
            color="#60a5fa"
          />
          <ConceptCard
            icon={Lightning}
            title="Activation"
            description="Activating a Chain makes it live and processes actual audio. You can switch between Chains instantly via MIDI, keyboard, or the web interface."
            color="#2563eb"
          />
          <ConceptCard
            icon={GridFour}
            title="Parallel Routing"
            description="The Grid Editor supports parallel signal paths, allowing you to layer effects, create wet/dry blends, and build complex routing configurations."
            color="#60a5fa"
          />
        </div>
      </div>

      {/* Important Note */}
      <div style={{
        background: 'rgba(37, 99, 235, 0.1)',
        border: '1px solid rgba(37, 99, 235, 0.3)',
        borderRadius: 'var(--border-radius-md)',
        padding: 20,
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}>
        <div style={{
          background: 'rgba(37, 99, 235, 0.2)',
          borderRadius: '50%',
          padding: 8,
          flexShrink: 0,
        }}>
          <Play size={18} weight="duotone" style={{ color: '#2563eb' }} />
        </div>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#2563eb' }}>
            Editing is Non-Destructive
          </h4>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
            The process of editing a Flow, laying out multiple flows in parallel, or configuring other routing options
            does <strong>NOT</strong> make them live. Your live audio continues uninterrupted while you build and
            experiment with new configurations. Only when you explicitly <strong>activate</strong> a Chain does it
            become the live signal path.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="welcome-quick-links" style={{
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
        paddingTop: 8,
      }}>
        <Link
          to="/grid"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--primary)',
            color: '#000',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <GridFour size={18} weight="duotone" />
          Open Grid Editor
        </Link>
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'inherit',
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 14,
            textDecoration: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          View System Overview
        </Link>
      </div>

      {/* Document Library */}
      <DocumentLibrary />
    </div>
  )
}
// Document Library Component
function DocumentLibrary() {
  const [documents, setDocuments] = useState<Array<{ name: string; content?: string }>>([])
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; content: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name')

  useEffect(() => {
    // Fetch list of markdown files from docs folder
    const loadDocs = async () => {
      try {
        // Get the list of docs from the API
        const response = await fetch('/api/system/docs/list')
        if (response.ok) {
          const docs = await response.json()
          setDocuments(docs)
        }
      } catch (e) {
        console.error('Failed to load documents:', e)
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
    } catch (e) {
      console.error('Failed to load document:', e)
    }
  }

  const filteredDocs = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name)
    } else {
      // Sort by date (filename often has dates, otherwise by name)
      return b.name.localeCompare(a.name) // Reverse for most recent first
    }
  })

  return (
    <div className="welcome-doc-library" style={{
      background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.5) 0%, rgba(20, 25, 40, 0.3) 100%)',
      borderRadius: 'var(--border-radius-lg)',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
        padding: '24px 32px',
        borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <BookOpen size={28} weight="duotone" style={{ color: '#2563eb' }} />
        <div>
          <h2 style={{
            fontSize: 24,
            fontWeight: 700,
            margin: '0 0 4px 0',
            color: '#f2f6ff'
          }}>
            📚 Documentation Library
          </h2>
          <p style={{
            fontSize: 13,
            color: 'rgba(242, 246, 255, 0.6)',
            margin: 0
          }}>
            Explore comprehensive guides, API docs, and project documentation
          </p>
        </div>
      </div>

      <div className="welcome-doc-library-layout" style={{
        display: 'grid',
        gridTemplateColumns: selectedDoc ? '320px 1fr' : '1fr',
        minHeight: 'calc(100vh - 400px)',
        maxHeight: 'calc(100vh - 200px)',
        gap: 0
      }}>
        {/* Sidebar - Document List */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderRight: selectedDoc ? '1px solid rgba(59, 130, 246, 0.2)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search & Sort Bar */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
            flexShrink: 0
          }}>
            {/* Search */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              padding: '8px 12px',
              gap: 8,
              marginBottom: '8px'
            }}>
              <MagnifyingGlass size={16} weight="duotone" style={{ color: 'rgba(242, 246, 255, 0.5)' }} />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
            {/* Sort Options */}
            <div style={{
              display: 'flex',
              gap: 4
            }}>
              <button
                onClick={() => setSortBy('name')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: sortBy === 'name' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid ' + (sortBy === 'name' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.2)'),
                  borderRadius: 6,
                  color: '#f2f6ff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: sortBy === 'name' ? 600 : 400,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (sortBy !== 'name') {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (sortBy !== 'name') {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
                  }
                }}
              >
                A-Z
              </button>
              <button
                onClick={() => setSortBy('date')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  background: sortBy === 'date' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid ' + (sortBy === 'date' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.2)'),
                  borderRadius: 6,
                  color: '#f2f6ff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: sortBy === 'date' ? 600 : 400,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (sortBy !== 'date') {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (sortBy !== 'date') {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
                  }
                }}
              >
                Recent
              </button>
            </div>
          </div>

          {/* Document List */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px 8px'
          }}>
            {loading ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 200,
                color: 'rgba(242, 246, 255, 0.5)'
              }}>
                <SpinnerGap size={20} weight="duotone" style={{ 
                  animation: 'rotate 1s linear infinite',
                  transformOrigin: 'center'
                }} />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div style={{
                padding: '20px 12px',
                color: 'rgba(242, 246, 255, 0.4)',
                fontSize: 13,
                textAlign: 'center'
              }}>
                No documents found
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <button
                  key={doc.name}
                  onClick={() => loadDocument(doc.name)}
                  style={{
                    width: '100%',
                    padding: '12px 12px',
                    marginBottom: '4px',
                    background: selectedDoc?.name === doc.name 
                      ? 'rgba(59, 130, 246, 0.3)' 
                      : 'rgba(59, 130, 246, 0.05)',
                    border: selectedDoc?.name === doc.name 
                      ? '1px solid rgba(59, 130, 246, 0.5)' 
                      : '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: 6,
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
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedDoc?.name === doc.name 
                      ? 'rgba(59, 130, 246, 0.3)' 
                      : 'rgba(59, 130, 246, 0.05)'
                    e.currentTarget.style.borderColor = selectedDoc?.name === doc.name 
                      ? 'rgba(59, 130, 246, 0.5)' 
                      : 'rgba(59, 130, 246, 0.2)'
                  }}
                >
                  <FileText size={14} weight="duotone" style={{ flexShrink: 0, color: '#2563eb' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.name.replace(/\.md$/, '').replace(/_/g, ' ')}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Content - Document Reader */}
        {selectedDoc && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(0, 0, 0, 0.1)'
          }}>
            {/* Document Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: '#f2f6ff'
                }}>
                  {selectedDoc.name.replace(/\.md$/, '').replace(/_/g, ' ')}
                </h3>
                <p style={{
                  fontSize: 12,
                  color: 'rgba(242, 246, 255, 0.5)',
                  margin: 0
                }}>
                  Markdown Document
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{
                  padding: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                }}
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Document Content - Browser Native Viewer */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(5, 8, 15, 0.3)'
            }}>
              <iframe
                key={selectedDoc.name}
                srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    line-height: 1.8;
    color: #f2f6ff;
    background: #050815;
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
    border-bottom: 2px solid rgba(59, 130, 246, 0.4);
    padding-bottom: 16px;
  }
  h2 {
    font-size: 24px;
    border-left: 4px solid rgba(59, 130, 246, 0.6);
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
    border-left: 4px solid rgba(99, 102, 241, 0.6);
    padding-left: 20px;
    margin-left: 0;
    color: rgba(242, 246, 255, 0.75);
    font-style: italic;
    background: rgba(99, 102, 241, 0.05);
    padding-top: 12px;
    padding-bottom: 12px;
    padding-right: 16px;
  }
  code {
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    color: #94e2d5;
    font-size: 14px;
  }
  pre {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
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
    border: 1px solid rgba(59, 130, 246, 0.2);
    text-align: left;
  }
  th {
    background: rgba(59, 130, 246, 0.1);
    font-weight: 600;
  }
  hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.3), transparent);
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
                  background: '#050815'
                }}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!selectedDoc && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.1)',
            color: 'rgba(242, 246, 255, 0.4)',
            fontSize: 16,
            textAlign: 'center'
          }}>
            <div>
              <FileText size={48} weight="duotone" style={{ marginBottom: 16, opacity: 0.3 }} />
              <p>Select a document to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
