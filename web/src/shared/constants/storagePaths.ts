/**
 * Centralized Storage Paths for MAP2 Audio Platform
 * 
 * IMPORTANT: These paths must match the backend configuration in:
 * - app/config.py (CONFIG_SCHEMA storage.* settings)
 * - app/paths.py (StoragePaths class)
 * 
 * To fetch dynamic paths from the backend, use the API endpoint:
 * GET /folders/display-paths
 * 
 * This file provides static fallbacks for when API is unavailable.
 */

// ============================================================================
// Primary User Directories (XDG-compliant)
// ============================================================================

/**
 * NAM (Neural Amp Modeler) models directory
 * Default: ~/.local/share/map2/nam
 */
export const NAM_MODELS_DIR = '~/.local/share/map2/nam';

/**
 * Base IR (Impulse Response) directory
 * Default: ~/.local/share/map2/ir
 */
export const IR_BASE_DIR = '~/.local/share/map2/ir';

/**
 * Cabinet IR directory (subdirectory of IR_BASE_DIR)
 * Default: ~/.local/share/map2/ir/cabinets
 */
export const IR_CABINETS_DIR = '~/.local/share/map2/ir/cabinets';

/**
 * Reverb IR directory (subdirectory of IR_BASE_DIR)
 * Default: ~/.local/share/map2/ir/reverbs
 */
export const IR_REVERBS_DIR = '~/.local/share/map2/ir/reverbs';

/**
 * User-uploaded IR directory
 * Default: ~/.local/share/map2/ir/user
 */
export const IR_USER_DIR = '~/.local/share/map2/ir/user';


// ============================================================================
// System Directories (read-only for regular users)
// ============================================================================

/**
 * System NAM models directory (managed by package manager/admin)
 * Default: /var/lib/map2/nam
 */
export const NAM_SYSTEM_DIR = '/var/lib/map2/nam';

/**
 * System IR directory (managed by package manager/admin)
 * Default: /var/lib/map2/ir
 */
export const IR_SYSTEM_DIR = '/var/lib/map2/ir';


// ============================================================================
// Extra Discovery Paths (legacy compatibility)
// ============================================================================

/**
 * Additional paths searched for NAM models
 */
export const NAM_EXTRA_PATHS = [
  '~/NAM/models',
  '~/.local/share/NAM',
  '/usr/share/map2/nam',
];

/**
 * Additional paths searched for IR files
 */
export const IR_EXTRA_PATHS = [
  '~/Impulses',
  '~/IRs',
  '/usr/share/map2/ir',
  '/usr/share/impulses',
];


// ============================================================================
// Path Display Configuration (for UI components)
// ============================================================================

export interface StoragePathsConfig {
  namModels: string;
  irCabinets: string;
  irReverbs: string;
  irUserUploads: string;
  namSystem: string;
  irSystem: string;
  namExtraPaths: string[];
  irExtraPaths: string[];
}

/**
 * Default storage paths configuration
 * Use fetchStoragePaths() to get dynamic paths from backend
 */
export const DEFAULT_STORAGE_PATHS: StoragePathsConfig = {
  namModels: NAM_MODELS_DIR,
  irCabinets: IR_CABINETS_DIR,
  irReverbs: IR_REVERBS_DIR,
  irUserUploads: IR_USER_DIR,
  namSystem: NAM_SYSTEM_DIR,
  irSystem: IR_SYSTEM_DIR,
  namExtraPaths: NAM_EXTRA_PATHS,
  irExtraPaths: IR_EXTRA_PATHS,
};


// ============================================================================
// API Integration
// ============================================================================

export interface DisplayPathsResponse {
  nam_models: string;
  ir_cabinets: string;
  ir_reverbs: string;
  ir_user_uploads: string;
  nam_models_display: string;
  ir_cabinets_display: string;
  ir_reverbs_display: string;
}

/**
 * Fetch storage paths from backend API
 * Returns the canonical paths that should be used for display
 * 
 * @returns Promise resolving to DisplayPathsResponse or null on error
 */
export async function fetchStoragePaths(): Promise<DisplayPathsResponse | null> {
  try {
    const response = await fetch('/folders/display-paths');
    if (!response.ok) {
      console.warn('Failed to fetch storage paths from API, using defaults');
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('Error fetching storage paths:', error);
    return null;
  }
}

/**
 * Get display-friendly path strings
 * Falls back to static defaults if API unavailable
 */
export function getDisplayPaths(): { namModels: string; irCabinets: string; irReverbs: string } {
  return {
    namModels: NAM_MODELS_DIR,
    irCabinets: IR_CABINETS_DIR,
    irReverbs: IR_REVERBS_DIR,
  };
}
