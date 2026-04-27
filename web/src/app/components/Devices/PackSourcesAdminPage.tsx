// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// PackSourcesAdminPage — T2459-G9. Q18 implementation.
// Lists every shipped/imported/user pack source; runs the
// sync_mixxx_imports.py script as a subprocess and streams output to
// a Carbon CodeSnippet; surfaces IMPORT_CHECKSUMS.txt drift inline.

import * as React from 'react'
import {
  Button,
  CodeSnippet,
  InlineNotification,
  Loading,
  Tag,
  TextInput,
  StructuredListWrapper,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
} from '@carbon/react'
import { Link as RouterLink } from 'react-router-dom'

import { usePackSources, useMixxxChecksumStatus } from './hooks/useDeviceProfiles'
import { syncMixxxStreamUrl } from '../../../map2/clients/devices'

import './PackSourcesAdminPage.css'

const SOURCE_TONE: Record<string, string> = {
  shipped: 'green',
  user: 'cyan',
  imported: 'magenta',
}

interface SyncRunner {
  log: string[]
  exitCode: number | null
  running: boolean
  error: string | null
}

const INITIAL_RUNNER: SyncRunner = { log: [], exitCode: null, running: false, error: null }

export function PackSourcesAdminPage(): React.JSX.Element {
  const packsQuery = usePackSources()
  const checksumsQuery = useMixxxChecksumStatus()

  const [clonePath, setClonePath] = React.useState('')
  const [checksumOnly, setChecksumOnly] = React.useState(false)
  const [runner, setRunner] = React.useState<SyncRunner>(INITIAL_RUNNER)

  const runSync = React.useCallback(async () => {
    if (!clonePath) return
    setRunner({ log: [], exitCode: null, running: true, error: null })
    try {
      const res = await fetch(syncMixxxStreamUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mixxx_clone_path: clonePath, checksum_only: checksumOnly }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: { detail: res.statusText } }))
        const detail = (body as { detail?: { detail?: string } }).detail?.detail ?? res.statusText
        setRunner((r) => ({ ...r, running: false, error: detail }))
        return
      }
      const reader = res.body?.getReader()
      if (!reader) {
        setRunner((r) => ({ ...r, running: false, error: 'No stream body' }))
        return
      }
      const dec = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          for (const line of frame.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                const payload = JSON.parse(line.slice(5).trim())
                if (typeof payload.line === 'string') {
                  setRunner((r) => ({ ...r, log: [...r.log, String(payload.line)] }))
                } else if (typeof payload.exit_code === 'number') {
                  setRunner((r) => ({ ...r, running: false, exitCode: payload.exit_code }))
                  // Refresh state queries.
                  packsQuery.refetch()
                  checksumsQuery.refetch()
                } else if (typeof payload.cmd !== 'undefined') {
                  setRunner((r) => ({ ...r, log: [...r.log, `$ ${(payload.cmd as string[]).join(' ')}`] }))
                }
              } catch {
                // ignore malformed
              }
            }
          }
        }
      }
      setRunner((r) => ({ ...r, running: false }))
    } catch (err) {
      setRunner({
        log: [], exitCode: null, running: false,
        error: (err as Error).message ?? 'sync failed',
      })
    }
  }, [clonePath, checksumOnly, packsQuery, checksumsQuery])

  const drift = checksumsQuery.data?.drift ?? []
  const hasDrift = drift.length > 0

  return (
    <div className="pack-sources-admin">
      <header className="pack-sources-admin__head">
        <p className="pack-sources-admin__crumb">
          <RouterLink to="/devices/store-v2">Hardware Store</RouterLink> / Pack Sources
        </p>
        <h1>Pack Sources</h1>
        <p className="pack-sources-admin__sub">
          Inventory of shipped, user, and imported packs · run <code>scripts/sync_mixxx_imports.py</code> · IMPORT_CHECKSUMS.txt integrity gate
        </p>
      </header>

      <section className="pack-sources-admin__section">
        <h2>Pack inventory</h2>
        {packsQuery.isLoading ? (
          <Loading withOverlay={false} small description="Loading packs…" />
        ) : (
          <StructuredListWrapper aria-label="Pack inventory">
            <StructuredListBody>
              <StructuredListRow head>
                <StructuredListCell head>Pack</StructuredListCell>
                <StructuredListCell head>Source</StructuredListCell>
                <StructuredListCell head>Vendor</StructuredListCell>
                <StructuredListCell head>Models</StructuredListCell>
                <StructuredListCell head>State</StructuredListCell>
                <StructuredListCell head>Path</StructuredListCell>
              </StructuredListRow>
              {(packsQuery.data?.sources ?? []).map((row) => (
                <StructuredListRow key={row.pack_id}>
                  <StructuredListCell><code>{row.pack_id}</code></StructuredListCell>
                  <StructuredListCell>
                    <Tag size="sm" type={SOURCE_TONE[row.source] as never}>{row.source}</Tag>
                  </StructuredListCell>
                  <StructuredListCell>{row.vendor}</StructuredListCell>
                  <StructuredListCell>{row.model_count}</StructuredListCell>
                  <StructuredListCell>
                    {row.is_degraded ? (
                      <Tag size="sm" type="warm-gray">degraded ({row.degraded_files.length})</Tag>
                    ) : (
                      <Tag size="sm" type="cool-gray">ok</Tag>
                    )}
                  </StructuredListCell>
                  <StructuredListCell><code>{row.path}</code></StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        )}
      </section>

      <section className="pack-sources-admin__section">
        <h2>IMPORT_CHECKSUMS.txt integrity</h2>
        {checksumsQuery.isLoading ? (
          <Loading withOverlay={false} small description="Checking integrity…" />
        ) : !checksumsQuery.data?.present ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="No imported corpus yet"
            subtitle="Run sync against a Mixxx clone to populate device-packs/_mixx-imports/."
          />
        ) : hasDrift ? (
          <>
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Imported corpus drift detected"
              subtitle={`${drift.length} file(s) differ from IMPORT_CHECKSUMS.txt — restore from upstream or re-run sync.`}
            />
            <StructuredListWrapper aria-label="Checksum drift">
              <StructuredListBody>
                <StructuredListRow head>
                  <StructuredListCell head>Path</StructuredListCell>
                  <StructuredListCell head>Kind</StructuredListCell>
                </StructuredListRow>
                {drift.slice(0, 50).map((row) => (
                  <StructuredListRow key={row.path}>
                    <StructuredListCell><code>{row.path}</code></StructuredListCell>
                    <StructuredListCell>
                      <Tag
                        size="sm"
                        type={
                          row.kind === 'modified' ? 'red'
                          : row.kind === 'missing' ? 'warm-gray'
                          : 'cool-gray'
                        }
                      >
                        {row.kind}
                      </Tag>
                    </StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </>
        ) : (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title={`${checksumsQuery.data.files_checked} files match IMPORT_CHECKSUMS.txt`}
            subtitle="Imported corpus is clean."
          />
        )}
      </section>

      <section className="pack-sources-admin__section">
        <h2>Run sync_mixxx_imports.py</h2>
        <p className="pack-sources-admin__hint">
          Provide a path to a local Mixxx git clone. The script copies <code>res/controllers/</code>,
          updates <code>MANIFEST.yaml</code>, and regenerates <code>IMPORT_CHECKSUMS.txt</code>.
          It does not commit — review the diff and use the <code>update</code> shorthand.
        </p>
        <div className="pack-sources-admin__form">
          <TextInput
            id="mixxx-clone-path"
            labelText="Mixxx clone path"
            placeholder="/home/operator/src/mixxx"
            value={clonePath}
            onChange={(e) => setClonePath(e.target.value)}
            disabled={runner.running}
          />
          <label className="pack-sources-admin__checkbox">
            <input
              type="checkbox"
              checked={checksumOnly}
              onChange={(e) => setChecksumOnly(e.target.checked)}
              disabled={runner.running}
            />
            checksum-only (no copy)
          </label>
          <Button
            kind="primary"
            disabled={!clonePath || runner.running}
            onClick={runSync}
          >
            {runner.running ? 'Running…' : 'Run sync'}
          </Button>
        </div>
        {runner.error ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Sync failed"
            subtitle={runner.error}
          />
        ) : null}
        {runner.log.length > 0 ? (
          <CodeSnippet
            type="multi"
            feedback="Copied"
            aria-label="sync_mixxx_imports.py output"
          >
            {runner.log.join('\n')}
          </CodeSnippet>
        ) : null}
        {runner.exitCode !== null ? (
          <Tag
            size="md"
            type={runner.exitCode === 0 ? 'green' : 'red'}
          >
            Exit {runner.exitCode}
          </Tag>
        ) : null}
      </section>
    </div>
  )
}
