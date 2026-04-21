import { runSshTrustBootstrap, type BootstrapPeer } from './sshTrustBootstrap'

type FetchCall = { url: string; init?: RequestInit }

function installFetchMock(
  handler: (call: FetchCall) => { ok: boolean; status?: number; body?: unknown },
): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: FetchCall[] = []
  const fn = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const call = { url, init }
    calls.push(call)
    const resp = handler(call)
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: () => Promise.resolve(resp.body ?? {}),
    } as unknown as Response)
  })
  ;(globalThis as unknown as { fetch: unknown }).fetch = fn as unknown as typeof fetch
  return {
    calls,
    restore: () => {
      ;(globalThis as unknown as { fetch: unknown }).fetch = original
    },
  }
}

const PEER_A: BootstrapPeer = {
  node_id: 'node-a',
  hostname: 'alpha',
  host: '10.0.0.50',
  port: 22,
  is_online: true,
  ssh_trusted: false,
}
const PEER_B: BootstrapPeer = {
  node_id: 'node-b',
  hostname: 'beta',
  host: '10.0.0.51',
  port: 22,
  is_online: true,
  ssh_trusted: true,
}
const PEER_OFFLINE: BootstrapPeer = {
  node_id: 'node-c',
  host: '10.0.0.52',
  is_online: false,
}

describe('runSshTrustBootstrap', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('generates a key if the local node has none, then distributes + trusts untrusted peers', async () => {
    const mock = installFetchMock((call) => {
      if (call.url === '/api/ssh/trust/status') {
        return {
          ok: true,
          body: { local_node_id: 'local-1', local_fingerprint: 'fp-local', trusted_peers: [] },
        }
      }
      if (call.url === '/api/ssh/keys') {
        return { ok: false, status: 404 }
      }
      if (call.url === '/api/ssh/keys/generate') {
        return { ok: true, body: { node_id: 'local-1', fingerprint: 'fp-local' } }
      }
      if (call.url === '/api/ssh/keys/distribute') {
        return { ok: true, body: { status: 'success' } }
      }
      if (call.url.startsWith('/api/node/') && call.url.endsWith('/proxy/api/ssh/keys')) {
        return { ok: true, body: { public_key: 'ssh-rsa AAAA... peer' } }
      }
      if (call.url === '/api/ssh/trust/add') {
        return { ok: true, body: { trusted: true } }
      }
      return { ok: false, status: 404 }
    })

    const progress: string[] = []
    const report = await runSshTrustBootstrap([PEER_A, PEER_B, PEER_OFFLINE], (p) =>
      progress.push(p.phase),
    )

    expect(report.ok).toBe(true)
    expect(report.generated_key).toBe(true)
    expect(report.newly_trusted).toEqual(['node-a'])
    expect(report.already_trusted).toEqual(['node-b'])
    expect(report.skipped_offline).toEqual(['node-c'])
    expect(progress).toContain('trust-status')
    expect(progress).toContain('generate-key')
    expect(progress).toContain('distribute-key')
    expect(progress).toContain('add-trust')
    expect(progress[progress.length - 1]).toBe('done')

    mock.restore()
  })

  it('is idempotent when a key already exists and all peers are trusted', async () => {
    const mock = installFetchMock((call) => {
      if (call.url === '/api/ssh/trust/status') {
        return {
          ok: true,
          body: {
            local_node_id: 'local-1',
            local_fingerprint: 'fp',
            trusted_peers: [{ peer_id: 'node-a' }],
          },
        }
      }
      if (call.url === '/api/ssh/keys') {
        return { ok: true, body: { node_id: 'local-1', fingerprint: 'fp', public_key: '...' } }
      }
      return { ok: false, status: 404 }
    })

    const report = await runSshTrustBootstrap([PEER_A])
    expect(report.ok).toBe(true)
    expect(report.generated_key).toBe(false)
    expect(report.newly_trusted).toEqual([])
    expect(report.already_trusted).toEqual(['node-a'])
    // No distribute or trust/add calls should have been made:
    expect(mock.calls.some((c) => c.url === '/api/ssh/keys/distribute')).toBe(false)
    expect(mock.calls.some((c) => c.url === '/api/ssh/trust/add')).toBe(false)

    mock.restore()
  })

  it('records failure and keeps going when distribute fails for one peer', async () => {
    const mock = installFetchMock((call) => {
      if (call.url === '/api/ssh/trust/status') {
        return {
          ok: true,
          body: { local_node_id: 'local-1', local_fingerprint: 'fp', trusted_peers: [] },
        }
      }
      if (call.url === '/api/ssh/keys') {
        return { ok: true, body: {} }
      }
      if (call.url === '/api/ssh/keys/distribute') {
        return { ok: false, status: 408, body: { detail: 'SSH connection timeout' } }
      }
      return { ok: false, status: 404 }
    })

    const report = await runSshTrustBootstrap([PEER_A])
    expect(report.ok).toBe(false)
    expect(report.newly_trusted).toEqual([])
    expect(report.failed).toEqual([
      { peer_id: 'node-a', phase: 'distribute-key', error: 'SSH connection timeout' },
    ])

    mock.restore()
  })

  it('surfaces a local trust-status failure cleanly', async () => {
    const mock = installFetchMock(() => ({ ok: false, status: 500, body: { detail: 'boom' } }))
    const report = await runSshTrustBootstrap([])
    expect(report.ok).toBe(false)
    expect(report.failed).toEqual([
      { peer_id: 'local', phase: 'trust-status', error: 'boom' },
    ])
    mock.restore()
  })
})
