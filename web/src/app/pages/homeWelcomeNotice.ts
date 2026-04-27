import { parseBoolean, readPersisted, writePersisted, type PersistedKey } from '../utils/persistedState'

export const HOME_WELCOME_NOTICE_HIDDEN_STORAGE_KEY = 'map2:home-welcome-notice:hidden'

const HOME_WELCOME_NOTICE_HIDDEN_KEY: PersistedKey<boolean> = {
  storageKey: HOME_WELCOME_NOTICE_HIDDEN_STORAGE_KEY,
  fallback: false,
  parse: parseBoolean,
  serialize: (value) => String(value),
}

export function readHomeWelcomeNoticeHidden(): boolean {
  return readPersisted(HOME_WELCOME_NOTICE_HIDDEN_KEY)
}

export function writeHomeWelcomeNoticeHidden(hidden: boolean): void {
  writePersisted(HOME_WELCOME_NOTICE_HIDDEN_KEY, hidden)
}
