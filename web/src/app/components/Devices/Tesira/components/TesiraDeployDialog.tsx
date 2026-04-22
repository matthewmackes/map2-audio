import React, { useMemo, useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Tag,
  Tile,
} from '@carbon/react'
import { Download, Launch } from '@carbon/icons-react'
import { useTesiraLayouts } from '../hooks/useTesiraApi'
import { tesiraApi } from '../../../../../map2/api'
import './TesiraCarbonChrome.css'

interface TesiraDeployDialogProps {
  deviceId: string
  open: boolean
  onClose: () => void
}

export function TesiraDeployDialog({ deviceId, open, onClose }: TesiraDeployDialogProps) {
  const { data: layouts, isLoading: layoutsLoading } = useTesiraLayouts({ includeInactive: false })

  const options = useMemo(() => layouts?.layouts ?? [], [layouts])
  const [selected, setSelected] = useState<string>('')

  const selectedLayout = useMemo(() => {
    if (!selected) return null
    const [layoutId, version] = selected.split('@')
    return options.find((layout) => layout.layout_id === layoutId && layout.version === version) ?? null
  }, [options, selected])

  const manualPackageUrl = selectedLayout
    ? tesiraApi.getLayoutManualPackageDownloadUrl(selectedLayout.layout_id, selectedLayout.version, deviceId)
    : ''
  const selectPlaceholder = layoutsLoading
    ? 'Loading active layouts…'
    : options.length > 0
      ? 'Select a layout package'
      : 'No active layouts available'

  return (
    <ComposedModal open={open} onClose={onClose} size="lg" className="tesira-deploy-modal">
      <ModalHeader
        title="Manual SageVue Deployment Package"
        label="Tesira deployment"
        closeModal={onClose}
      />
      <ModalBody hasScrollingContent className="tesira-deploy-modal__body">
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Manual deployment required"
          subtitle="MAP2 direct SageVue deployment is disabled. Download the package and upload the TMF in SageVue manually."
        />

        <div className="tesira-deploy-modal__grid">
          <div className="tesira-deploy-modal__column">
            <Tile className="tesira-deploy-modal__tile">
              <p className="tesira-dashboard__eyebrow">Package selection</p>
              <h3 className="tesira-dashboard__title">Choose an active MAP2 layout artifact</h3>
              <p className="tesira-dashboard__summary">
                The package bundles the TMF plus MAP2 metadata so an operator can move from recovery into SageVue deployment without leaving the Tesira route.
              </p>

              <Select
                id="tesira-layout-select"
                labelText="Layout package"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                disabled={layoutsLoading || options.length === 0}
              >
                <SelectItem value="" text={selectPlaceholder} disabled hidden={options.length > 0} />
                {options.map((layout) => {
                  const value = `${layout.layout_id}@${layout.version}`
                  return (
                    <SelectItem
                      key={value}
                      value={value}
                      text={`${layout.name} (${layout.layout_id} v${layout.version})`}
                    />
                  )
                })}
              </Select>
            </Tile>

            <Tile className="tesira-deploy-modal__tile">
              <div className="tesira-deploy-modal__section-header">
                <div>
                  <p className="tesira-dashboard__eyebrow">Package contents</p>
                  <h3 className="tesira-dashboard__title">Files included in the ZIP</h3>
                </div>
                <Tag type={selectedLayout ? 'green' : 'warm-gray'} size="sm">
                  {selectedLayout ? 'Ready to download' : 'Choose a layout'}
                </Tag>
              </div>

              {selectedLayout ? (
                <ul className="tesira-deploy-modal__asset-list">
                  <li>
                    <strong>{selectedLayout.layout_id}_{selectedLayout.version}.tmf</strong>
                    <span>Required by SageVue. Included when `artifact_uri` points to a local TMF file.</span>
                  </li>
                  <li>
                    <strong>{selectedLayout.layout_id}_{selectedLayout.version}.manifest.json</strong>
                    <span>MAP2 compatibility metadata and checksum reference.</span>
                  </li>
                  <li>
                    <strong>README_UPLOAD_TO_SAGEVUE.md</strong>
                    <span>Step-by-step manual upload instructions.</span>
                  </li>
                </ul>
              ) : (
                <p className="tesira-deploy-modal__empty">
                  Select a layout to inspect the exact files the package will contain.
                </p>
              )}
            </Tile>
          </div>

          <Tile className="tesira-deploy-modal__tile">
            <p className="tesira-dashboard__eyebrow">Operator steps</p>
            <h3 className="tesira-dashboard__title">Manual upload workflow</h3>
            <ol className="tesira-deploy-modal__steps">
              <li>Download the manual package ZIP.</li>
              <li>In SageVue, open Tesira Layouts and upload the included TMF.</li>
              <li>Deploy the uploaded layout to the target Tesira device or devices.</li>
              <li>Return to MAP2 and verify connectivity, AVB streams, and PTP.</li>
            </ol>
          </Tile>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          kind="tertiary"
          href="https://sagevue-help.biamp.com/Tesira_Layouts.htm"
          target="_blank"
          rel="noreferrer"
          renderIcon={Launch}
        >
          SageVue Upload Guide
        </Button>
        <Button
          kind="primary"
          href={selectedLayout ? manualPackageUrl : undefined}
          disabled={!selectedLayout}
          renderIcon={Download}
        >
          Download Manual Package
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
