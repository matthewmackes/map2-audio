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
    description: 'Classic hardware reverbs - Lexicon, Eventide, Quantec',
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
    displayName: 'Lexicon 480L',
    description: 'Classic Lexicon 480L presets - halls, plates, rooms',
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
