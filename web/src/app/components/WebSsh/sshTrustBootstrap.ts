/**
 * T2419-C — First-run SSH key + peer trust bootstrap.
 *
 * Idempotent helper invoked from the Web SSH tab on mount. Drives the
 * existing /api/ssh/* endpoints:
 *   - GET  /api/ssh/trust/status    (what's trusted already)
 *   - GET  /api/ssh/keys            (does local node have a key?)
 *   - POST /api/ssh/keys/generate   (if not)
 *   - POST /api/ssh/keys/distribute (per untrusted peer)
 *   - POST /api/ssh/trust/add       (per untrusted peer)
 *
 * Re-running is safe: distribute/trust steps are skipped for already-trusted
 * peers. No thrown exceptions — callers receive a structured report.
 */

export interface BootstrapPeer {
  node_id: string
  host: string
  port?: number
  hostname?: string | null
  ssh_trusted?: boolean
  is_online?: boolean
  ssh_url?: string
}

export interface BootstrapPhaseProgress {
  phase:
    | 'trust-status'
    | 'generate-key'
    | 'distribute-key'
    | 'add-trust'
    | 'done'
    | 'error'
  peer_id?: string
  message: string
}

export interface BootstrapReport {
  local_node_id: string | null
  local_fingerprint: string | null
  generated_key: boolean
  already_trusted: string[]
  newly_trusted: string[]
  failed: Array<{ peer_id: string; phase: string; error: string }>
  skipped_offline: string[]
  ok: boolean
}

const DEFAULT_USER = 'mm'

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await readJson(res)) as { detail?: string; error?: { message?: string } }
  return body.error?.message ?? body.detail ?? `HTTP ${res.status}`
}

export async function runSshTrustBootstrap(
  peers: BootstrapPeer[],
  onProgress?: (p: BootstrapPhaseProgress) => void,
): Promise<BootstrapReport> {
  const report: BootstrapReport = {
    local_node_id: null,
    local_fingerprint: null,
    generated_key: false,
    already_trusted: [],
    newly_trusted: [],
    failed: [],
    skipped_offline: [],
    ok: true,
  }

  onProgress?.({ phase: 'trust-status', message: 'Reading local SSH trust status…' })
  const trustRes = await fetch('/api/ssh/trust/status')
  if (!trustRes.ok) {
    report.ok = false
    report.failed.push({
      peer_id: 'local',
      phase: 'trust-status',
      error: await errorMessage(trustRes),
    })
    onProgress?.({ phase: 'error', message: 'Could not read trust status' })
    return report
  }
  const trust = (await readJson(trustRes)) as {
    local_node_id?: string
    local_fingerprint?: string
    trusted_peers?: Array<{ peer_id: string }>
  }
  report.local_node_id = trust.local_node_id ?? null
  report.local_fingerprint = trust.local_fingerprint ?? null
  const trustedIds = new Set((trust.trusted_peers ?? []).map((p) => p.peer_id))

  const keysRes = await fetch('/api/ssh/keys')
  if (!keysRes.ok) {
    onProgress?.({ phase: 'generate-key', message: 'No local SSH key found — generating…' })
    const genRes = await fetch('/api/ssh/keys/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_type: 'rsa', key_bits: 4096 }),
    })
    if (!genRes.ok) {
      report.ok = false
      report.failed.push({
        peer_id: 'local',
        phase: 'generate-key',
        error: await errorMessage(genRes),
      })
      onProgress?.({ phase: 'error', message: 'Failed to generate SSH key' })
      return report
    }
    report.generated_key = true
  }

  for (const peer of peers) {
    if (peer.is_online === false) {
      report.skipped_offline.push(peer.node_id)
      continue
    }
    if (trustedIds.has(peer.node_id) || peer.ssh_trusted === true) {
      report.already_trusted.push(peer.node_id)
      continue
    }

    onProgress?.({
      phase: 'distribute-key',
      peer_id: peer.node_id,
      message: `Distributing key to ${peer.hostname || peer.node_id}…`,
    })
    const distRes = await fetch('/api/ssh/keys/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peer_id: peer.node_id,
        peer_host: peer.host,
        peer_user: DEFAULT_USER,
      }),
    })
    if (!distRes.ok) {
      report.ok = false
      report.failed.push({
        peer_id: peer.node_id,
        phase: 'distribute-key',
        error: await errorMessage(distRes),
      })
      continue
    }

    onProgress?.({
      phase: 'add-trust',
      peer_id: peer.node_id,
      message: `Adding ${peer.hostname || peer.node_id} to trusted peers…`,
    })
    const remoteKeyRes = await fetch(
      `/api/node/${encodeURIComponent(peer.node_id)}/proxy/api/ssh/keys`,
    )
    let peerPublicKey = ''
    if (remoteKeyRes.ok) {
      const remoteKey = (await readJson(remoteKeyRes)) as { public_key?: string }
      peerPublicKey = remoteKey.public_key ?? ''
    }
    if (!peerPublicKey) {
      report.failed.push({
        peer_id: peer.node_id,
        phase: 'add-trust',
        error: 'peer public key unavailable',
      })
      continue
    }

    const addRes = await fetch('/api/ssh/trust/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peer_id: peer.node_id,
        peer_public_key: peerPublicKey,
      }),
    })
    if (!addRes.ok) {
      report.ok = false
      report.failed.push({
        peer_id: peer.node_id,
        phase: 'add-trust',
        error: await errorMessage(addRes),
      })
      continue
    }
    report.newly_trusted.push(peer.node_id)
  }

  onProgress?.({
    phase: 'done',
    message: `Bootstrap complete — ${report.newly_trusted.length} newly trusted, ${report.already_trusted.length} already trusted`,
  })
  return report
}
