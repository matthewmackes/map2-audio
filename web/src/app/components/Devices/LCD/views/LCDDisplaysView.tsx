import React, { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToasts } from '../../../Toasts'
import { lcdApi } from '../../../../../map2/lcd'
import type { LCDInputAction } from '../../../../../map2/lcd'
import {
  LCDSimulator,
  InputController,
  CustomMessageComposer,
  EventTriggers,
} from '../LCDView'

export function LCDDisplaysView() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const statusQuery = useQuery({
    queryKey: ['lcd', 'status'],
    queryFn: lcdApi.getStatus,
    refetchInterval: 7000,
    retry: 1,
    staleTime: 5000,
  })
  const simulationQuery = useQuery({
    queryKey: ['lcd', 'simulation'],
    queryFn: lcdApi.getDualSimulation,
    refetchInterval: 7000,
    retry: 1,
    staleTime: 5000,
  })

  const setPageMutation = useMutation({
    mutationFn: ({ lcdId, page }: { lcdId: number; page: string }) => lcdApi.setLCDPage(lcdId, page),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd'] })
      pushToast('Page changed', 'success')
    },
    onError: () => pushToast('Failed to change page', 'error'),
  })
  const inputMutation = useMutation({
    mutationFn: lcdApi.simulateInput,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] })
      pushToast(`Input: ${data.action}`, 'info')
    },
    onError: () => pushToast('Failed to simulate input', 'error'),
  })
  const messageMutation = useMutation({
    mutationFn: ({
      lcdId,
      line1,
      line2,
      duration,
    }: { lcdId: number; line1: string; line2: string; duration: number }) =>
      lcdApi.displayMessage(lcdId, line1, line2, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] })
      pushToast('Message sent', 'success')
    },
    onError: () => pushToast('Failed to send message', 'error'),
  })

  const handlePageChange = useCallback(
    (lcdId: number, page: string) => {
      setPageMutation.mutate({ lcdId, page })
    },
    [setPageMutation],
  )
  const handleInput = useCallback(
    (action: LCDInputAction) => {
      inputMutation.mutate(action)
    },
    [inputMutation],
  )
  const handleSendMessage = useCallback(
    (lcdId: number, line1: string, line2: string, duration: number) => {
      messageMutation.mutate({ lcdId, line1, line2, duration })
    },
    [messageMutation],
  )
  const handleEventTrigger = useCallback(
    (eventType: string, eventData: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        chain_loaded: `Chain: ${eventData.chain_name}`,
        snapshot_loaded: `Snapshot: ${eventData.snapshot_name}`,
        nam_loaded: `NAM: ${eventData.model_name}`,
        ir_loaded: `IR: ${eventData.ir_name}`,
        xrun: `XRun #${eventData.count}`,
        cpu_high: `CPU: ${eventData.load}%`,
        midi_cc: `CC${eventData.cc}: ${eventData.value}`,
        bypass: `Bypassed: ${eventData.plugin}`,
      }
      messageMutation.mutate({
        lcdId: -1,
        line1: messages[eventType] || eventType,
        line2: new Date().toLocaleTimeString(),
        duration: 3,
      })
      pushToast(`Triggered: ${eventType}`, 'info')
    },
    [messageMutation, pushToast],
  )

  const lcd1Lines = simulationQuery.data?.lcd_1?.lines || ['LCD 1', 'Waiting...']
  const lcd2Lines = simulationQuery.data?.lcd_2?.lines || ['LCD 2', 'Waiting...']
  const currentPage = statusQuery.data?.current_page || 'status'
  const isRunning = statusQuery.data?.running || false

  return (
    <div className="lcd-page">
      <div className="displays-tab">
        <div className="lcd-simulators-row">
          <LCDSimulator
            lcdId={0}
            lines={lcd1Lines}
            address={simulationQuery.data?.lcd_1?.address || '0x27'}
            currentPage={currentPage}
            onPageChange={(page) => handlePageChange(0, page)}
            connected={isRunning}
            isPolling
          />
          <LCDSimulator
            lcdId={1}
            lines={lcd2Lines}
            address={simulationQuery.data?.lcd_2?.address || '0x3F'}
            currentPage={currentPage}
            onPageChange={(page) => handlePageChange(1, page)}
            connected={isRunning}
            isPolling
          />
        </div>
        <div className="lcd-controls-row">
          <InputController onInput={handleInput} disabled={!isRunning} />
          <CustomMessageComposer onSend={handleSendMessage} />
          <EventTriggers onTrigger={handleEventTrigger} />
        </div>
      </div>
    </div>
  )
}
