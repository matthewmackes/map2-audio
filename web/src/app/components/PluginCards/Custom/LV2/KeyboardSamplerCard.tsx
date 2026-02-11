/**
 * KeyboardSamplerCard - Sfizz SFZ/SF2 Sampler
 *
 * Professional sampler interface with integrated soundfont browser,
 * keyboard display, and sample library management.
 *
 * LV2 URI: http://sfztools.github.io/sfizz
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import {
  MusicNote,
  MagnifyingGlass,
  Folder,
  FolderOpen,
  PianoKeys,
  X,
  DownloadSimple,
  Star,
  Funnel,
  CaretDown,
  CaretRight,
  FileAudio,
  HardDrive,
} from '@phosphor-icons/react'
import type { PluginCardProps } from '../../types'
import api from '../../../../../map2/api'
import './KeyboardSamplerCard.css'

// Parameter indices for sfizz
const PARAM_MAP = {
  volume: 0,
  pan: 1,
  tuning: 2,
  polyphony: 3,
  // Note: sfizz file loading is typically via separate API
}

// Sound categories
const SOUNDFONT_CATEGORIES = [
  'Piano',
  'Keyboards',
  'Organ',
  'Strings',
  'Brass',
  'Woodwinds',
  'Guitar',
  'Bass',
  'Drums',
  'Percussion',
  'Synth',
  'Ethnic',
  'Choir',
  'Sound FX',
]

interface SoundFont {
  id: string
  name: string
  filename: string
  path: string
  format: 'sf2' | 'sfz' | 'sf3'
  category: string
  library: string
  size: number
  isFavorite?: boolean
}

interface SoundFontLibrary {
  name: string
  soundfonts: SoundFont[]
  isExpanded?: boolean
}

export function KeyboardSamplerCard({
  plugin,
  parameterValues,
  onParameterChange,
  realtimeData,
  accentColor = '#3b82f6', // Blue for instruments
  compact = false,
}: PluginCardProps) {
  const queryClient = useQueryClient()
  const [showBrowser, setShowBrowser] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedLibraries, setExpandedLibraries] = useState<Set<string>>(new Set(['User']))
  const [currentSoundfont, setCurrentSoundfont] = useState<SoundFont | null>(null)

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  // Fetch soundfonts from API
  const { data: soundfontsData, isLoading } = useQuery({
    queryKey: ['soundfonts', selectedCategory],
    queryFn: async () => {
      try {
        const response = await api.soundfont.listSoundfonts({
          category: selectedCategory || undefined,
          limit: 100,
        })
        return response
      } catch (error) {
        console.warn('Failed to load soundfonts:', error)
        // Return empty list — no mock data
        return {
          soundfonts: [] as SoundFont[],
          total: 0,
        }
      }
    },
    enabled: showBrowser,
  })

  // Load soundfont mutation
  const loadSoundfont = useMutation({
    mutationFn: async (soundfont: SoundFont) => {
      // In a real implementation, this would call the backend to load the soundfont
      // For now, just set the current soundfont
      setCurrentSoundfont(soundfont)
      return soundfont
    },
    onSuccess: () => {
      setShowBrowser(false)
    },
  })

  // Filter soundfonts
  const filteredSoundfonts = useMemo((): SoundFont[] => {
    const soundfonts = soundfontsData?.soundfonts as SoundFont[] | undefined
    if (!soundfonts) return []

    return soundfonts.filter((sf) => {
      const matchesSearch = !searchQuery ||
        sf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sf.filename.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = !selectedCategory || sf.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [soundfontsData, searchQuery, selectedCategory])

  // Group by library
  const groupedByLibrary = useMemo(() => {
    const groups: Record<string, SoundFont[]> = {}
    filteredSoundfonts.forEach((sf) => {
      if (!groups[sf.library]) groups[sf.library] = []
      groups[sf.library].push(sf)
    })
    return groups
  }, [filteredSoundfonts])

  // Toggle library expansion
  const toggleLibrary = (library: string) => {
    const newExpanded = new Set(expandedLibraries)
    if (newExpanded.has(library)) {
      newExpanded.delete(library)
    } else {
      newExpanded.add(library)
    }
    setExpandedLibraries(newExpanded)
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Mini keyboard visualization
  const visualization = (
    <div className="sampler-visualization">
      <div className="sampler-current-sound">
        <PianoKeys size={16} weight="duotone" style={{ color: accentColor }} />
        <div className="sampler-sound-info">
          <span className="sampler-sound-name">
            {currentSoundfont?.name || 'No sound loaded'}
          </span>
          {currentSoundfont && (
            <span className="sampler-sound-meta">
              {currentSoundfont.format.toUpperCase()} • {formatSize(currentSoundfont.size)}
            </span>
          )}
        </div>
        <button
          className="sampler-browse-btn"
          onClick={() => setShowBrowser(true)}
          style={{ '--accent': accentColor } as React.CSSProperties}
        >
          <Folder size={14} weight="duotone" />
          Browse
        </button>
      </div>

      {/* Mini keyboard display */}
      <div className="sampler-mini-keyboard">
        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].map((note, i) => {
          const isBlack = note.includes('#')
          return (
            <div
              key={`${note}-${i}`}
              className={`sampler-key ${isBlack ? 'black' : 'white'}`}
              style={{ '--accent': accentColor } as React.CSSProperties}
            />
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      <PluginCardShell
        plugin={plugin}
        accentColor={accentColor}
        bypassed={plugin.bypassed}
        visualization={visualization}
        compact={compact}
      >
        {/* Main Controls */}
        <ParameterSection title="Output" accentColor={accentColor}>
          <ParameterRow>
            <ParameterKnob
              label="Volume"
              value={getValue('volume', 80)}
              min={0}
              max={100}
              defaultValue={80}
              unit="%"
              onChange={(v) => setValue('volume', v)}
              accentColor={accentColor}
              size="large"
            />
            <ParameterKnob
              label="Pan"
              value={getValue('pan', 50)}
              min={0}
              max={100}
              defaultValue={50}
              unit=""
              onChange={(v) => setValue('pan', v)}
              accentColor="#6b7280"
              size="medium"
              valueFormatter={(v) => {
                const pan = v - 50
                if (pan === 0) return 'C'
                return pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`
              }}
            />
          </ParameterRow>
        </ParameterSection>

        <ParameterSection title="Tuning" accentColor={accentColor}>
          <ParameterRow>
            <ParameterKnob
              label="Tune"
              value={getValue('tuning', 0)}
              min={-100}
              max={100}
              defaultValue={0}
              unit="¢"
              onChange={(v) => setValue('tuning', v)}
              accentColor="#f59e0b"
              size="medium"
              valueFormatter={(v) => (v >= 0 ? '+' : '') + v.toFixed(0)}
            />
            <ParameterKnob
              label="Polyphony"
              value={getValue('polyphony', 64)}
              min={1}
              max={128}
              defaultValue={64}
              unit=""
              onChange={(v) => setValue('polyphony', v)}
              accentColor="#8b5cf6"
              size="medium"
              valueFormatter={(v) => v.toFixed(0) + ' voices'}
            />
          </ParameterRow>
        </ParameterSection>

        {/* Footer with library info */}
        <div className="sampler-footer">
          <div className="sampler-footer-item">
            <HardDrive size={10} weight="duotone" />
            <span>{soundfontsData?.total || 0} sounds available</span>
          </div>
          <div className="sampler-footer-item">
            <FileAudio size={10} weight="duotone" />
            <span>SFZ/SF2/SF3</span>
          </div>
        </div>
      </PluginCardShell>

      {/* Soundfont Browser Modal */}
      {showBrowser && (
        <div className="sampler-browser-overlay" onClick={() => setShowBrowser(false)}>
          <div className="sampler-browser-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sampler-browser-header">
              <div className="sampler-browser-title">
                <MusicNote size={18} weight="duotone" style={{ color: accentColor }} />
                <span>Sound Library</span>
              </div>
              <button className="sampler-browser-close" onClick={() => setShowBrowser(false)}>
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="sampler-browser-toolbar">
              <div className="sampler-search-box">
                <MagnifyingGlass size={14} weight="duotone" />
                <input
                  type="text"
                  placeholder="Search sounds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="sampler-category-select">
                <Funnel size={14} weight="duotone" />
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                >
                  <option value="">All Categories</option>
                  {SOUNDFONT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sound List */}
            <div className="sampler-browser-list">
              {isLoading ? (
                <div className="sampler-browser-loading">Loading sounds...</div>
              ) : Object.keys(groupedByLibrary).length === 0 ? (
                <div className="sampler-browser-empty">No sounds found</div>
              ) : (
                Object.entries(groupedByLibrary).map(([library, sounds]) => (
                  <div key={library} className="sampler-library-group">
                    <button
                      className="sampler-library-header"
                      onClick={() => toggleLibrary(library)}
                    >
                      {expandedLibraries.has(library) ? (
                        <FolderOpen size={14} weight="duotone" style={{ color: accentColor }} />
                      ) : (
                        <Folder size={14} weight="duotone" />
                      )}
                      <span>{library}</span>
                      <span className="sampler-library-count">{sounds.length}</span>
                      {expandedLibraries.has(library) ? (
                        <CaretDown size={14} weight="bold" />
                      ) : (
                        <CaretRight size={14} weight="bold" />
                      )}
                    </button>

                    {expandedLibraries.has(library) && (
                      <div className="sampler-library-items">
                        {sounds.map((sf) => (
                          <button
                            key={sf.id}
                            className={`sampler-sound-item ${currentSoundfont?.id === sf.id ? 'active' : ''}`}
                            onClick={() => loadSoundfont.mutate(sf)}
                            style={{ '--accent': accentColor } as React.CSSProperties}
                          >
                            <FileAudio size={14} weight="duotone" />
                            <div className="sampler-sound-details">
                              <span className="sampler-sound-title">{sf.name}</span>
                              <span className="sampler-sound-info">
                                {sf.category} • {sf.format.toUpperCase()} • {formatSize(sf.size)}
                              </span>
                            </div>
                            <button
                              className="sampler-favorite-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                // Toggle favorite
                              }}
                            >
                              {sf.isFavorite ? (
                                <Star size={14} weight="fill" color={accentColor} />
                              ) : (
                                <Star size={14} weight="duotone" />
                              )}
                            </button>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="sampler-browser-footer">
              <button
                className="sampler-download-btn"
                onClick={() => {
                  // Open library download page
                  window.open('/library', '_blank')
                }}
              >
                <DownloadSimple size={14} weight="duotone" />
                Download More Sounds
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default KeyboardSamplerCard
