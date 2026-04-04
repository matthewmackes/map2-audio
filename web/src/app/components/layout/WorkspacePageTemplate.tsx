import type { ReactNode } from 'react'

import './WorkspacePageTemplate.css'

interface WorkspacePageTemplateProps {
  sidebar: ReactNode
  content: ReactNode
  aside?: ReactNode
  className?: string
  innerClassName?: string
  windowClassName?: string
  sidebarClassName?: string
  contentClassName?: string
  asideClassName?: string
  stickySidebar?: boolean
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function WorkspacePageTemplate({
  sidebar,
  content,
  aside,
  className,
  innerClassName,
  windowClassName,
  sidebarClassName,
  contentClassName,
  asideClassName,
  stickySidebar = false,
}: WorkspacePageTemplateProps) {
  return (
    <div className={joinClasses('workspace-page-template', className)}>
      <div className={joinClasses('workspace-page-template__inner', innerClassName)}>
        <div
          className={joinClasses(
            'workspace-page-template__window',
            aside && 'workspace-page-template__window--with-aside',
            windowClassName,
          )}
        >
          <aside
            className={joinClasses(
              'workspace-page-template__sidebar',
              stickySidebar && 'workspace-page-template__sidebar--sticky',
              sidebarClassName,
            )}
          >
            {sidebar}
          </aside>
          <div className={joinClasses('workspace-page-template__content', contentClassName)}>
            {content}
          </div>
          {aside ? (
            <aside className={joinClasses('workspace-page-template__aside', asideClassName)}>
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default WorkspacePageTemplate
