import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { AudioLevels, AudioStatus, Chain } from '../../../web/src/map2/types'
import { audioApi, chainsApi } from '../../../web/src/map2/api'
import { BoxPanel } from '../components/BoxPanel'
import { Spinner } from '../components/Spinner'
import { VuMeter } from '../components/VuMeter'
import { oledPalette } from '../palette'
import { buildLivePluginSlots, formatBypassEvent, getActiveChain, type LivePluginSlot } from './signalChainsLive'
import { formatPercent, truncateLabel } from '../utils/formatters'

interface LiveHomeSnapshot {
  audioStatus: AudioStatus
  audioLevels: AudioLevels
  chains: Chain[]
}

type PendingLiveSlotMap = Record<number, {
  chainId: number
  pluginPosition: number
  bypassed: boolean
}>

function cloneChainSnapshot(snapshot: LiveHomeSnapshot): LiveHomeSnapshot {
  return {
    ...snapshot,
    chains: snapshot.chains.map((chain) => ({
      ...chain,
      plugins: chain.plugins.map((plugin) => ({ ...plugin })),
    })),
  }
}

function updateBypassState(snapshot: LiveHomeSnapshot, chainId: number, pluginPosition: number, bypassed: boolean): LiveHomeSnapshot {
  const next = cloneChainSnapshot(snapshot)
  const chain = next.chains.find((entry) => entry.id === chainId)
  const plugin = chain?.plugins.find((entry) => entry.position === pluginPosition)
  if (plugin) {
    plugin.bypassed = bypassed
  }
  return next
}

function applyPendingBypassStates(snapshot: LiveHomeSnapshot, pendingBySlot: PendingLiveSlotMap): LiveHomeSnapshot {
  return Object.values(pendingBySlot).reduce(
    (current, pending) => updateBypassState(current, pending.chainId, pending.pluginPosition, pending.bypassed),
    snapshot,
  )
}

export function HomeScreen({ enableLiveHotkeys = true }: { enableLiveHotkeys?: boolean }) {
  const [snapshot, setSnapshot] = useState<LiveHomeSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const [pendingBySlot, setPendingBySlot] = useState<PendingLiveSlotMap>({})
  const [flashSlot, setFlashSlot] = useState<number | null>(null)
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const appendEvent = useCallback((message: string) => {
    setEvents((current) => [message, ...current].slice(0, 2))
  }, [])

  const load = useCallback(async (): Promise<LiveHomeSnapshot> => {
    const [audioStatus, audioLevels, chains] = await Promise.all([
      audioApi.getStatus(),
      audioApi.getLevels(),
      chainsApi.list(),
    ])
    return {
      audioStatus,
      audioLevels,
      chains: chains.chains,
    }
  }, [])

  useEffect(() => {
    let active = true

    async function refresh(): Promise<void> {
      try {
        const next = await load()

        if (!active) {
          return
        }
        setSnapshot(applyPendingBypassStates(next, pendingBySlot))
        setError(null)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      }
    }

    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 1000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [load, pendingBySlot])

  useEffect(() => () => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  const activeChain = useMemo(() => getActiveChain(snapshot?.chains ?? []), [snapshot])
  const liveSlots = useMemo(() => buildLivePluginSlots(activeChain), [activeChain])
  const hiddenPluginCount = Math.max((activeChain?.plugins.length ?? 0) - liveSlots.length, 0)
  const eventStrip = useMemo(
    () => (
      events.length
        ? truncateLabel(events.join('  |  '), 70)
        : 'Ready. Press 1-8 to toggle bypass on the active chain.'
    ),
    [events],
  )

  const triggerSlotFlash = useCallback((slot: number) => {
    setFlashSlot(slot)
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current)
    }
    flashTimeoutRef.current = setTimeout(() => {
      setFlashSlot(null)
      flashTimeoutRef.current = null
    }, 1400)
  }, [])

  const toggleLiveSlot = useCallback(async (slotNumber: number) => {
    const slot = liveSlots[slotNumber - 1]
    const plugin = slot?.plugin
    if (!snapshot || !activeChain || !slot || !plugin) {
      appendEvent(`Slot ${slotNumber} is empty.`)
      return
    }
    if (pendingBySlot[slotNumber]) {
      return
    }

    const nextBypassed = !plugin.bypassed
    setPendingBySlot((current) => ({
      ...current,
      [slotNumber]: {
        chainId: activeChain.id,
        pluginPosition: plugin.position,
        bypassed: nextBypassed,
      },
    }))
    setSnapshot((current) => (current ? updateBypassState(current, activeChain.id, plugin.position, nextBypassed) : current))
    triggerSlotFlash(slotNumber)

    try {
      await chainsApi.togglePluginBypass(activeChain.id, plugin.uri, nextBypassed, plugin.position)
      appendEvent(formatBypassEvent(activeChain.name, slot, nextBypassed))
    } catch (toggleError) {
      setSnapshot((current) => (current ? updateBypassState(current, activeChain.id, plugin.position, plugin.bypassed) : current))
      appendEvent(
        `Toggle failed for ${slotNumber} ${truncateLabel(slot.primaryLabel, 18)}: ${toggleError instanceof Error ? toggleError.message : String(toggleError)}`,
      )
    } finally {
      setPendingBySlot((current) => {
        const next = { ...current }
        delete next[slotNumber]
        return next
      })
    }
  }, [activeChain, appendEvent, liveSlots, pendingBySlot, snapshot, triggerSlotFlash])

  useInput((input) => {
    const slotNumber = Number.parseInt(input, 10)
    if (!Number.isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= 8) {
      void toggleLiveSlot(slotNumber)
    }
  }, { isActive: enableLiveHotkeys })

  if (error && !snapshot) {
    return (
      <BoxPanel title="Signal Chains Live">
        <Text color={oledPalette.danger}>Failed to load live chain: {error}</Text>
      </BoxPanel>
    )
  }

  if (!snapshot) {
    return <Spinner label="Loading live chain" />
  }

  const renderSlot = (slot: LivePluginSlot): React.ReactNode => {
    const pending = pendingBySlot[slot.hotkey]
    const isPending = Boolean(pending)
    const isFlashing = flashSlot === slot.hotkey
    const bypassed = pending?.bypassed ?? slot.bypassed
    const stateLabel = isPending ? 'SWITCHING' : slot.plugin ? (bypassed ? 'BYPASSED' : 'LIVE') : 'EMPTY'
    const stateColor = isPending ? oledPalette.warning : slot.plugin ? (bypassed ? oledPalette.danger : oledPalette.success) : oledPalette.muted
    const slotColor = isFlashing ? oledPalette.focus : slot.plugin ? oledPalette.text : oledPalette.idle

    return (
      <Text key={`slot-${slot.hotkey}`}>
        <Text color={slotColor}>{isFlashing ? '▶' : ' '} {String(slot.hotkey).padStart(2, '0')}</Text>
        <Text color={stateColor}> [{stateLabel}] </Text>
        <Text color={slotColor}>{truncateLabel(slot.primaryLabel, 24)}</Text>
        <Text color={oledPalette.muted}> {truncateLabel(slot.secondaryLabel, 26)}</Text>
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      <BoxPanel title="Signal Chains Live">
        <Text>
          Active: <Text color={oledPalette.accent}>{truncateLabel(activeChain?.name ?? 'No active chain', 24)}</Text>
          <Text color={oledPalette.muted}>  |  {activeChain?.plugins.length ?? 0} plugins  |  Audio {snapshot.audioStatus.running ? 'up' : 'down'}  |  CPU {formatPercent(snapshot.audioStatus.cpu_load)}</Text>
        </Text>
        <Text color={oledPalette.muted}>Live rack: keys 1-8 toggle bypass instantly in chain order.</Text>
        {error ? <Text color={oledPalette.warning}>Live data is stale: {error}</Text> : null}
        {hiddenPluginCount > 0 ? (
          <Text color={oledPalette.warning}>
            Signal Chains Live supports 8 plugins max. Active chain has {activeChain?.plugins.length ?? 0}; trim {hiddenPluginCount} plugin{hiddenPluginCount === 1 ? '' : 's'} before live use.
          </Text>
        ) : null}
        {!activeChain?.plugins.length ? (
          <Text color={oledPalette.warning}>No plugins are loaded in the active chain yet.</Text>
        ) : null}
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={38}>
              <VuMeter label="In L" level={snapshot.audioLevels.input_left ?? 0} />
            </Box>
            <Box width={38} marginLeft={2}>
              <VuMeter label="In R" level={snapshot.audioLevels.input_right ?? 0} />
            </Box>
          </Box>
          <Box>
            <Box width={38}>
              <VuMeter label="Out L" level={snapshot.audioLevels.output_left ?? 0} />
            </Box>
            <Box width={38} marginLeft={2}>
              <VuMeter label="Out R" level={snapshot.audioLevels.output_right ?? 0} />
            </Box>
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {liveSlots.map(renderSlot)}
        </Box>
        <Text color={events.length ? oledPalette.text : oledPalette.muted}>Event: {eventStrip}</Text>
      </BoxPanel>
    </Box>
  )
}
