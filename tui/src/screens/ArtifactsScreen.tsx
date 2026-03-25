import React, { useCallback } from 'react'
import { Box, Text } from 'ink'
import { backupApi, snapshotsApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { DataTable } from '../components/DataTable'
import { Spinner } from '../components/Spinner'
import { usePollingResource } from '../hooks/usePollingResource'

export function ArtifactsScreen() {
  const load = useCallback(async () => {
    const [snapshots, backups] = await Promise.all([snapshotsApi.list(), backupApi.list()])
    return { snapshots, backups }
  }, [])

  const { data, error, loading } = usePollingResource(load, 5000)

  if (loading && !data) {
    return <Spinner label="Loading artifacts" />
  }
  if (error) {
    return <BoxPanel title="Artifacts"><Text color="red">{error}</Text></BoxPanel>
  }
  if (!data) {
    return null
  }

  const snapshotRows = data.snapshots.snapshots.slice(0, 8).map((snapshot) => [
    snapshot.id,
    snapshot.name,
    snapshot.category || 'uncategorized',
  ])
  const backupRows = (data.backups.backups ?? []).slice(0, 8).map((backup) => [
    backup.backup_id,
    backup.created_at || 'n/a',
    backup.description || '',
  ])

  return (
    <Box flexDirection="column">
      <BoxPanel title="Snapshots">
        {snapshotRows.length ? <DataTable columns={['ID', 'Name', 'Category']} rows={snapshotRows} /> : <Text color="gray">No snapshots available.</Text>}
      </BoxPanel>
      <BoxPanel title="Backups">
        {backupRows.length ? <DataTable columns={['ID', 'Created', 'Description']} rows={backupRows} /> : <Text color="gray">No backups recorded.</Text>}
      </BoxPanel>
    </Box>
  )
}
