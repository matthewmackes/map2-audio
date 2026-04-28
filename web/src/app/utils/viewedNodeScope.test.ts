import { NODE_PAGE_KEYS } from './nodeDisplay'
import {
  VIEWED_HOST_QUERY_PARAM,
  applyViewedNodeScopeToAllPages,
  readViewedHostFromSearch,
  writeViewedHostToSearch,
} from './viewedNodeScope'

describe('applyViewedNodeScopeToAllPages', () => {
  it('updates every unique node page scope', () => {
    const setViewedNode = jest.fn<void, [string, string]>()

    applyViewedNodeScopeToAllPages(setViewedNode, 'node-123')

    const expectedPageKeys = Array.from(new Set(Object.values(NODE_PAGE_KEYS)))
    expect(setViewedNode).toHaveBeenCalledTimes(expectedPageKeys.length)
    for (const pageKey of expectedPageKeys) {
      expect(setViewedNode).toHaveBeenCalledWith(pageKey, 'node-123')
    }
  })

  it('skips empty node ids', () => {
    const setViewedNode = jest.fn<void, [string, string]>()

    applyViewedNodeScopeToAllPages(setViewedNode, '   ')

    expect(setViewedNode).not.toHaveBeenCalled()
  })

  it('reads viewed host from querystring', () => {
    expect(readViewedHostFromSearch(`?foo=bar&${VIEWED_HOST_QUERY_PARAM}=node-x`)).toBe('node-x')
    expect(readViewedHostFromSearch(`?${VIEWED_HOST_QUERY_PARAM}=   `)).toBeNull()
    expect(readViewedHostFromSearch('?foo=bar')).toBeNull()
  })

  it('writes viewed host into querystring while preserving existing params', () => {
    expect(writeViewedHostToSearch('?foo=bar', 'node-y')).toBe(`?foo=bar&${VIEWED_HOST_QUERY_PARAM}=node-y`)
    expect(writeViewedHostToSearch('', 'node-y')).toBe(`?${VIEWED_HOST_QUERY_PARAM}=node-y`)
    expect(writeViewedHostToSearch('?foo=bar', '   ')).toBe('?foo=bar')
  })
})
