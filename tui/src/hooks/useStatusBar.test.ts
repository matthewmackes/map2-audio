import { buildStatusBarState } from './useStatusBar'

describe('buildStatusBarState', () => {
  it('keeps the footer left segment focused on route context once connection state moves to StatusBar', () => {
    const state = buildStatusBarState({
      apiBase: 'http://localhost:8080/api',
      currentScreen: 'Dashboard',
      currentScreenId: 'dashboard',
      terminalColumns: 120,
    })

    expect(state.left).toBe('Dashboard | http://localhost:8080/api')
    expect(state.right).toContain('Esc back')
  })
})
