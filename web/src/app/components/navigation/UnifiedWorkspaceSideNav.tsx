import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Categories, Tools } from '@carbon/icons-react'
import { FeatureFlags, Layer, TreeView } from '@carbon/react'

import { readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'

import './UnifiedWorkspaceSideNav.css'

export interface UnifiedWorkspaceSideNavItem {
  key: string
  label: string
  description?: string
  to: string
  icon: ComponentType<any>
  active: boolean
  onOpen: () => void
  meta?: ReactNode
  labelDecor?: ReactNode
  action?: ReactNode
  variant?: 'default' | 'utility'
}

export interface UnifiedWorkspaceSideNavMetaBlock {
  key: string
  label: string
  value: ReactNode
}

export interface UnifiedWorkspaceSideNavCallout {
  kind?: 'info' | 'warning'
  text: ReactNode
}

interface UnifiedWorkspaceSideNavProps {
  ariaLabel: string
  eyebrow: string
  title: string
  description: string
  items: UnifiedWorkspaceSideNavItem[]
  footerTitle?: string
  footerItems?: UnifiedWorkspaceSideNavItem[]
  metaBlocks?: UnifiedWorkspaceSideNavMetaBlock[]
  callout?: UnifiedWorkspaceSideNavCallout
  className?: string
  storageKey?: string
}

const PRIMARY_GROUP_ID = '__workspace-primary__'
const UTILITY_GROUP_ID = '__workspace-utility__'

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function slugifyStorageKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workspace'
}

// Build a typed PersistedKey on the fly — the storage id is workspace-scoped
// and the default expansion set varies per nav, so the key isn't a module
// constant.
function buildExpandedGroupsKey(storageId: string, defaults: string[]): PersistedKey<string[]> {
  return {
    storageKey: storageId,
    fallback: defaults,
    parse: (raw) => {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return undefined
        return parsed.filter((value): value is string => typeof value === 'string')
      } catch {
        return undefined
      }
    },
  }
}

function readExpandedGroupIds(storageId: string, defaults: string[]) {
  return readPersisted(buildExpandedGroupsKey(storageId, defaults))
}

function WorkspaceTreeLabel({
  item,
}: {
  item: Pick<UnifiedWorkspaceSideNavItem, 'label' | 'description' | 'labelDecor' | 'meta' | 'action' | 'variant'>
}) {
  return (
    <span
      className={joinClasses(
        'workspace-side-nav__item-copy',
        item.variant === 'utility' && 'is-utility',
      )}
    >
      <span className="workspace-side-nav__item-row">
        <span className="workspace-side-nav__item-label-wrap">
          {item.labelDecor}
          <span className="workspace-side-nav__item-label">{item.label}</span>
        </span>
        {item.meta ? <span className="workspace-side-nav__item-meta">{item.meta}</span> : null}
      </span>
      {item.description ? <span className="workspace-side-nav__item-desc">{item.description}</span> : null}
      {item.action ? <span className="workspace-side-nav__item-action">{item.action}</span> : null}
    </span>
  )
}

function WorkspaceTreeGroupLabel({
  label,
  description,
}: {
  label: string
  description?: string
}) {
  return (
    <span className="workspace-side-nav__group-copy">
      <span className="workspace-side-nav__group-label">{label}</span>
      {description ? <span className="workspace-side-nav__group-desc">{description}</span> : null}
    </span>
  )
}

export function UnifiedWorkspaceSideNav({
  ariaLabel,
  eyebrow,
  title,
  description,
  items,
  footerTitle,
  footerItems,
  metaBlocks,
  callout,
  className,
  storageKey,
}: UnifiedWorkspaceSideNavProps) {
  const utilityItems = footerItems ?? []
  const activeItem = useMemo(
    () => [...items, ...utilityItems].find((item) => item.active) ?? null,
    [items, utilityItems],
  )
  const resolvedStorageKey = useMemo(
    () => `map2:workspace-tree:${storageKey ?? slugifyStorageKey(title)}`,
    [storageKey, title],
  )
  const defaultExpandedGroups = useMemo(() => {
    const defaults = [PRIMARY_GROUP_ID]
    if (utilityItems.length > 0) {
      defaults.push(UTILITY_GROUP_ID)
    }
    return defaults
  }, [utilityItems.length])
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => (
    readExpandedGroupIds(resolvedStorageKey, defaultExpandedGroups)
  ))

  useEffect(() => {
    setExpandedGroups(readExpandedGroupIds(resolvedStorageKey, defaultExpandedGroups))
  }, [defaultExpandedGroups, resolvedStorageKey])

  useEffect(() => {
    writePersisted(buildExpandedGroupsKey(resolvedStorageKey, []), expandedGroups)
  }, [expandedGroups, resolvedStorageKey])

  const activeGroupId = activeItem?.variant === 'utility' ? UTILITY_GROUP_ID : PRIMARY_GROUP_ID
  const groupState = {
    [PRIMARY_GROUP_ID]: expandedGroups.includes(PRIMARY_GROUP_ID) || activeGroupId === PRIMARY_GROUP_ID,
    [UTILITY_GROUP_ID]: utilityItems.length > 0 && (expandedGroups.includes(UTILITY_GROUP_ID) || activeGroupId === UTILITY_GROUP_ID),
  }

  const setGroupExpanded = (groupId: string, nextExpanded: boolean) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (nextExpanded) {
        next.add(groupId)
      } else {
        next.delete(groupId)
      }
      if (!items.length) {
        next.delete(PRIMARY_GROUP_ID)
      }
      if (!utilityItems.length) {
        next.delete(UTILITY_GROUP_ID)
      }
      return Array.from(next)
    })
  }

  const renderLeafNode = (item: UnifiedWorkspaceSideNavItem) => (
    <TreeView.TreeNode
      key={item.key}
      id={item.key}
      aria-label={`Open ${item.label}`}
      className={joinClasses(
        'workspace-side-nav__node',
        item.active && 'is-selected',
        item.variant === 'utility' && 'is-utility',
      )}
      label={<WorkspaceTreeLabel item={item} />}
      renderIcon={item.icon}
      onSelect={(event) => {
        event.preventDefault()
        item.onOpen()
      }}
    />
  )

  return (
    <Layer className="workspace-side-nav__layer">
      <section className={joinClasses('workspace-side-nav', className)}>
        <div className="workspace-side-nav__head">
          <p className="workspace-side-nav__eyebrow">{eyebrow}</p>
          <h2 className="workspace-side-nav__title">{title}</h2>
          <p className="workspace-side-nav__copy">{description}</p>
        </div>

        <FeatureFlags enableTreeviewControllable>
          <TreeView
            active={activeItem?.key}
            className="workspace-side-nav__tree"
            hideLabel
            label={ariaLabel}
            selected={activeItem ? [activeItem.key] : []}
            size="sm"
          >
            {items.length > 0 ? (
              <TreeView.TreeNode
                id={PRIMARY_GROUP_ID}
                aria-label="Workspace sections"
                className="workspace-side-nav__group"
                isExpanded={groupState[PRIMARY_GROUP_ID]}
                label={(
                  <WorkspaceTreeGroupLabel
                    label="Workspace"
                    description="Core routes for the active window."
                  />
                )}
                onToggle={(nextExpanded) => setGroupExpanded(PRIMARY_GROUP_ID, Boolean(nextExpanded))}
                renderIcon={Categories}
              >
                {items.map(renderLeafNode)}
              </TreeView.TreeNode>
            ) : null}

            {utilityItems.length > 0 ? (
              <TreeView.TreeNode
                id={UTILITY_GROUP_ID}
                aria-label={footerTitle ?? 'Utilities'}
                className="workspace-side-nav__group workspace-side-nav__group--utility"
                isExpanded={groupState[UTILITY_GROUP_ID]}
                label={(
                  <WorkspaceTreeGroupLabel
                    label={footerTitle ?? 'Utilities'}
                    description="Supporting and cross-workspace routes."
                  />
                )}
                onToggle={(nextExpanded) => setGroupExpanded(UTILITY_GROUP_ID, Boolean(nextExpanded))}
                renderIcon={Tools}
              >
                {utilityItems.map(renderLeafNode)}
              </TreeView.TreeNode>
            ) : null}
          </TreeView>
        </FeatureFlags>

        {metaBlocks?.length || callout ? (
          <div className="workspace-side-nav__footer">
            {metaBlocks?.length ? (
              <div className="workspace-side-nav__meta-grid" aria-label="Workspace side panel status">
                {metaBlocks.map((block) => (
                  <article key={block.key} className="workspace-side-nav__meta-block">
                    <p className="workspace-side-nav__meta-label">{block.label}</p>
                    <div className="workspace-side-nav__meta-value">{block.value}</div>
                  </article>
                ))}
              </div>
            ) : null}
            {callout ? (
              <div
                className={joinClasses(
                  'workspace-side-nav__callout',
                  callout.kind === 'warning' && 'is-warning',
                )}
              >
                <p className="workspace-side-nav__callout-copy">{callout.text}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </Layer>
  )
}

export default UnifiedWorkspaceSideNav
