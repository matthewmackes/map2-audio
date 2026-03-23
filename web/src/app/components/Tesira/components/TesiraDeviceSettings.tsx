import React, { useMemo, useState } from 'react'
import { PlayFilled, TrashCan } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Tag, TextInput, Tile, Toggle } from '@carbon/react'
import { TesiraFirmwareTab } from './TesiraFirmwareTab'
import {
  useCaptureTesiraScene,
  useDeleteTesiraScene,
  useRecallTesiraScene,
  useSetTesiraGpioPin,
  useTesiraCapabilities,
  useTesiraGpio,
  useTesiraScenes,
} from '../hooks/useTesiraApi'
import './TesiraCarbonChrome.css'

interface TesiraDeviceSettingsProps {
  deviceId: string
}

type SettingsNotice = {
  title: string
  message: string
}

export function TesiraDeviceSettings({ deviceId }: TesiraDeviceSettingsProps) {
  const capabilities = useTesiraCapabilities(deviceId)
  const gpio = useTesiraGpio(deviceId)
  const setGpio = useSetTesiraGpioPin()
  const scenes = useTesiraScenes(deviceId)
  const captureScene = useCaptureTesiraScene()
  const recallScene = useRecallTesiraScene()
  const deleteScene = useDeleteTesiraScene()

  const [sceneName, setSceneName] = useState('Current Setup')
  const [localNotice, setLocalNotice] = useState<SettingsNotice | null>(null)

  const gpioRows = gpio.data?.pins ?? []
  const sceneRows = useMemo(() => scenes.data?.scenes ?? [], [scenes.data])

  const onTogglePin = async (pin: number, state: boolean) => {
    setLocalNotice(null)
    try {
      await setGpio.mutateAsync({ deviceId, pin, state })
    } catch (error: unknown) {
      setLocalNotice({
        title: 'GPIO write failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const onCaptureScene = async () => {
    const trimmed = sceneName.trim()
    if (!trimmed) return
    setLocalNotice(null)
    try {
      await captureScene.mutateAsync({ deviceId, name: trimmed })
      setSceneName(trimmed)
    } catch (error: unknown) {
      setLocalNotice({
        title: 'Scene capture failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="tesira-device-settings">
      <TesiraFirmwareTab deviceId={deviceId} embedded />

      <Tile className="tesira-device-settings__tile">
        <div className="tesira-device-settings__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Capabilities</p>
            <h3 className="tesira-dashboard__title">Model limits and I/O envelope</h3>
            <p className="tesira-dashboard__summary">
              Confirm available GPIO, AVB, USB, and hardware capability counts before loading a MAP2-compatible layout onto the device.
            </p>
          </div>
          {capabilities.data?.model ? (
            <div className="tesira-device-settings__tags">
              <Tag type="blue" size="sm">{capabilities.data.model}</Tag>
            </div>
          ) : null}
        </div>

        {capabilities.isLoading ? (
          <div className="tesira-device-settings__loading">
            <InlineLoading description="Loading device capabilities" />
          </div>
        ) : capabilities.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Capabilities unavailable"
            subtitle="The device capability envelope could not be read."
          />
        ) : (
          <div className="tesira-device-settings__stats">
            <div className="tesira-device-settings__stat">
              <p className="tesira-dashboard__stat-label">GPIO</p>
              <p className="tesira-dashboard__stat-value">{capabilities.data?.capabilities?.gpio_count ?? 0}</p>
            </div>
            <div className="tesira-device-settings__stat">
              <p className="tesira-dashboard__stat-label">AVB Channels</p>
              <p className="tesira-dashboard__stat-value">{capabilities.data?.capabilities?.avb_max_channels ?? 0}</p>
            </div>
            <div className="tesira-device-settings__stat">
              <p className="tesira-dashboard__stat-label">USB Channels</p>
              <p className="tesira-dashboard__stat-value">{capabilities.data?.capabilities?.usb_channels ?? 0}</p>
            </div>
            <div className="tesira-device-settings__stat">
              <p className="tesira-dashboard__stat-label">RS-232</p>
              <p className="tesira-dashboard__stat-value">{capabilities.data?.capabilities?.rs232 ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </Tile>

      {localNotice ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={localNotice.title}
          subtitle={localNotice.message}
        />
      ) : null}

      <Tile className="tesira-device-settings__tile">
        <div className="tesira-device-settings__header">
          <div>
            <p className="tesira-dashboard__eyebrow">GPIO</p>
            <h3 className="tesira-dashboard__title">Toggle Tesira GPIO pins</h3>
            <p className="tesira-dashboard__summary">
              Drive device I/O states from MAP2 once the Tesira layout has been loaded and the runtime connection is stable.
            </p>
          </div>
          <div className="tesira-device-settings__actions">
            <Tag type="cool-gray" size="sm">{`${gpioRows.length} pins`}</Tag>
            <Button
              size="sm"
              kind="ghost"
              onClick={() => {
                gpio.refetch().catch(() => undefined)
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {gpio.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="GPIO query failed"
            subtitle={(gpio.error as Error).message || 'Unable to read GPIO state from this device.'}
          />
        ) : null}

        {gpio.isLoading ? (
          <div className="tesira-device-settings__loading">
            <InlineLoading description="Loading GPIO state" />
          </div>
        ) : (
          <div className="tesira-device-settings__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira GPIO pins">
              <thead>
                <tr>
                  <th scope="col">Pin</th>
                  <th scope="col">Status</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {gpioRows.map((pin) => (
                  <tr key={pin.pin}>
                    <td>{pin.pin}</td>
                    <td>{pin.ok ? 'OK' : 'Unavailable'}</td>
                    <td>
                      <Toggle
                        id={`tesira-gpio-pin-${pin.pin}`}
                        labelText={`GPIO pin ${pin.pin}`}
                        labelA="Low"
                        labelB="High"
                        toggled={Boolean(pin.state)}
                        disabled={!pin.ok || pin.state == null || setGpio.isPending}
                        onToggle={(checked) => {
                          void onTogglePin(pin.pin, checked)
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {gpioRows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <p className="tesira-presets-tab__empty">No GPIO pins discovered.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      <Tile className="tesira-device-settings__tile">
        <div className="tesira-device-settings__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Scene snapshots</p>
            <h3 className="tesira-dashboard__title">Capture and replay runtime scene state</h3>
            <p className="tesira-dashboard__summary">
              Store scene snapshots against the live Tesira runtime so MAP2 can recall or delete them without leaving the dedicated route.
            </p>
          </div>
          <div className="tesira-device-settings__actions">
            <Tag type="warm-gray" size="sm">{`${sceneRows.length} scenes`}</Tag>
          </div>
        </div>

        <div className="tesira-device-settings__scene-form">
          <TextInput
            id={`tesira-scene-name-${deviceId}`}
            labelText="Scene name"
            value={sceneName}
            onChange={(event) => setSceneName(event.target.value)}
          />
          <Button
            size="sm"
            kind="secondary"
            disabled={captureScene.isPending || sceneName.trim() === ''}
            onClick={() => {
              void onCaptureScene()
            }}
          >
            Capture scene
          </Button>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => {
              scenes.refetch().catch(() => undefined)
            }}
          >
            Refresh
          </Button>
        </div>

        {scenes.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Scene list failed"
            subtitle={(scenes.error as Error).message || 'Unable to read saved scene snapshots.'}
          />
        ) : null}

        {scenes.isLoading ? (
          <div className="tesira-device-settings__loading">
            <InlineLoading description="Loading scene snapshots" />
          </div>
        ) : (
          <div className="tesira-device-settings__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira scene snapshots">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sceneRows.map((scene) => (
                  <tr key={scene.scene_id}>
                    <td>{scene.name}</td>
                    <td>{scene.created_at ? new Date(scene.created_at).toLocaleString() : '—'}</td>
                    <td>
                      <div className="tesira-device-settings__table-actions">
                        <Button
                          size="sm"
                          kind="ghost"
                          renderIcon={PlayFilled}
                          disabled={recallScene.isPending}
                          onClick={() => {
                            recallScene.mutate({ deviceId, sceneId: scene.scene_id })
                          }}
                        >
                          Recall
                        </Button>
                        <Button
                          size="sm"
                          kind="ghost"
                          renderIcon={TrashCan}
                          disabled={deleteScene.isPending}
                          onClick={() => {
                            deleteScene.mutate({ deviceId, sceneId: scene.scene_id })
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sceneRows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <p className="tesira-presets-tab__empty">No scene snapshots captured yet.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  )
}
