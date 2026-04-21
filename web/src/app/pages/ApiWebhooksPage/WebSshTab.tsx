import {
  Accordion,
  AccordionItem,
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
  NumberInput,
  PasswordInput,
  Select,
  SelectItem,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { Add, Close, Renew } from '@carbon/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { XTermTerminal, type XTermConnection, type XTermStatus } from '../../components/WebSsh/XTermTerminal'
import './WebSshTab.css'

interface PeerSummary {
  node_id: string
  hostname: string | null
  host: string
  port: number
  ssh_url?: string
  ssh_trusted?: boolean
  is_online?: boolean
  node_mode?: string
}

interface SshSession {
  id: string
  label: string
  connection: XTermConnection
  status: XTermStatus
}

const SSH_PORT = 22
const DEFAULT_USER = 'mm'

function peerLabel(peer: PeerSummary): string {
  const name = peer.hostname || peer.node_id
  return `${name} (${peer.host})`
}

function newSessionId(): string {
  return `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function WebSshTab() {
  const [peers, setPeers] = useState<PeerSummary[]>([])
  const [peerLoading, setPeerLoading] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SshSession[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const [manualHost, setManualHost] = useState('')
  const [manualPort, setManualPort] = useState<number>(SSH_PORT)
  const [manualUser, setManualUser] = useState(DEFAULT_USER)
  const [manualAuth, setManualAuth] = useState<'publickey' | 'password'>('publickey')
  const [manualPassword, setManualPassword] = useState('')
  const [manualPrivateKey, setManualPrivateKey] = useState('')
  const [manualKnownHosts, setManualKnownHosts] = useState<'accept-new' | 'strict' | 'auto-add'>('accept-new')
  const [manualKeepalive, setManualKeepalive] = useState<number>(30)
  const [manualTimeout, setManualTimeout] = useState<number>(10)
  const [manualIdle, setManualIdle] = useState<number>(900)
  const [manualError, setManualError] = useState<string | null>(null)

  const loadPeers = useCallback(async () => {
    setPeerLoading(true)
    setPeerError(null)
    try {
      const res = await fetch('/api/peers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { peers?: PeerSummary[] }
      const list = Array.isArray(body.peers) ? body.peers : []
      setPeers(list)
      if (!selectedPeerId && list.length > 0) {
        setSelectedPeerId(list[0].node_id)
      }
    } catch (e) {
      setPeerError(e instanceof Error ? e.message : 'failed to load peers')
    } finally {
      setPeerLoading(false)
    }
  }, [selectedPeerId])

  useEffect(() => {
    loadPeers()
  }, [loadPeers])

  const selectedPeer = useMemo(
    () => peers.find((p) => p.node_id === selectedPeerId) ?? null,
    [peers, selectedPeerId],
  )

  const openSession = useCallback((label: string, connection: XTermConnection) => {
    const id = newSessionId()
    const sess: SshSession = { id, label, connection, status: { type: 'connecting' } }
    setSessions((prev) => {
      const next = [...prev, sess]
      setActiveIndex(next.length - 1)
      return next
    })
  }, [])

  const openPeerSession = useCallback(() => {
    if (!selectedPeer) return
    openSession(peerLabel(selectedPeer), {
      host: selectedPeer.host,
      port: selectedPeer.port && selectedPeer.port !== 0 ? SSH_PORT : SSH_PORT,
      username: DEFAULT_USER,
      auth: 'publickey',
      knownHosts: 'accept-new',
    })
  }, [openSession, selectedPeer])

  const openManualSession = useCallback(() => {
    setManualError(null)
    const host = manualHost.trim()
    if (!host) {
      setManualError('Host is required.')
      return
    }
    if (manualAuth === 'password' && !manualPassword) {
      setManualError('Password is required for password auth.')
      return
    }
    openSession(`${manualUser}@${host}`, {
      host,
      port: manualPort,
      username: manualUser || DEFAULT_USER,
      auth: manualAuth,
      password: manualAuth === 'password' ? manualPassword : undefined,
      privateKey: manualAuth === 'publickey' && manualPrivateKey.trim() ? manualPrivateKey : undefined,
      knownHosts: manualKnownHosts,
      keepaliveS: manualKeepalive,
      connectTimeoutS: manualTimeout,
      idleTimeoutS: manualIdle,
    })
  }, [
    manualAuth,
    manualHost,
    manualIdle,
    manualKeepalive,
    manualKnownHosts,
    manualPassword,
    manualPort,
    manualPrivateKey,
    manualTimeout,
    manualUser,
    openSession,
  ])

  const closeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id)
      setActiveIndex((idx) => Math.min(idx, Math.max(0, filtered.length - 1)))
      return filtered
    })
  }, [])

  const updateStatus = useCallback((id: string, status: XTermStatus) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)))
  }, [])

  const peerItems = useMemo(
    () =>
      peers.map((p) => ({
        id: p.node_id,
        label: peerLabel(p),
        peer: p,
      })),
    [peers],
  )

  return (
    <div className="web-ssh-tab" role="region" aria-label="Web SSH">
      <header className="web-ssh-tab__header">
        <Stack gap={4}>
          <div className="web-ssh-tab__peer-row">
            <Dropdown
              id="web-ssh-peer"
              titleText="MAP2 peer"
              label="Select a discovered peer"
              items={peerItems}
              selectedItem={peerItems.find((i) => i.id === selectedPeerId) ?? null}
              itemToString={(i) => (i ? i.label : '')}
              onChange={({ selectedItem }) => {
                if (selectedItem) setSelectedPeerId(selectedItem.id)
              }}
              disabled={peerItems.length === 0}
              size="md"
            />
            <Button
              kind="tertiary"
              size="md"
              renderIcon={Renew}
              onClick={loadPeers}
              disabled={peerLoading}
            >
              Refresh
            </Button>
            <Button
              kind="primary"
              size="md"
              renderIcon={Add}
              onClick={openPeerSession}
              disabled={!selectedPeer}
            >
              Open session
            </Button>
            {peerLoading && <InlineLoading description="Loading peers…" />}
          </div>
          {peerError && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Could not load peers"
              subtitle={peerError}
              hideCloseButton
            />
          )}
          {selectedPeer && (
            <div className="web-ssh-tab__peer-meta">
              <Tag type="cool-gray">{selectedPeer.node_id}</Tag>
              {selectedPeer.node_mode && <Tag type="blue">{selectedPeer.node_mode}</Tag>}
              {selectedPeer.ssh_trusted ? (
                <Tag type="green">SSH trusted</Tag>
              ) : (
                <Tag type="warm-gray">SSH trust pending</Tag>
              )}
              {selectedPeer.is_online === false && <Tag type="red">offline</Tag>}
            </div>
          )}
        </Stack>
      </header>

      <Accordion align="start" className="web-ssh-tab__advanced">
        <AccordionItem title="Advanced — manual host / non-MAP2 target">
          <Stack gap={4}>
            <div className="web-ssh-tab__form-grid">
              <TextInput
                id="ssh-host"
                labelText="Host / IP"
                value={manualHost}
                onChange={(e) => setManualHost(e.target.value)}
                placeholder="10.0.0.50"
              />
              <NumberInput
                id="ssh-port"
                label="Port"
                min={1}
                max={65535}
                value={manualPort}
                onChange={(_e, { value }) =>
                  setManualPort(typeof value === 'number' ? value : Number(value) || SSH_PORT)
                }
              />
              <TextInput
                id="ssh-user"
                labelText="Username"
                value={manualUser}
                onChange={(e) => setManualUser(e.target.value)}
              />
              <Select
                id="ssh-auth"
                labelText="Authentication"
                value={manualAuth}
                onChange={(e) => setManualAuth(e.target.value as 'publickey' | 'password')}
              >
                <SelectItem value="publickey" text="Public key" />
                <SelectItem value="password" text="Password" />
              </Select>
              <Select
                id="ssh-known-hosts"
                labelText="Known hosts policy"
                value={manualKnownHosts}
                onChange={(e) =>
                  setManualKnownHosts(e.target.value as 'accept-new' | 'strict' | 'auto-add')
                }
              >
                <SelectItem value="accept-new" text="Accept new (TOFU)" />
                <SelectItem value="strict" text="Strict" />
                <SelectItem value="auto-add" text="Auto-add" />
              </Select>
              <NumberInput
                id="ssh-keepalive"
                label="Keepalive (s)"
                min={0}
                max={600}
                value={manualKeepalive}
                onChange={(_e, { value }) =>
                  setManualKeepalive(typeof value === 'number' ? value : Number(value) || 30)
                }
              />
              <NumberInput
                id="ssh-timeout"
                label="Connect timeout (s)"
                min={1}
                max={120}
                value={manualTimeout}
                onChange={(_e, { value }) =>
                  setManualTimeout(typeof value === 'number' ? value : Number(value) || 10)
                }
              />
              <NumberInput
                id="ssh-idle"
                label="Idle timeout (s)"
                min={60}
                max={86400}
                value={manualIdle}
                onChange={(_e, { value }) =>
                  setManualIdle(typeof value === 'number' ? value : Number(value) || 900)
                }
              />
            </div>
            {manualAuth === 'password' && (
              <PasswordInput
                id="ssh-password"
                labelText="Password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
              />
            )}
            {manualAuth === 'publickey' && (
              <TextArea
                id="ssh-private-key"
                labelText="Private key (PEM, optional — uses agent/default keys if blank)"
                rows={4}
                value={manualPrivateKey}
                onChange={(e) => setManualPrivateKey(e.target.value)}
              />
            )}
            {manualError && (
              <InlineNotification
                kind="error"
                lowContrast
                title="Cannot open session"
                subtitle={manualError}
                hideCloseButton
              />
            )}
            <div>
              <Button kind="primary" renderIcon={Add} onClick={openManualSession}>
                Open manual session
              </Button>
            </div>
          </Stack>
        </AccordionItem>
      </Accordion>

      <div className="web-ssh-tab__sessions">
        {sessions.length === 0 ? (
          <div className="web-ssh-tab__empty">
            <p>No active SSH sessions. Select a peer or use Advanced to connect.</p>
          </div>
        ) : (
          <Tabs
            selectedIndex={Math.min(activeIndex, sessions.length - 1)}
            onChange={({ selectedIndex }) => setActiveIndex(selectedIndex)}
          >
            <TabList aria-label="SSH sessions" contained>
              {sessions.map((s) => (
                <Tab key={s.id}>
                  {s.label}
                  {s.status.type === 'error' && ' ⚠'}
                  {s.status.type === 'closed' && ' •'}
                </Tab>
              ))}
            </TabList>
            <TabPanels>
              {sessions.map((s) => (
                <TabPanel key={s.id}>
                  <div className="web-ssh-tab__session">
                    <div className="web-ssh-tab__session-controls">
                      <Tag
                        type={
                          s.status.type === 'open'
                            ? 'green'
                            : s.status.type === 'error'
                              ? 'red'
                              : s.status.type === 'closed'
                                ? 'warm-gray'
                                : 'blue'
                        }
                      >
                        {s.status.type}
                      </Tag>
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        renderIcon={Close}
                        onClick={() => closeSession(s.id)}
                      >
                        Close
                      </Button>
                    </div>
                    <XTermTerminal
                      connection={s.connection}
                      onStatusChange={(status) => updateStatus(s.id, status)}
                      onClose={() => updateStatus(s.id, { type: 'closed' })}
                    />
                  </div>
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        )}
      </div>
    </div>
  )
}

export default WebSshTab
