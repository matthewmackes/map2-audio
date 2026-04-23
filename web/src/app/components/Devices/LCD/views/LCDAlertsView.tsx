import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity } from '@carbon/icons-react'
import { useToasts } from '../../../Toasts'
import { lcdApi } from '../../../../../map2/lcd'
import { AlertRouterConfig } from '../LCDView'

export function LCDAlertsView() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const alertConfigQuery = useQuery({
    queryKey: ['lcd', 'alertConfig'],
    queryFn: lcdApi.getAlertConfig,
  })
  const activeAlertsQuery = useQuery({
    queryKey: ['lcd', 'activeAlerts'],
    queryFn: lcdApi.getActiveAlerts,
    refetchInterval: 7000,
    retry: 1,
    staleTime: 5000,
  })

  const updateAlertConfigMutation = useMutation({
    mutationFn: lcdApi.updateAlertConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'alertConfig'] })
      pushToast('Alert config updated', 'success')
    },
    onError: () => pushToast('Failed to update config', 'error'),
  })

  const queueLength = activeAlertsQuery.data?.queue_length || 0

  return (
    <div className="lcd-page">
      <div className="alerts-tab">
        <AlertRouterConfig
          config={alertConfigQuery.data || null}
          onUpdate={(config) => updateAlertConfigMutation.mutate(config)}
        />

        {queueLength > 0 && (
          <div className="active-alerts-panel">
            <div className="alerts-panel-header">
              <Activity size={18} />
              <span>Active Alerts ({queueLength})</span>
            </div>
            <div className="alerts-list">
              {activeAlertsQuery.data?.alerts?.map((alert, idx) => (
                <div key={idx} className="alert-item">
                  <span className="alert-type">{alert.alert_type}</span>
                  <span className="alert-message">{alert.message}</span>
                  <span className="alert-target">
                    LCD {alert.target_lcd === -1 ? 'Both' : alert.target_lcd + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
