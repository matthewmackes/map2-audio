/**
 * KeyboardSamplerCard - Sfizz SFZ/SF2 Sampler (Carbon-compliant)
 *
 * Professional sampler using InstrumentCategoryLayout.
 *
 * LV2 URI: http://sfztools.github.io/sfizz
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { InstrumentCategoryLayout, type ParamSlot } from '../../Layouts/InstrumentCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import {
  ChevronDown,
  ChevronRight,
  Close,
  DataBase,
  DocumentAudio,
  Download,
  Filter,
  Folder,
  FolderOpen,
  Keyboard,
  Music,
  Search,
  StarFilled,
} from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'
import api from '../../../../../map2/api'

const PARAM_MAP = {
  volume: 0,
  pan: 1,
  tuning: 2,
  polyphony: 3,
}

const SOUNDFONT_CATEGORIES = [
  'Piano', 'Keyboards', 'Organ', 'Strings', 'Brass', 'Woodwinds',
  'Guitar', 'Bass', 'Drums', 'Percussion', 'Synth', 'Ethnic', 'Choir', 'Sound FX',
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

export function KeyboardSamplerCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#3b82f6',
  compact = false,
}: PluginCardProps) {
  const [showBrowser, setShowBrowser] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedLibraries, setExpandedLibraries] = useState<Set<string>>(new Set(['User']))
  const [currentSoundfont, setCurrentSoundfont] = useState<SoundFont | null>(null)

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

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
        return { soundfonts: [] as SoundFont[], total: 0 }
      }
    },
    enabled: showBrowser,
  })

  const loadSoundfont = useMutation({
    mutationFn: async (soundfont: SoundFont) => {
      setCurrentSoundfont(soundfont)
      return soundfont
    },
    onSuccess: () => { setShowBrowser(false) },
  })

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

  const groupedByLibrary = useMemo(() => {
    const groups: Record<string, SoundFont[]> = {}
    filteredSoundfonts.forEach((sf) => {
      if (!groups[sf.library]) groups[sf.library] = []
      groups[sf.library].push(sf)
    })
    return groups
  }, [filteredSoundfonts])

  const toggleLibrary = (library: string) => {
    const newExpanded = new Set(expandedLibraries)
    if (newExpanded.has(library)) newExpanded.delete(library)
    else newExpanded.add(library)
    setExpandedLibraries(newExpanded)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const visualization = (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#111827', borderRadius: 8, marginBottom: 8 }}>
        <Keyboard size={16} style={{ color: accentColor }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>
            {currentSoundfont?.name || 'No sound loaded'}
          </div>
          {currentSoundfont && (
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {currentSoundfont.format.toUpperCase()} {'\u2022'} {formatSize(currentSoundfont.size)}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowBrowser(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
            background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44`,
            borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Folder size={14} /> Browse
        </button>
      </div>
      {/* Mini keyboard */}
      <div style={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].map((note, i) => {
          const isBlack = note.includes('#')
          return (
            <div
              key={`${note}-${i}`}
              style={{
                width: isBlack ? 12 : 18, height: isBlack ? 24 : 32,
                background: isBlack ? '#1e293b' : '#e5e7eb',
                borderRadius: 2, border: '1px solid #374151',
              }}
            />
          )
        })}
      </div>
    </div>
  )

  const performanceParams: ParamSlot[] = [
    {
      label: 'Volume', value: getValue('volume', 80),
      min: 0, max: 100, defaultValue: 80, unit: '%',
      onChange: (v) => setValue('volume', v),
    },
    {
      label: 'Pan', value: getValue('pan', 50),
      min: 0, max: 100, defaultValue: 50,
      onChange: (v) => setValue('pan', v),
      valueFormatter: (v) => {
        const pan = v - 50
        if (pan === 0) return 'C'
        return pan < 0 ? `L${Math.abs(pan)}` : `R${pan}`
      },
    },
    {
      label: 'Tune', value: getValue('tuning', 0),
      min: -100, max: 100, defaultValue: 0, unit: '\u00a2',
      onChange: (v) => setValue('tuning', v),
      valueFormatter: (v) => (v >= 0 ? '+' : '') + v.toFixed(0),
    },
    {
      label: 'Polyphony', value: getValue('polyphony', 64),
      min: 1, max: 128, defaultValue: 64, step: 1,
      onChange: (v) => setValue('polyphony', v),
      valueFormatter: (v) => v.toFixed(0) + ' voices',
    },
  ]

  const advancedSections: AdvancedSection[] = [
    {
      id: 'library-info',
      title: 'Library Info',
      children: (
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9ca3af' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <DataBase size={10} />
            <span>{soundfontsData?.total || 0} sounds available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <DocumentAudio size={10} />
            <span>SFZ/SF2/SF3</span>
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      <InstrumentCategoryLayout
        plugin={plugin}
        accentColor={accentColor}
        compact={compact}
        bypassed={plugin.bypassed}
        visualization={visualization}
        performanceParams={performanceParams}
        advancedSections={advancedSections}
      />

      {/* Soundfont Browser Modal */}
      {showBrowser && (
        <div
          onClick={() => setShowBrowser(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxHeight: '80vh', background: '#0f172a',
              borderRadius: 12, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Music size={18} style={{ color: accentColor }} />
                <span style={{ fontWeight: 700, color: '#e5e7eb' }}>Sound Library</span>
              </div>
              <button onClick={() => setShowBrowser(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                <Close size={18} />
              </button>
            </div>

            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#111827', borderRadius: 6, border: '1px solid #374151' }}>
                <Search size={14} style={{ color: '#6b7280' }} />
                <input
                  type="text" placeholder="Search sounds..."
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ background: 'none', border: 'none', color: '#e5e7eb', fontSize: 12, outline: 'none', flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Filter size={14} style={{ color: '#6b7280' }} />
                <select
                  value={selectedCategory || ''} onChange={(e) => setSelectedCategory(e.target.value || null)}
                  style={{ padding: '6px 8px', background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
                >
                  <option value="">All</option>
                  {SOUNDFONT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sound List */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
              {isLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading sounds...</div>
              ) : Object.keys(groupedByLibrary).length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No sounds found</div>
              ) : (
                Object.entries(groupedByLibrary).map(([library, sounds]) => (
                  <div key={library} style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => toggleLibrary(library)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                        padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db',
                      }}
                    >
                      {expandedLibraries.has(library) ? <FolderOpen size={14} style={{ color: accentColor }} /> : <Folder size={14} />}
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{library}</span>
                      <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>{sounds.length}</span>
                      {expandedLibraries.has(library) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {expandedLibraries.has(library) && sounds.map((sf) => (
                      <button
                        key={sf.id}
                        onClick={() => loadSoundfont.mutate(sf)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '6px 8px 6px 24px', background: currentSoundfont?.id === sf.id ? `${accentColor}15` : 'transparent',
                          border: currentSoundfont?.id === sf.id ? `1px solid ${accentColor}44` : '1px solid transparent',
                          borderRadius: 6, cursor: 'pointer', color: '#d1d5db', textAlign: 'left',
                        }}
                      >
                        <DocumentAudio size={14} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{sf.name}</div>
                          <div style={{ fontSize: 9, color: '#6b7280' }}>{sf.category} {'\u2022'} {sf.format.toUpperCase()} {'\u2022'} {formatSize(sf.size)}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation() }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: sf.isFavorite ? accentColor : '#374151' }}
                        >
                          <StarFilled size={14} />
                        </button>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
              <button
                onClick={() => window.open('/library', '_blank')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: 'transparent', color: accentColor, border: `1px solid ${accentColor}44`,
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center',
                }}
              >
                <Download size={14} /> Download More Sounds
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default KeyboardSamplerCard
