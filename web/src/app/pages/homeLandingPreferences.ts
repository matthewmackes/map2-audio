import { readPersisted, writePersisted, type PersistedKey } from '../utils/persistedState'

export const HOME_LANDING_PREFERENCES_STORAGE_KEY = 'map2:home-landing-preferences'

export interface HomeLandingPreferences {
  version: 1
  cinematicBackdropEnabled: boolean
  bootSplashEnabled: boolean
}

const DEFAULT_PREFERENCES: HomeLandingPreferences = {
  version: 1,
  cinematicBackdropEnabled: false,
  bootSplashEnabled: false,
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeHomeLandingPreferences(value: unknown): HomeLandingPreferences {
  if (isObject(value)) {
    return {
      version: 1,
      cinematicBackdropEnabled: value.cinematicBackdropEnabled === true,
      bootSplashEnabled: value.bootSplashEnabled === true,
    }
  }

  return { ...DEFAULT_PREFERENCES }
}

const HOME_LANDING_PREFERENCES_KEY: PersistedKey<HomeLandingPreferences> = {
  storageKey: HOME_LANDING_PREFERENCES_STORAGE_KEY,
  fallback: { ...DEFAULT_PREFERENCES },
  parse: (raw) => {
    try {
      return normalizeHomeLandingPreferences(JSON.parse(raw) as unknown)
    } catch {
      return undefined
    }
  },
  serialize: (value) => JSON.stringify(value),
}

export function readHomeLandingPreferences(): HomeLandingPreferences {
  return readPersisted(HOME_LANDING_PREFERENCES_KEY)
}

export function writeHomeLandingPreferences(preferences: HomeLandingPreferences): HomeLandingPreferences {
  const normalized = normalizeHomeLandingPreferences(preferences)
  writePersisted(HOME_LANDING_PREFERENCES_KEY, normalized)
  return normalized
}

export function updateHomeLandingPreferences(
  updates: Partial<Omit<HomeLandingPreferences, 'version'>>,
): HomeLandingPreferences {
  return writeHomeLandingPreferences({
    ...readHomeLandingPreferences(),
    ...updates,
    version: 1,
  })
}
