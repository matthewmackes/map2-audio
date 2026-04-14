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
  hostSummaryItems: string[]
  hostSummaryState: 'ready' | 'loading' | 'error'
  platformStatus: ReturnType<typeof useHomePlatformStatus>
  platformStatusItems: Array<ReturnType<typeof useHomePlatformStatus>[keyof ReturnType<typeof useHomePlatformStatus>]>
  launcherInterfaceSummary: ReturnType<typeof useLauncherInterfaceSummary>
  pendingPushConfirmation: Awaited<ReturnType<typeof usePushConfirmation>>['data'] extends { pending_confirmation?: infer T } ? T | null : null
}

export function useShellSummaryData({
  pathname,
  navOpen,
  pushConfirmationNodeId,
  pushConfirmationRefetchInterval = 15_000,
}: UseShellSummaryDataOptions) {
  const hostInfoQuery = useHostMachineInfo()
  const { data: hostInfo } = hostInfoQuery
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
  const hostSummaryState =
    hostInfoQuery.isError ? 'error' : hostInfoQuery.isLoading && !hostInfo ? 'loading' : 'ready'
  const hostSummaryItems =
    hostSummaryState === 'loading'
      ? ['Detecting OS version...', 'Detecting host name...']
      : hostSummaryState === 'error'
        ? ['Host OS unavailable', 'Host name unavailable']
        : presentation.launcherSummaryItems

  return {
    hostInfo: hostInfo ?? null,
    hostSummaryItems,
    hostSummaryState,
    platformStatus,
    launcherInterfaceSummary,
    platformStatusItems: [platformStatus.avb, platformStatus.avdecc, platformStatus.nodes],
    pendingPushConfirmation: pendingPushConfirmationQuery.data?.pending_confirmation ?? null,
  } satisfies ShellSummaryData
}
