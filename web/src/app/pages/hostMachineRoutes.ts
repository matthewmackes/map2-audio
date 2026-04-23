export const HOST_MACHINE_ROUTE = '/hardware/host-machine'

function normalizeSearch(search?: string | URLSearchParams | null): string {
  if (!search) {
    return ''
  }

  if (typeof search === 'string') {
    if (!search.trim()) {
      return ''
    }

    return search.startsWith('?') ? search : `?${search}`
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

export function buildHostMachinePath(search?: string | URLSearchParams | null): string {
  return `${HOST_MACHINE_ROUTE}${normalizeSearch(search)}`
}
