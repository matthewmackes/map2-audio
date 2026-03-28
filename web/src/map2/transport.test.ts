jest.mock('./runtime', () => ({
  getRuntimeApiBaseOverride: jest.fn(),
  getRuntimeEnvApiBase: jest.fn(),
  getRuntimeLocation: jest.fn(),
}))

const runtime = jest.requireMock('./runtime') as {
  getRuntimeApiBaseOverride: jest.Mock
  getRuntimeEnvApiBase: jest.Mock
  getRuntimeLocation: jest.Mock
}

describe('transport', () => {
  beforeEach(() => {
    runtime.getRuntimeApiBaseOverride.mockReset()
    runtime.getRuntimeEnvApiBase.mockReset()
    runtime.getRuntimeLocation.mockReset()
    runtime.getRuntimeApiBaseOverride.mockReturnValue(undefined)
    runtime.getRuntimeEnvApiBase.mockReturnValue(undefined)
    runtime.getRuntimeLocation.mockReturnValue({
      protocol: 'http:',
      host: 'localhost:3000',
      hostname: 'localhost',
      port: '3000',
    })
  })

  it('prefers the runtime API base override', async () => {
    runtime.getRuntimeApiBaseOverride.mockReturnValue('https://runtime.example/api/')
    const { resolveApiBase } = await import('./transport')
    expect(resolveApiBase()).toBe('https://runtime.example/api')
  })

  it('uses same-origin API routing on port 3000 and localhost', async () => {
    const { resolveApiBase, getWsBaseUrl } = await import('./transport')
    expect(resolveApiBase()).toBe('/api')
    expect(getWsBaseUrl()).toBe('ws://localhost:3000')
  })

  it('targets backend port 8080 on non-standard remote ports', async () => {
    runtime.getRuntimeLocation.mockReturnValue({
      protocol: 'https:',
      host: 'mix-rack.example:4173',
      hostname: 'mix-rack.example',
      port: '4173',
    })
    const { resolveApiBase, getWsBaseUrl, getWsUrl } = await import('./transport')
    expect(resolveApiBase()).toBe('http://mix-rack.example:8080/api')
    expect(getWsBaseUrl()).toBe('wss://mix-rack.example:8080')
    expect(getWsUrl()).toBe('wss://mix-rack.example:8080/ws')
  })
})
