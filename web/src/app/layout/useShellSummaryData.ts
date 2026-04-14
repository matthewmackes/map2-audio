import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { useAppShellPresentation } from './useAppShellPresentation'
import { useLauncherInterfaceSummary } from './useLauncherInterfaceSummary'

type UseShellSummaryDataOptions = {
  pathname: string
  navOpen: boolean
  pushConfirmationNodeId?: string | null
  pushConfirmationRefetchInterval?: number | false
}

export type ShellSummaryData = {
  hostInfo: {
    hostname?: string | null
    kernel_version?: string | null
    os_version?: string | null
  } | null
  platformStatus: ReturnType<typeof useHomePlatformStatus>
  launcherInterfaceSummary: ReturnType<typeof useLauncherInterfaceSummary>
  launcherSummaryItems: string[]
  platformStatusLabels: string[]
  pendingPushConfirmation: Awaited<ReturnType<typeof usePushConfirmation>>['data'] extends { pending_confirmation?: infer T } ? T | null : null
}

export function useShellSummaryData({
  pathname,
  navOpen,
  pushConfirmationNodeId,
  pushConfirmationRefetchInterval = 15_000,
}: UseShellSummaryDataOptions) {
  const { data: hostInfo } = useHostMachineInfo()
  const platformStatus = useHomePlatformStatus()
  const launcherInterfaceSummary = useLauncherInterfaceSummary(navOpen)
  const pendingPushConfirmationQuery = usePushConfirmation(pushConfirmationNodeId, {
    refetchInterval: pushConfirmationRefetchInterval,
  })
  const presentation = useAppShellPresentation({
    hostInfo: hostInfo ?? null,
    pathname,
    platformStatus,
  })

  return {
    hostInfo: hostInfo ?? null,
    platformStatus,
    launcherInterfaceSummary,
    launcherSummaryItems: presentation.launcherSummaryItems,
    platformStatusLabels: presentation.platformStatusLabels,
    pendingPushConfirmation: pendingPushConfirmationQuery.data?.pending_confirmation ?? null,
  } satisfies ShellSummaryData
}
