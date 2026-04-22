import { Book, Download, Renew, Save, Upload } from '@carbon/icons-react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Search,
  Tag,
  TextInput,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import {
  intelfxApi,
  type IntelFXLibraryEntry,
  type IntelFXLibraryVersion,
} from '../../../../map2/intelfxApi'
import { useIntelFXPageContext } from './IntelFXShell'
import { EmptyState } from '../../shared/EmptyState'
import { formatIntelFXProgramName, formatIntelFXProgramNumber } from './programNumber'
import './IntelFXLibrarian.css'

const TOTAL_PROGRAMS = 256

function toDisplayDate(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return 'Unknown time'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function normalizeVersions(versions: IntelFXLibraryVersion[] | undefined): IntelFXLibraryVersion[] {
  if (!Array.isArray(versions)) {
    return []
  }
  return versions.map((version, index) => ({
    ...version,
    version: Number.isFinite(Number(version.version)) ? Number(version.version) : index + 1,
  }))
}

export function IntelFXLibrarian() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()
  const [library, setLibrary] = useState<IntelFXLibraryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedPrograms, setSelectedPrograms] = useState<Set<number>>(new Set())
  const [selectedProgram, setSelectedProgram] = useState<number | null>(null)
  const [versionNote, setVersionNote] = useState('')
  const [versions, setVersions] = useState<IntelFXLibraryVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const payload = await intelfxApi.getLibrary(nodeId)
      setLibrary(payload.entries)
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

  const libraryByProgram = useMemo(() => {
    const next = new Map<number, IntelFXLibraryEntry>()
    for (const entry of library) {
      next.set(Number(entry.program), entry)
    }
    return next
  }, [library])

  const programNameLookup = useMemo(() => {
    const next = new Map<number, string>()
    for (const program of intelfx.programs) {
      next.set(program.program, program.name)
    }
    return next
  }, [intelfx.programs])

  const allTags = useMemo(() => {
    const values = new Set<string>()
    for (const entry of library) {
      const tags = Array.isArray(entry.tags) ? entry.tags : []
      for (const rawTag of tags) {
        const tag = String(rawTag).trim()
        if (tag) {
          values.add(tag)
        }
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [library])

  const slots = useMemo(() => {
    const rows: Array<{ program: number; name: string; tags: string[] }> = []
    for (let program = 0; program < TOTAL_PROGRAMS; program += 1) {
      const entry = libraryByProgram.get(program)
      const fallbackName = programNameLookup.get(program) ?? ''
      rows.push({
        program,
        name: String(entry?.name ?? fallbackName),
        tags: Array.isArray(entry?.tags) ? entry?.tags.map((tag) => String(tag)) : [],
      })
    }
    return rows
  }, [libraryByProgram, programNameLookup])

  const filteredSlots = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return slots.filter((slot) => {
      if (selectedTag && !slot.tags.includes(selectedTag)) {
        return false
      }

      if (!query) {
        return true
      }

      const displayNumber = formatIntelFXProgramNumber(slot.program).toLowerCase()
      const displayName = formatIntelFXProgramName(slot.program, slot.name).toLowerCase()
      if (displayNumber.includes(query) || displayName.includes(query)) {
        return true
      }
      return slot.tags.some((tag) => tag.toLowerCase().includes(query))
    })
  }, [searchQuery, selectedTag, slots])

  const currentProgram = intelfx.state?.current_program ?? 0

  const handleLoadProgram = useCallback(async (program: number) => {
    try {
      await intelfx.setProgram(program)
      const name = formatIntelFXProgramName(program, libraryByProgram.get(program)?.name as string | undefined)
      setLcdText(`LOADED ${formatIntelFXProgramNumber(program)} ${name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [intelfx, libraryByProgram, setLcdText])

  const handleToggleSelected = useCallback((program: number) => {
    setSelectedPrograms((previous) => {
      const next = new Set(previous)
      if (next.has(program)) {
        next.delete(program)
      } else {
        next.add(program)
      }
      return next
    })
  }, [])

  const handleExportBundle = useCallback(async () => {
    setIsBusy(true)
    try {
      const programs = Array.from(selectedPrograms).sort((a, b) => a - b)
      const blob = await intelfxApi.exportBundle(programs.length > 0 ? programs : undefined, nodeId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'intelfx-presets.zip'
      link.click()
      URL.revokeObjectURL(url)
      setLcdText(`EXPORTED ${programs.length > 0 ? programs.length : TOTAL_PROGRAMS} PRESETS`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, selectedPrograms, setLcdText])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportSyx = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setIsBusy(true)
    try {
      const result = await intelfxApi.importSyx(file, true, nodeId)
      const imported = Number(result.imported ?? 0)
      setLcdText(`IMPORTED ${imported} PROGRAMS FROM SYX`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      event.target.value = ''
      setIsBusy(false)
    }
  }, [nodeId, refresh, setLcdText])

  const handleLoadVersions = useCallback(async (program: number) => {
    setVersionsLoading(true)
    try {
      const payload = await intelfxApi.listPresetVersions(program, nodeId)
      setVersions(normalizeVersions(payload.versions))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setVersions([])
    } finally {
      setVersionsLoading(false)
    }
  }, [nodeId])

  const handleSaveVersion = useCallback(async () => {
    if (selectedProgram == null) {
      return
    }
    setIsBusy(true)
    try {
      await intelfxApi.savePresetVersion(selectedProgram, versionNote, nodeId)
      setVersionNote('')
      setLcdText(`VERSION SAVED ${formatIntelFXProgramNumber(selectedProgram)}`)
      await handleLoadVersions(selectedProgram)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [selectedProgram, versionNote, nodeId, setLcdText, handleLoadVersions])

  const handleRevertVersion = useCallback(async (program: number, version: number) => {
    setIsBusy(true)
    try {
      await intelfxApi.revertPresetVersion(program, version, nodeId)
      setLcdText(`REVERTED ${formatIntelFXProgramNumber(program)} TO V${version}`)
      await refresh()
      await handleLoadVersions(program)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, refresh, setLcdText, handleLoadVersions])

  const handleAudition = useCallback(async (program: number) => {
    setIsBusy(true)
    try {
      await intelfxApi.auditionProgram(program, nodeId)
      setLcdText(`AUDITION ${formatIntelFXProgramNumber(program)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, setLcdText])

  const handleAuditionConfirm = useCallback(async () => {
    setIsBusy(true)
    try {
      await intelfxApi.auditionConfirm(nodeId)
      setLcdText('AUDITION CONFIRMED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, refresh, setLcdText])

  const handleAuditionRevert = useCallback(async () => {
    setIsBusy(true)
    try {
      await intelfxApi.auditionRevert(nodeId)
      setLcdText('AUDITION REVERTED')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }, [nodeId, refresh, setLcdText])

  return (
    <div className="intelfx-librarian">
      <Layer className="intelfx-librarian__hero">
        <div className="intelfx-librarian__hero-copy">
          <h2 className="intelfx-librarian__title">
            <Book size={20} aria-hidden />
            Preset library
          </h2>
          <p className="intelfx-librarian__subtitle">
            256-slot librarian with search, .syx import/export bundle actions, and version history tools.
          </p>
        </div>
        <div className="intelfx-librarian__hero-actions">
          <Tag type="blue">{filteredSlots.length} shown</Tag>
          <Tag type="gray">{TOTAL_PROGRAMS} total</Tag>
          <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => void refresh()} disabled={isLoading || isBusy}>
            Refresh
          </Button>
          <Button kind="tertiary" size="sm" renderIcon={Upload} onClick={handleImportClick} disabled={isBusy}>
            Import .syx
          </Button>
          <Button kind="secondary" size="sm" renderIcon={Download} onClick={() => void handleExportBundle()} disabled={isBusy}>
            Export bundle
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".syx,application/octet-stream"
            hidden
            onChange={(event) => void handleImportSyx(event)}
          />
        </div>
      </Layer>

      {isLoading ? <InlineLoading status="active" description="Refreshing IntelFX librarian..." /> : null}

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="IntelFX librarian error"
          subtitle={error}
        />
      ) : null}

      <Layer className="intelfx-librarian__filters">
        <Search
          id="intelfx-library-search"
          size="sm"
          labelText="Search presets"
          placeholder="Search by preset name, number, or tag"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <div className="intelfx-librarian__tags">
          <Button
            size="sm"
            kind={selectedTag === null ? 'secondary' : 'ghost'}
            onClick={() => setSelectedTag(null)}
          >
            All tags
          </Button>
          {allTags.map((tag) => (
            <Button
              key={tag}
              size="sm"
              kind={selectedTag === tag ? 'secondary' : 'ghost'}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>

        <div className="intelfx-librarian__bank-tags">
          <Tag type="blue">User U001-U128</Tag>
          <Tag type="warm-gray">Factory F001-F128</Tag>
          <Tag type="cool-gray">Selected {selectedPrograms.size}</Tag>
        </div>
      </Layer>

      <div className="intelfx-librarian__grid">
        {filteredSlots.map((slot) => {
          const isActive = slot.program === currentProgram
          const isSelected = selectedPrograms.has(slot.program)
          const isUser = slot.program < 128
          const displayName = formatIntelFXProgramName(slot.program, slot.name)
          const displayNumber = formatIntelFXProgramNumber(slot.program)

          return (
            <article
              key={slot.program}
              className={`intelfx-librarian__card${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
            >
              <div className="intelfx-librarian__card-head">
                <strong>{displayNumber}</strong>
                {isActive ? <Tag type="green">Active</Tag> : <Tag type={isUser ? 'gray' : 'warm-gray'}>{isUser ? 'User' : 'Factory'}</Tag>}
              </div>
              <p className="intelfx-librarian__card-name">{displayName}</p>

              <div className="intelfx-librarian__card-tags">
                {slot.tags.length > 0 ? slot.tags.slice(0, 3).map((tag) => (
                  <Tag key={`${slot.program}-${tag}`} type="cool-gray">{tag}</Tag>
                )) : <Tag type="cool-gray">No tags</Tag>}
              </div>

              <div className="intelfx-librarian__card-actions">
                <Button
                  size="sm"
                  kind="primary"
                  aria-label={`Load ${displayNumber} ${displayName}`}
                  onClick={() => void handleLoadProgram(slot.program)}
                >
                  Load
                </Button>
                <Button size="sm" kind="ghost" onClick={() => void handleAudition(slot.program)}>
                  Audition
                </Button>
                <Button
                  size="sm"
                  kind={isSelected ? 'secondary' : 'ghost'}
                  onClick={() => handleToggleSelected(slot.program)}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </Button>
                <Button
                  size="sm"
                  kind={selectedProgram === slot.program ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setSelectedProgram(slot.program)
                    setVersions([])
                  }}
                >
                  Versions
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      {filteredSlots.length === 0 && !isLoading ? (
        <EmptyState
          className="intelfx-librarian__empty"
          title="No preset slots match this filter"
          description="Adjust the filter to show more IntelFX preset slots."
          compact
        />
      ) : null}

      {selectedProgram != null ? (
        <Layer className="intelfx-librarian__version-panel">
          <div className="intelfx-librarian__version-header">
            <h3>
              Versions for {formatIntelFXProgramNumber(selectedProgram)}
            </h3>
            <div className="intelfx-librarian__version-actions">
              <Button size="sm" kind="ghost" renderIcon={Renew} onClick={() => void handleLoadVersions(selectedProgram)}>
                Refresh versions
              </Button>
              <Button size="sm" kind="ghost" onClick={() => void handleAuditionRevert()}>
                Audition revert
              </Button>
              <Button size="sm" kind="ghost" onClick={() => void handleAuditionConfirm()}>
                Audition confirm
              </Button>
            </div>
          </div>

          <div className="intelfx-librarian__version-create">
            <TextInput
              id="intelfx-version-note"
              labelText="Version note"
              size="sm"
              value={versionNote}
              placeholder="Optional note"
              onChange={(event) => setVersionNote(event.target.value)}
            />
            <Button size="sm" kind="primary" renderIcon={Save} onClick={() => void handleSaveVersion()} disabled={isBusy}>
              Save version
            </Button>
          </div>

          {versionsLoading ? <InlineLoading status="active" description="Loading version history..." /> : null}

          {versions.length > 0 ? (
            <div className="intelfx-librarian__version-list">
              {versions.map((version) => {
                const versionNumber = Number(version.version)
                return (
                  <div key={`version-${versionNumber}`} className="intelfx-librarian__version-row">
                    <div>
                      <strong>v{versionNumber}</strong>
                      <p>{toDisplayDate(version.created_at)}</p>
                      {version.note ? <p>{version.note}</p> : null}
                    </div>
                    <Button
                      size="sm"
                      kind="tertiary"
                      onClick={() => void handleRevertVersion(selectedProgram, versionNumber)}
                      disabled={isBusy}
                    >
                      Revert
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="intelfx-librarian__version-empty">No saved versions loaded for this program.</p>
          )}
        </Layer>
      ) : null}
    </div>
  )
}

export default IntelFXLibrarian
