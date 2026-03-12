/**
 * IntelFXLibraryView - Preset library view with 256 program slots.
 */

import { Book, Close, Renew } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Layer, Search, Tag } from '@carbon/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  formatIntelFXProgramName,
  formatIntelFXProgramNumber,
} from '../components/IntelFX/programNumber'
import { mpx1Api, type MPX1LibraryEntry } from '../../map2/mpx1Api'
import { useIntelFXPageContext } from './IntelFXPage'
import './IntelFXLibraryView.css'

const TOTAL_PROGRAMS = 256

export function IntelFXLibraryView() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [library, setLibrary] = useState<MPX1LibraryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const currentProgram = intelfx.state?.current_program ?? 0

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await mpx1Api.getLibrary(nodeId)
      setLibrary(data.entries)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const libraryMap = useMemo(() => {
    const map: Record<number, MPX1LibraryEntry> = {}
    for (const entry of library) {
      map[entry.program] = entry
    }
    return map
  }, [library])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const entry of library) {
      for (const tag of entry.tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }, [library])

  const programSlots = useMemo(() => {
    const slots: Array<{ program: number; name: string; tags: string[] }> = []
    for (let program = 0; program < TOTAL_PROGRAMS; program++) {
      const entry = libraryMap[program]
      slots.push({
        program,
        name: entry?.name ?? '',
        tags: entry?.tags ?? [],
      })
    }
    return slots
  }, [libraryMap])

  const filteredSlots = useMemo(() => {
    let slots = programSlots

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      slots = slots.filter((slot) => {
        const displayName = formatIntelFXProgramName(slot.program, slot.name).toLowerCase()
        const number = formatIntelFXProgramNumber(slot.program).toLowerCase()
        return (
          displayName.includes(query) ||
          number.includes(query) ||
          slot.tags.some((tag) => tag.toLowerCase().includes(query))
        )
      })
    }

    if (selectedTag) {
      slots = slots.filter((slot) => slot.tags.includes(selectedTag))
    }

    return slots
  }, [programSlots, searchQuery, selectedTag])

  const handleSelectProgram = useCallback(async (program: number) => {
    try {
      await intelfx.setProgram(program)
      const entry = libraryMap[program]
      const name = formatIntelFXProgramName(program, entry?.name)
      setLcdText(`LOADED ${formatIntelFXProgramNumber(program)} ${name}`)
    } catch (err) {
      console.error('Failed to select IntelFX program:', err)
    }
  }, [intelfx, libraryMap, setLcdText])

  return (
    <div className="intelfx-library-page">
      <Layer className="intelfx-library-page__hero">
        <div className="intelfx-library-page__hero-copy">
          <h2 className="intelfx-library-page__title">
            <Book size={20} aria-hidden />
            Preset library
          </h2>
          <p className="intelfx-library-page__subtitle">Browse and load user or factory presets by number, name, and tag.</p>
        </div>
        <div className="intelfx-library-page__hero-actions">
          <Tag type="blue">{filteredSlots.length} shown</Tag>
          <Tag type="gray">{TOTAL_PROGRAMS} total</Tag>
          <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={() => void refresh()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </Layer>

      {isLoading ? <InlineLoading status="active" description="Refreshing IntelFX library..." /> : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Library error"
          subtitle={error}
        />
      ) : null}

      <section className="intelfx-library-page__filters">
        <Search
          id="intelfx-library-search"
          size="sm"
          labelText="Search presets"
          placeholder="Search by preset name, number, or tag"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <div className="intelfx-library-page__tag-filter">
          {selectedTag ? (
            <Button kind="ghost" size="sm" renderIcon={Close} onClick={() => setSelectedTag(null)}>
              Tag: {selectedTag}
            </Button>
          ) : allTags.length > 0 ? (
            <>
              <span className="intelfx-library-page__tag-label">Filter tags</span>
              {allTags.slice(0, 12).map((tag) => (
                <Button key={tag} kind="ghost" size="sm" onClick={() => setSelectedTag(tag)}>
                  {tag}
                </Button>
              ))}
              {allTags.length > 12 ? <Tag type="gray">+{allTags.length - 12} more</Tag> : null}
            </>
          ) : (
            <Tag type="cool-gray">No tags indexed</Tag>
          )}
        </div>
      </section>

      <div className="intelfx-library-page__bank-tags">
        <Tag type="blue">User 001-128</Tag>
        <Tag type="warm-gray">Factory 001-128</Tag>
      </div>

      <div className="intelfx-library-page__grid">
        {filteredSlots.map((slot) => {
          const isActive = slot.program === currentProgram
          const isUser = slot.program < 128
          const displayName = formatIntelFXProgramName(slot.program, slot.name)
          const displayNumber = formatIntelFXProgramNumber(slot.program)

          return (
            <button
              key={slot.program}
              type="button"
              className={`intelfx-library-page__card${isActive ? ' is-active' : ''}`}
              onClick={() => void handleSelectProgram(slot.program)}
              aria-label={`Load ${displayNumber} ${displayName}`}
            >
              <div className="intelfx-library-page__card-head">
                <span className="intelfx-library-page__program-number">{displayNumber}</span>
                {isActive ? (
                  <Tag type="green">Active</Tag>
                ) : (
                  <Tag type={isUser ? 'gray' : 'warm-gray'}>{isUser ? 'User' : 'Factory'}</Tag>
                )}
              </div>

              <p className="intelfx-library-page__program-name">{displayName}</p>

              {slot.tags.length > 0 ? (
                <div className="intelfx-library-page__program-tags">
                  {slot.tags.slice(0, 3).map((tag) => (
                    <Tag key={`${slot.program}-${tag}`} type="cool-gray">
                      {tag}
                    </Tag>
                  ))}
                  {slot.tags.length > 3 ? <Tag type="cool-gray">+{slot.tags.length - 3}</Tag> : null}
                </div>
              ) : (
                <p className="intelfx-library-page__program-tags-empty">No tags</p>
              )}
            </button>
          )
        })}
      </div>

      {filteredSlots.length === 0 && !isLoading ? (
        <Layer className="intelfx-library-page__empty">No programs match your search.</Layer>
      ) : null}
    </div>
  )
}

export default IntelFXLibraryView
