import {
  Accordion,
  AccordionItem,
  Button,
  DataTable,
  InlineLoading,
  InlineNotification,
  Modal,
  PasswordInput,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from '@carbon/react'
import { Add, Renew, TrashCan, View } from '@carbon/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import './WebhooksSection.css'

interface WebhookFilterSpec {
  kinds: string[]
  severities: string[]
  nodes: string[]
  min_priority: number
}

interface WebhookTarget {
  id: string
  url: string
  filter: WebhookFilterSpec
  enabled: boolean
  created_at: string
  last_attempt_at: string | null
  last_status: string | null
  has_secret: boolean
}

interface DeliveryAttempt {
  id: string
  target_id: string
  event_id: string
  attempt: number
  status_code: number | null
  ok: boolean
  error: string | null
  duration_ms: number
  sent_at: string
}

const DELIVERY_HEADERS = [
  { key: 'sent_at', header: 'When' },
  { key: 'event_id', header: 'Event' },
  { key: 'attempt', header: 'Attempt' },
  { key: 'status_code', header: 'Status' },
  { key: 'duration_ms', header: 'Latency' },
  { key: 'error', header: 'Error' },
]

const TARGET_HEADERS = [
  { key: 'url', header: 'URL' },
  { key: 'filter_summary', header: 'Filter' },
  { key: 'enabled', header: 'Enabled' },
  { key: 'last_status', header: 'Last Status' },
  { key: 'actions', header: 'Actions' },
]

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleTimeString([], { hour12: false })} ${d.toLocaleDateString()}`
}

function filterSummary(f: WebhookFilterSpec): string {
  const parts: string[] = []
  if (f.kinds.length > 0) parts.push(`kinds:${f.kinds.length}`)
  if (f.severities.length > 0) parts.push(`sev:${f.severities.join(',')}`)
  if (f.nodes.length > 0) parts.push(`nodes:${f.nodes.length}`)
  if (f.min_priority > 0) parts.push(`p≥${f.min_priority}`)
  return parts.length > 0 ? parts.join(' · ') : 'any'
}

export function WebhooksSection() {
  const [targets, setTargets] = useState<WebhookTarget[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [registerOpen, setRegisterOpen] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [newKinds, setNewKinds] = useState('')
  const [newSeverities, setNewSeverities] = useState('')
  const [newMinPriority, setNewMinPriority] = useState('0')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)

  const [viewTarget, setViewTarget] = useState<WebhookTarget | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryAttempt[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/webhooks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { targets?: WebhookTarget[] }
      setTargets(Array.isArray(body.targets) ? body.targets : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const resetRegisterForm = useCallback(() => {
    setNewUrl('')
    setNewSecret('')
    setNewKinds('')
    setNewSeverities('')
    setNewMinPriority('0')
    setRegisterError(null)
  }, [])

  const submitRegister = useCallback(async () => {
    const url = newUrl.trim()
    if (!url) {
      setRegisterError('URL is required')
      return
    }
    const kinds = newKinds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const severities = newSeverities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const minPriority = Math.max(0, Math.min(1, Number(newMinPriority) || 0))
    setRegistering(true)
    setRegisterError(null)
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret: newSecret.trim() || null,
          enabled: true,
          filter: { kinds, severities, nodes: [], min_priority: minPriority },
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail || `HTTP ${res.status}`)
      }
      setRegisterOpen(false)
      resetRegisterForm()
      refresh()
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : 'registration failed')
    } finally {
      setRegistering(false)
    }
  }, [newKinds, newMinPriority, newSecret, newSeverities, newUrl, refresh, resetRegisterForm])

  const deleteTarget = useCallback(
    async (target: WebhookTarget) => {
      if (!window.confirm(`Delete webhook for ${target.url}?`)) return
      try {
        const res = await fetch(`/api/webhooks/${encodeURIComponent(target.id)}`, {
          method: 'DELETE',
        })
        if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'delete failed')
      }
    },
    [refresh],
  )

  const openDeliveries = useCallback(async (target: WebhookTarget) => {
    setViewTarget(target)
    setLoadingDeliveries(true)
    setDeliveries([])
    try {
      const res = await fetch(
        `/api/webhooks/${encodeURIComponent(target.id)}/deliveries?limit=100`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { deliveries?: DeliveryAttempt[] }
      setDeliveries(Array.isArray(body.deliveries) ? body.deliveries : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load deliveries')
    } finally {
      setLoadingDeliveries(false)
    }
  }, [])

  const targetRows = useMemo(
    () =>
      targets.map((t) => ({
        id: t.id,
        url: t.url,
        filter_summary: filterSummary(t.filter),
        enabled: t.enabled ? 'yes' : 'no',
        last_status: t.last_status ?? '—',
      })),
    [targets],
  )

  const deliveryRows = useMemo(
    () =>
      deliveries.map((d) => ({
        id: d.id,
        sent_at: formatWhen(d.sent_at),
        event_id: d.event_id.slice(0, 8),
        attempt: String(d.attempt),
        status_code: d.ok ? String(d.status_code ?? 'ok') : `✗ ${d.status_code ?? ''}`,
        duration_ms: `${d.duration_ms}ms`,
        error: d.error ?? '',
      })),
    [deliveries],
  )

  return (
    <div className="webhooks-section">
      <Accordion>
        <AccordionItem title="Webhook Targets" open>
          <Stack gap={4}>
            <div className="webhooks-section__toolbar">
              <Tag type="cool-gray">{targets.length} registered</Tag>
              <Button
                kind="tertiary"
                size="sm"
                renderIcon={Renew}
                onClick={refresh}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                kind="primary"
                size="sm"
                renderIcon={Add}
                onClick={() => setRegisterOpen(true)}
              >
                Register target
              </Button>
              {loading && <InlineLoading description="Loading…" />}
            </div>
            {error && (
              <InlineNotification
                kind="error"
                lowContrast
                title="Webhook error"
                subtitle={error}
                hideCloseButton
              />
            )}
            <DataTable rows={targetRows} headers={TARGET_HEADERS}>
              {({ rows: dtRows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                <TableContainer>
                  <Table {...getTableProps()} size="sm" useZebraStyles>
                    <TableHead>
                      <TableRow>
                        {headers.map((h) => (
                          <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                            {h.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dtRows.map((row) => {
                        const target = targets.find((t) => t.id === row.id)
                        if (!target) return null
                        return (
                          <TableRow key={row.id} {...getRowProps({ row })}>
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'enabled') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Tag type={target.enabled ? 'green' : 'warm-gray'}>
                                      {target.enabled ? 'yes' : 'no'}
                                    </Tag>
                                  </TableCell>
                                )
                              }
                              if (cell.info.header === 'actions') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      renderIcon={View}
                                      iconDescription="View deliveries"
                                      hasIconOnly
                                      onClick={() => openDeliveries(target)}
                                    />
                                    <Button
                                      kind="danger--ghost"
                                      size="sm"
                                      renderIcon={TrashCan}
                                      iconDescription="Delete"
                                      hasIconOnly
                                      onClick={() => deleteTarget(target)}
                                    />
                                  </TableCell>
                                )
                              }
                              return (
                                <TableCell key={cell.id}>{String(cell.value ?? '')}</TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          </Stack>
        </AccordionItem>
      </Accordion>

      <Modal
        open={registerOpen}
        modalHeading="Register webhook target"
        primaryButtonText={registering ? 'Registering…' : 'Register'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={registering || newUrl.trim().length === 0}
        onRequestClose={() => {
          setRegisterOpen(false)
          resetRegisterForm()
        }}
        onRequestSubmit={submitRegister}
      >
        <Stack gap={4}>
          <TextInput
            id="webhook-url"
            labelText="URL"
            placeholder="https://example.com/hook"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <PasswordInput
            id="webhook-secret"
            labelText="Secret (optional, HMAC-SHA256)"
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
          />
          <TextInput
            id="webhook-kinds"
            labelText="Filter kinds (comma-separated, empty = any)"
            placeholder="system.cpu.critical, node.online"
            value={newKinds}
            onChange={(e) => setNewKinds(e.target.value)}
          />
          <TextInput
            id="webhook-severities"
            labelText="Filter severities (comma-separated, empty = any)"
            placeholder="critical, error"
            value={newSeverities}
            onChange={(e) => setNewSeverities(e.target.value)}
          />
          <TextInput
            id="webhook-min-priority"
            labelText="Min priority (0–1)"
            value={newMinPriority}
            onChange={(e) => setNewMinPriority(e.target.value)}
          />
          {registerError && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Registration failed"
              subtitle={registerError}
              hideCloseButton
            />
          )}
        </Stack>
      </Modal>

      <Modal
        open={viewTarget !== null}
        modalHeading={viewTarget ? `Deliveries — ${viewTarget.url}` : 'Deliveries'}
        passiveModal
        size="lg"
        onRequestClose={() => {
          setViewTarget(null)
          setDeliveries([])
        }}
      >
        {loadingDeliveries ? (
          <InlineLoading description="Loading deliveries…" />
        ) : (
          <DataTable rows={deliveryRows} headers={DELIVERY_HEADERS}>
            {({ rows: dtRows, headers, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer>
                <Table {...getTableProps()} size="sm" useZebraStyles>
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dtRows.map((row) => (
                      <TableRow key={row.id} {...getRowProps({ row })}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{String(cell.value ?? '')}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Modal>
    </div>
  )
}

export default WebhooksSection
