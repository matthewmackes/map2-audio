/**
 * T2503 Set 10 — Sessions sub-area page.
 *
 * Wraps Set 5's daw.project.* verbs (new / load / save). The active
 * project name is reflected in the shell status bar via
 * useDawProjectStore.active_project. Set 7+ adds a project picker
 * grid backed by the engine-side ProjectListService.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Button,
  InlineNotification,
  Layer,
  Stack,
  Tag,
  TextInput,
} from '@carbon/react'
import { DocumentBlank, Folder, Save } from '@carbon/icons-react'

import { dawApi } from '../../../map2/clients/daw'
import { useDawProjectStore } from '../../stores/dawProjectStore'

export function MultiTrackSessionsPage() {
  const activeProject = useDawProjectStore((s) => s.active_project)
  const setActiveProject = useDawProjectStore((s) => s.setActiveProject)
  const reset = useDawProjectStore((s) => s.reset)

  const [pendingNewName, setPendingNewName] = useState('untitled')
  const [pendingLoadPath, setPendingLoadPath] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const newMutation = useMutation({
    mutationFn: (name: string) => dawApi.newProject(name),
    onSuccess: (_data, name) => {
      reset()
      setActiveProject(name)
      setNotice({ kind: 'success', text: `Created project "${name}".` })
    },
    onError: (err) =>
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Create failed.' }),
  })
  const loadMutation = useMutation({
    mutationFn: (path: string) => dawApi.loadProject(path),
    onSuccess: (_data, path) => {
      setActiveProject(path)
      setNotice({ kind: 'success', text: `Loaded ${path}. Project tree will hydrate from the engine WebSocket.` })
    },
    onError: (err) =>
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Load failed.' }),
  })
  const saveMutation = useMutation({
    mutationFn: () => dawApi.saveProject(),
    onSuccess: () => setNotice({ kind: 'success', text: 'Saved.' }),
    onError: (err) =>
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Save failed.' }),
  })

  return (
    <Stack gap={6}>
      <Layer>
        <div style={{ padding: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Active session</h2>
            <Tag size="sm" type={activeProject ? 'green' : 'warm-gray'}>
              {activeProject ?? 'untitled'}
            </Tag>
          </header>
          <p style={{ margin: 0, opacity: 0.75, fontSize: '0.85rem' }}>
            Projects live engine-side under <code>~/.map2/daw/&lt;name&gt;/project.json</code>.
            Save writes atomically (Set 5: <code>.json.tmp</code> + fsync + rename). Load
            rebuilds the in-memory graph; sub-area state hydrates from the WebSocket
            stream.
          </p>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>New project</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              id="multitrack-new-project-name"
              labelText="Project name"
              placeholder="untitled"
              value={pendingNewName}
              onChange={(e) => setPendingNewName(e.target.value)}
              data-testid="daw-new-project-name"
            />
            <Button
              kind="primary"
              renderIcon={DocumentBlank}
              onClick={() => newMutation.mutate(pendingNewName)}
              data-testid="daw-new-project"
            >
              Create
            </Button>
          </div>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Load project</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              id="multitrack-load-project-path"
              labelText="Project name or path"
              placeholder="my-rig"
              value={pendingLoadPath}
              onChange={(e) => setPendingLoadPath(e.target.value)}
              data-testid="daw-load-project-path"
            />
            <Button
              kind="secondary"
              renderIcon={Folder}
              onClick={() => loadMutation.mutate(pendingLoadPath)}
              data-testid="daw-load-project"
            >
              Load
            </Button>
          </div>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Save</h2>
          <Button
            kind="primary"
            renderIcon={Save}
            onClick={() => saveMutation.mutate()}
            disabled={!activeProject}
            data-testid="daw-save-project"
          >
            Save active project
          </Button>
        </div>
      </Layer>

      {notice ? (
        <InlineNotification
          kind={notice.kind === 'success' ? 'success' : 'error'}
          lowContrast
          title={notice.kind === 'success' ? 'OK' : 'Failed'}
          subtitle={notice.text}
          onCloseButtonClick={() => setNotice(null)}
        />
      ) : null}
    </Stack>
  )
}

export default MultiTrackSessionsPage
