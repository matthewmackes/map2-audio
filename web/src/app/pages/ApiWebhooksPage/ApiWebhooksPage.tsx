import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react'
import { useCallback, useEffect, useState } from 'react'

import { clearPersisted, readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'
import { EventFeedTab } from './EventFeedTab'
import { WebSshTab } from './WebSshTab'
import './ApiWebhooksPage.css'

const TAB_IDS = ['event-feed', 'web-ssh'] as const
type TabId = (typeof TAB_IDS)[number]

function isTabId(value: string | null | undefined): value is TabId {
  return value === 'event-feed' || value === 'web-ssh'
}

const ACTIVE_TAB_KEY: PersistedKey<TabId> = {
  storageKey: 'map2_midpoint_active_tab',
  fallback: 'event-feed',
  parse: (raw) => (isTabId(raw) ? raw : undefined),
}
const LEGACY_ACTIVE_TAB_KEY: PersistedKey<TabId> = {
  storageKey: 'map2_api_webhooks_active_tab',
  fallback: 'event-feed',
  parse: (raw) => (isTabId(raw) ? raw : undefined),
}

function readStoredTab(): TabId {
  // Prefer the current key; only fall back to the legacy key if the current
  // value is missing (we can't tell missing from default through the helper,
  // so re-read raw for the migration path then drop the legacy entry).
  const current = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_TAB_KEY.storageKey) : null
  if (isTabId(current)) return current
  const legacy = readPersisted(LEGACY_ACTIVE_TAB_KEY)
  return legacy
}

export function ApiWebhooksPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => readStoredTab())

  useEffect(() => {
    writePersisted(ACTIVE_TAB_KEY, activeTab)
    clearPersisted(LEGACY_ACTIVE_TAB_KEY)
  }, [activeTab])

  const handleChange = useCallback(({ selectedIndex }: { selectedIndex: number }) => {
    setActiveTab(TAB_IDS[selectedIndex] ?? 'event-feed')
  }, [])

  const selectedIndex = TAB_IDS.indexOf(activeTab)

  return (
    <section className="api-webhooks-page" id="api-webhooks-page">
      <Tabs selectedIndex={selectedIndex >= 0 ? selectedIndex : 0} onChange={handleChange}>
        <TabList aria-label="Midpoint tabs" contained>
          <Tab>Event Feed</Tab>
          <Tab>Web SSH</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <EventFeedTab />
          </TabPanel>
          <TabPanel>
            <WebSshTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>
  )
}

export default ApiWebhooksPage
