import { Tag } from '@carbon/react'

export function WebSshTab() {
  return (
    <div className="api-webhooks-page__tab-placeholder" role="region" aria-label="Web SSH">
      <h3>
        Web SSH <Tag type="cool-gray">Scaffold</Tag>
      </h3>
      <p>
        The xterm.js terminal surface, mDNS peer dropdown, and Advanced manual connection form will mount here in
        T2419-D / T2419-E / T2419-F. The asyncssh WebSocket bridge lands under T2419-A / T2419-B.
      </p>
    </div>
  )
}

export default WebSshTab
