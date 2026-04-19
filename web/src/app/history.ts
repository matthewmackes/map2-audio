import { createBrowserHistory, parsePath, type BrowserHistory, type To } from 'history'

type RouterCompatibleHistory = BrowserHistory & {
  createURL(to: To): URL
  encodeLocation(to: To): {
    pathname: string
    search: string
    hash: string
  }
}

const history = createBrowserHistory() as RouterCompatibleHistory

history.createURL = (to) => new URL(history.createHref(to), window.location.origin)
history.encodeLocation = (to) => {
  const path = typeof to === 'string' ? parsePath(to) : to
  return {
    pathname: path.pathname || '',
    search: path.search || '',
    hash: path.hash || '',
  }
}

export const appHistory = history
