// ============================================================================
// Library Manager - TypeScript Type Definitions
// Types for IR library downloading/scraping and browsing
// ============================================================================

// ==================== Library Source Types ====================

export interface IRLibrarySource {
  name: string
  displayName: string
  description: string
  license: string
  count?: number
  iconColor: string
  requiresAuth?: boolean
}

export interface IRLibrarySummary {
  name: string
  count: number
  license: string
}

// ==================== Download Types ====================

export interface DownloadRequest {
  sources?: string[]
  parallel?: number
  skip_existing?: boolean
}

export interface DownloadStats {
  total_files: number
  downloaded: number
  failed: number
  skipped: number
  duration_seconds: number
}

export interface SourceProgress {
  name: string
  state: 'pending' | 'discovering' | 'downloading' | 'completed' | 'failed'
  discovered: number
  total_files: number
  downloaded: number
  failed: number
  skipped: number
  current_file: string | null
}

export interface DownloadProgress {
  is_downloading: boolean
  progress_percent: number
  current_source: string | null
  active_sources: string[]
  stats: DownloadStats | null
  sources: SourceProgress[] | null
}

// ==================== Enhanced Download Types ====================

export interface ChunkInfo {
  index: number
  start_byte: number
  end_byte: number
  size: number
  downloaded: boolean
  checksum: string | null
  retry_count: number
}

export interface FileDownloadTask {
  filename: string
  url: string
  total_size: number
  output_path: string
  state: 'PENDING' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED'
  downloaded_bytes: number
  chunks: ChunkInfo[]
  current_chunk: number | null
  speed_bps: number
  eta_seconds: number | null
  retry_count: number
  error_message: string | null
  checksum: string | null
  checksum_algorithm: string
  part_file_path: string
  manifest_path: string
  started_at: string | null
  completed_at: string | null
  paused_at: string | null
}

export interface EnhancedDownloadStats extends DownloadStats {
  paused: number
  downloaded_bytes: number
  total_bytes: number
  speed_bps: number
  average_speed_bps: number
  peak_speed_bps: number
  pause_time: string | null
  resume_time: string | null
  total_pause_duration: number
}

export interface DownloadEvent {
  event: string
  timestamp: string
  data: Record<string, unknown>
}

// ==================== IR Database Types ====================

export interface IRDatabaseItem {
  id: number
  name: string
  category: string
  subcategory: string | null
  library: string
  duration_seconds: number | null
  rt60: number | null
  sample_rate: number
  channels: number
  rating: number | null
  is_favorite: boolean
  times_used: number
}

export interface IRDetailedItem extends IRDatabaseItem {
  file_path: string
  file_hash: string
  length_samples: number
  peak_amplitude: number
  rms_level: number
  space_type: string | null
  license: string
  source_url: string | null
  author: string | null
  early_decay_time: number | null
  peak_location_ms: number | null
  tags: string[]
  description: string | null
  created_at: string
}

// ==================== Search & Filter Types ====================

export interface IRSearchRequest {
  query?: string
  category?: string
  library?: string
  min_rt60?: number
  max_rt60?: number
  favorites_only?: boolean
}

export interface IRCategory {
  id: number
  name: string
  parent_id: number | null
  description: string
  icon: string
}

// ==================== Response Types ====================

export interface IRListResponse {
  irs: IRDatabaseItem[]
  total: number
  limit: number
  offset: number
}

export interface IRSearchResponse {
  results: IRDatabaseItem[]
  count: number
}

export interface IRLibrariesResponse {
  libraries: IRLibrarySummary[]
}

export interface IRCategoriesResponse {
  categories: IRCategory[]
  count: number
}

// ==================== Static Data ====================

export const LIBRARY_SOURCES: IRLibrarySource[] = [
  // Reverb IRs
  {
    name: 'conners',
    displayName: 'REAPER Blog IRs',
    description: '48 synthetic reverb IRs with various decay times',
    license: 'Free',
    iconColor: '#37d6c9',
  },
  {
    name: 'voxengo',
    displayName: 'Voxengo',
    description: 'Concert halls, churches, unique spaces - royalty-free',
    license: 'Royalty-free',
    iconColor: '#10b981',
  },
  {
    name: 'samplicity',
    displayName: 'Samplicity M7',
    description: 'Bricasti M7 reverb IRs - 134 presets, true stereo',
    license: 'Free (Newconomyware)',
    iconColor: '#06b6d4',
  },
  {
    name: 'signaltonoize',
    displayName: 'Signal To Noize',
    description: 'Classic hardware reverb impulse responses',
    license: 'Free (donations)',
    iconColor: '#14b8a6',
  },
  {
    name: 'echothief',
    displayName: 'EchoThief',
    description: '100+ real-world space IRs - caves, bridges, historic sites',
    license: 'Free',
    iconColor: '#8b5cf6',
  },
  {
    name: 'lexicon',
    displayName: 'Classic Reverb',
    description: 'Classic algorithmic reverb presets - halls, plates, rooms',
    license: 'Free',
    iconColor: '#3b82f6',
  },
  // Cabinet IRs
  {
    name: 'djammincabs',
    displayName: 'Djammincabs',
    description: '200+ guitar & bass cabinet IRs',
    license: 'Free for any use',
    iconColor: '#ef4444',
  },
  {
    name: 'overdriven',
    displayName: 'Overdriven.fr',
    description: 'High-quality guitar cabinet IRs - Celestion speakers',
    license: 'Free for personal use',
    iconColor: '#f97316',
  },
  // NAM Models
  {
    name: 'nam_github',
    displayName: 'NAM GitHub',
    description: 'Community NAM models organized by brand',
    license: 'Various',
    iconColor: '#6366f1',
  },
  {
    name: 'tone3000',
    displayName: 'TONE3000',
    description: 'Largest NAM community - requires API key',
    license: 'Various',
    iconColor: '#8b5cf6',
    requiresAuth: true,
  },
]

// TONE3000 Auth Status
export interface Tone3000Status {
  configured: boolean
  authenticated: boolean
  auth_url: string
  token_expires: string | null
}

// ==================== SoundFont Types ====================

export interface SoundFont {
  name: string
  filename: string
  path: string
  format: 'sf2' | 'sfz'
  category: string
  library: string
  size: number
}

export interface SoundFontListResponse {
  soundfonts: SoundFont[]
  total: number
  limit: number
  offset: number
}

export interface SoundFontLibrary {
  name: string
  displayName: string
  description: string
  license: string
  count: number
  iconColor: string
}

export interface SoundFontLibrariesResponse {
  libraries: SoundFontLibrary[]
}

export interface SoundFontCategoriesResponse {
  categories: Array<{ name: string; count: number }>
}

// ==================== SoundFont Static Data ====================

export const SOUNDFONT_SOURCES: IRLibrarySource[] = [
  {
    name: 'sfzinstruments',
    displayName: 'SFZ Instruments',
    description: 'Open source SFZ instruments from GitHub',
    license: 'Various (mostly CC)',
    iconColor: '#10b981',
  },
  {
    name: 'musical_artifacts',
    displayName: 'Musical Artifacts',
    description: 'Community-curated SF2 and SFZ collection',
    license: 'Various',
    iconColor: '#8b5cf6',
  },
  {
    name: 'freepats',
    displayName: 'FreePats',
    description: 'Quality free soundfonts with CC licenses',
    license: 'CC-BY / CC0',
    iconColor: '#f59e0b',
  },
  {
    name: 'internet_archive',
    displayName: 'Internet Archive',
    description: 'Classic GM soundfonts - Arachno, FluidR3, GeneralUser, Timbres of Heaven',
    license: 'Various',
    iconColor: '#3b82f6',
  },
  {
    name: 'polyphone',
    displayName: 'Polyphone',
    description: 'Community SF2 repository with quality instruments',
    license: 'Various',
    iconColor: '#06b6d4',
  },
  {
    name: 'vsco',
    displayName: 'VSCO Community',
    description: 'Versilian Studios Chamber Orchestra - professional orchestral SFZ',
    license: 'CC0',
    iconColor: '#a855f7',
  },
  {
    name: 'pianobook',
    displayName: 'PianoBook',
    description: 'Community-sampled instruments - pianos, strings, and more',
    license: 'Free for personal use',
    iconColor: '#ec4899',
  },
  {
    name: 'vpo',
    displayName: 'Virtual Playing Orchestra',
    description: 'Free orchestral library - includes Sonatina Symphonic Orchestra',
    license: 'CC-BY-SA',
    iconColor: '#f97316',
  },
]
