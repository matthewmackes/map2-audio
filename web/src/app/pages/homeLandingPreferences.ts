export const HOME_LANDING_PREFERENCES_STORAGE_KEY = 'map2:home-landing-preferences'

export interface HomeLandingPreferences {
  version: 1
  cinematicBackdropEnabled: boolean
  bootSplashEnabled: boolean
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

  return {
    version: 1,
    cinematicBackdropEnabled: false,
    bootSplashEnabled: false,
  }
}

export function readHomeLandingPreferences(): HomeLandingPreferences {
  if (typeof window === 'undefined') {
    return normalizeHomeLandingPreferences(null)
  }

  try {
    const raw = window.localStorage.getItem(HOME_LANDING_PREFERENCES_STORAGE_KEY)
    if (!raw) {
      return normalizeHomeLandingPreferences(null)
    }

    return normalizeHomeLandingPreferences(JSON.parse(raw) as unknown)
  } catch {
    return normalizeHomeLandingPreferences(null)
  }
}

export function writeHomeLandingPreferences(preferences: HomeLandingPreferences) {
  if (typeof window === 'undefined') {
    return preferences
  }

  const normalized = normalizeHomeLandingPreferences(preferences)

  try {
    window.localStorage.setItem(HOME_LANDING_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore local-storage persistence failures and keep the in-memory value.
  }

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
