import type { Plugin } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'

type BrowserPlugin = Pick<Plugin, 'name' | 'uri' | 'author'>

function normalizeSortValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function sortPluginsForBrowser<T extends BrowserPlugin>(plugins: T[]): T[] {
  return [...plugins].sort((left, right) => {
    const leftName = normalizeSortValue(getDisplayPluginName(left.name, left.uri))
    const rightName = normalizeSortValue(getDisplayPluginName(right.name, right.uri))
    const nameCompare = leftName.localeCompare(rightName)
    if (nameCompare !== 0) {
      return nameCompare
    }

    const leftAuthor = normalizeSortValue(sanitizeRestrictedDisplayText(left.author))
    const rightAuthor = normalizeSortValue(sanitizeRestrictedDisplayText(right.author))
    const authorCompare = leftAuthor.localeCompare(rightAuthor)
    if (authorCompare !== 0) {
      return authorCompare
    }

    return left.uri.localeCompare(right.uri)
  })
}
