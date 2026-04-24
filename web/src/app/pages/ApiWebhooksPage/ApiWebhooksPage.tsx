import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@carbon/react'
import { useCallback, useEffect, useState } from 'react'

import { EventFeedTab } from './EventFeedTab'
import { WebSshTab } from './WebSshTab'
import './ApiWebhooksPage.css'

const STORAGE_KEY = 'map2_midpoint_active_tab'
const LEGACY_STORAGE_KEY = 'map2_api_webhooks_active_tab'
const TAB_IDS = ['event-feed', 'web-ssh'] as const
type TabId = (typeof TAB_IDS)[number]

function isTabId(value: string | null): value is TabId {
  return value === 'event-feed' || value === 'web-ssh'
}

function readStoredTab(): TabId {
  if (typeof window === 'undefined') {
    return 'event-feed'
  }
  const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
  return isTabId(stored) ? stored : 'event-feed'
}

export function ApiWebhooksPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => readStoredTab())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, activeTab)
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
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
