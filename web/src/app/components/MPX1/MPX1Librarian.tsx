import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  DocumentExport,
  DocumentImport,
  Flash,
  Renew,
  Save,
  StarFilled,
} from '@carbon/icons-react'

import {
  mpx1Api,
  type MPX1LibraryEntry,
  type MPX1Program,
} from '../../../map2/mpx1Api'
import { useMPX1PageContext } from '../../pages/MPX1Page'
import { formatMpx1ProgramName, formatMpx1ProgramNumber } from './programNumber'
import './MPX1Librarian.css'

const TAG_FILTERS = ['all', 'reverb', 'delay', 'chorus', 'pitch', 'mod'] as const

type TagFilter = (typeof TAG_FILTERS)[number]

type SortField = 'program' | 'name' | 'rating'
type SortDirection = 'asc' | 'desc'

interface LibrarianState {
  entries: MPX1LibraryEntry[]
  undo: MPX1LibraryEntry[][]
}

type LibrarianAction =
  | { type: 'set'; entries: MPX1LibraryEntry[] }
  | { type: 'commit'; entries: MPX1LibraryEntry[] }
  | { type: 'undo' }

function cloneEntries(entries: MPX1LibraryEntry[]): MPX1LibraryEntry[] {
  return entries.map((entry) => ({ ...entry, tags: [...(entry.tags ?? [])] }))
}

function librarianReducer(state: LibrarianState, action: LibrarianAction): LibrarianState {
  switch (action.type) {
    case 'set':
      return {
        entries: cloneEntries(action.entries),
        undo: state.undo,
      }
    case 'commit': {
      const snapshot = cloneEntries(state.entries)
      const nextUndo = [...state.undo, snapshot].slice(-50)
      return {
        entries: cloneEntries(action.entries),
        undo: nextUndo,
      }
    }
    case 'undo': {
      const previous = state.undo[state.undo.length - 1]
      if (!previous) {
        return state
      }
      return {
        entries: cloneEntries(previous),
        undo: state.undo.slice(0, -1),
      }
    }
    default:
      return state
  }
}

function normalizeEntries(programs: MPX1Program[], libraryEntries: MPX1LibraryEntry[]): MPX1LibraryEntry[] {
  const entryMap = new Map<number, MPX1LibraryEntry>()
  libraryEntries.forEach((entry) => {
    entryMap.set(Number(entry.program), entry)
  })

  return programs.map((program) => {
    const existing = entryMap.get(program.program)
    return {
      program: program.program,
      name: existing?.name ?? program.name,
      tags: existing?.tags ?? program.tags ?? [],
      rating: Number(existing?.rating ?? 0),
      type: String(existing?.type ?? (program.tags?.[0] ?? 'general')),
    }
  })
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function clampInt(value: number, min: number, max: number): number {
  const bounded = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
  return Math.round(bounded)
}

export function MPX1Librarian() {
  const { mpx1, nodeId, setLcdText } = useMPX1PageContext()

  const [state, dispatch] = useReducer(librarianReducer, { entries: [], undo: [] })
  const [programs, setPrograms] = useState<MPX1Program[]>([])
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<TagFilter>('all')
  const [sortField, setSortField] = useState<SortField>('program')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedPrograms, setSelectedPrograms] = useState<Set<number>>(new Set())
  const [slotA, setSlotA] = useState<number | null>(null)
  const [slotB, setSlotB] = useState<number | null>(null)
  const [lastCompared, setLastCompared] = useState<'A' | 'B'>('B')
  const [dumpJobId, setDumpJobId] = useState<string | null>(null)
  const [dumpProgress, setDumpProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const refreshLibrary = useCallback(async () => {
    setIsLoading(true)
    try {
      const [programPayload, libraryPayload] = await Promise.all([
        mpx1Api.getPrograms(nodeId),
        mpx1Api.getLibrary(nodeId),
      ])
      setPrograms(programPayload.programs)
      const merged = normalizeEntries(programPayload.programs, libraryPayload.entries)
      dispatch({ type: 'set', entries: merged })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    const event = mpx1.lastEvent
    if (!event) {
      return
    }

    if (event.type === 'mpx1:dump_progress' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      const jobId = String(data.job_id ?? '')
      if (dumpJobId && jobId === dumpJobId) {
        setDumpProgress(Number(data.progress ?? 0))
      }
    }

    if (event.type === 'mpx1:dump_completed' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      const jobId = String(data.job_id ?? '')
      if (dumpJobId && jobId === dumpJobId) {
        setDumpProgress(100)
        setLcdText('DUMP COMPLETE')
      }
    }

    if (event.type === 'mpx1:library_tag' || event.type === 'mpx1:library_replaced') {
      void refreshLibrary()
    }
  }, [dumpJobId, mpx1.lastEvent, refreshLibrary, setLcdText])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: 'undo' })
        setLcdText('UNDO LIBRARY CHANGE')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setLcdText])

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()

    const rows = state.entries.filter((entry) => {
      if (tagFilter !== 'all') {
        const tags = (entry.tags ?? []).map((tag) => String(tag).toLowerCase())
        if (!tags.some((tag) => tag.includes(tagFilter))) {
          return false
        }
      }

      if (!query) {
        return true
      }

      return (
        String(entry.name).toLowerCase().includes(query)
        || String(entry.program).includes(query)
        || formatMpx1ProgramNumber(entry.program).includes(query)
        || (entry.tags ?? []).some((tag) => String(tag).toLowerCase().includes(query))
      )
    })

    rows.sort((a, b) => {
      let comparison = 0
      if (sortField === 'program') comparison = Number(a.program) - Number(b.program)
      if (sortField === 'name') comparison = String(a.name).localeCompare(String(b.name))
      if (sortField === 'rating') comparison = Number(a.rating ?? 0) - Number(b.rating ?? 0)
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return rows
  }, [search, sortDirection, sortField, state.entries, tagFilter])

  const toggleSelection = (program: number) => {
    setSelectedPrograms((prev) => {
      const next = new Set(prev)
      if (next.has(program)) {
        next.delete(program)
      } else {
        next.add(program)
      }
      return next
    })
  }

  const handleSetSlot = (slot: 'A' | 'B', program: number) => {
    if (slot === 'A') {
      setSlotA(program)
    } else {
      setSlotB(program)
    }
  }

  const handleCompareToggle = async () => {
    if (slotA == null || slotB == null) {
      setError('Set both A and B slots before compare.')
      return
    }

    const nextSlot = lastCompared === 'A' ? 'B' : 'A'
    const targetProgram = nextSlot === 'A' ? slotA : slotB
    setLastCompared(nextSlot)
    await mpx1.setProgram(targetProgram)
    setLcdText(`COMPARE ${nextSlot} • PROGRAM ${formatMpx1ProgramNumber(targetProgram)}`)
  }

  const handleStartDump = async () => {
    const response = await mpx1Api.dumpAll(nodeId)
    setDumpJobId(response.job_id)
    setDumpProgress(0)
    setLcdText('DUMP STARTED')
  }

  const handleExportSelected = () => {
    const selectedRows = state.entries.filter((entry) => selectedPrograms.has(Number(entry.program)))
    downloadJson(`mpx1-library-export-${Date.now()}.json`, selectedRows)
    setLcdText(`EXPORTED ${selectedRows.length} PROGRAMS`)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    const parsed = JSON.parse(text)
    const entries = Array.isArray(parsed) ? parsed : parsed.entries
    if (!Array.isArray(entries)) {
      throw new Error('Invalid library JSON format')
    }

    const response = await mpx1Api.importLibrary(entries, nodeId)
    dispatch({ type: 'commit', entries: normalizeEntries(programs, response.entries) })
    await refreshLibrary()
    setLcdText(`IMPORTED ${response.count} PROGRAMS`)
    event.target.value = ''
  }

  const renderStars = (rating: number) => {
    const stars = clampInt(Number(rating), 0, 2)
    return (
      <span className="mpx1-library__stars">
        {Array.from({ length: stars }).map((_, index) => (
          <StarFilled key={index} size={12} />
        ))}
      </span>
    )
  }

  return (
    <div className="mpx1-library">
      <header className="mpx1-library__header">
        <div className="mpx1-library__search-row">
          <input
            type="search"
            placeholder="Search program, name, tag"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
            <option value="program">Sort: Program</option>
            <option value="name">Sort: Name</option>
            <option value="rating">Sort: Rating</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDirection === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>

        <div className="mpx1-library__tag-pills">
          {TAG_FILTERS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={tagFilter === tag ? 'is-active' : ''}
              onClick={() => setTagFilter(tag)}
            >
              {tag.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="mpx1-library__toolbar">
          <button type="button" onClick={() => void refreshLibrary()}>
            <Renew size={14} /> Refresh
          </button>
          <button type="button" onClick={() => void handleStartDump()}>
            <Flash size={14} /> Dump All
          </button>
          <button type="button" onClick={handleExportSelected} disabled={selectedPrograms.size === 0}>
            <DocumentExport size={14} /> Export
          </button>
          <button type="button" onClick={handleImportClick}>
            <DocumentImport size={14} /> Import
          </button>
          <button type="button" onClick={() => dispatch({ type: 'undo' })}>
            <Save size={14} /> Undo
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={(event) => void handleImportFile(event)} />
        </div>
      </header>

      <section className="mpx1-library__ab-strip">
        <button type="button" className={slotA != null ? 'is-set' : ''} onClick={() => slotA != null && void mpx1.setProgram(slotA)}>
          A: {slotA != null ? formatMpx1ProgramNumber(slotA) : '---'}
        </button>
        <button type="button" className={slotB != null ? 'is-set' : ''} onClick={() => slotB != null && void mpx1.setProgram(slotB)}>
          B: {slotB != null ? formatMpx1ProgramNumber(slotB) : '---'}
        </button>
        <button type="button" onClick={() => void handleCompareToggle()} disabled={slotA == null || slotB == null}>
          Compare A↔B
        </button>
        {dumpJobId && (
          <div className="mpx1-library__dump-progress">
            <div className="mpx1-library__dump-track">
              <span style={{ width: `${clampInt(dumpProgress, 0, 100)}%` }} />
            </div>
            <div>{`Dump ${clampInt(dumpProgress, 0, 100)}%`}</div>
          </div>
        )}
      </section>

      {error && <div className="mpx1-library__error">{error}</div>}

      <div className="mpx1-library__table-wrap">
        <table className="mpx1-library__table">
          <thead>
            <tr>
              <th />
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Tags</th>
              <th>Rating</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => {
              const program = Number(entry.program)
              const selected = selectedPrograms.has(program)
              return (
                <tr key={program} className={selected ? 'is-selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelection(program)}
                    />
                  </td>
                  <td>{formatMpx1ProgramNumber(program)}</td>
                  <td>{formatMpx1ProgramName(program, String(entry.name ?? ''))}</td>
                  <td>{String(entry.type ?? 'general')}</td>
                  <td>{(entry.tags ?? []).join(', ')}</td>
                  <td>{renderStars(Number(entry.rating ?? 0))}</td>
                  <td>
                    <div className="mpx1-library__row-actions">
                      <button type="button" onClick={() => void mpx1.setProgram(program)}>Load</button>
                      <button type="button" onClick={() => handleSetSlot('A', program)}>A</button>
                      <button type="button" onClick={() => handleSetSlot('B', program)}>B</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!isLoading && filteredEntries.length === 0 && (
          <div className="mpx1-library__empty">No programs match your filter.</div>
        )}
      </div>
    </div>
  )
}
