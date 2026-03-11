import type { CSSProperties, KeyboardEvent } from 'react'
import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { House, PushPin, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import {
  homeNavigationSections,
  MAX_PINNED_NAV_ITEMS,
  normalizePinnedRoutes,
  pinnableNavigationItems,
  type AdvancedMenuItem,
  type HardwareInterfaceMenuItem,
  type NavigationHomeSection,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { isBlockedAdvancedMenuItem } from '../layout/advancedMenuState'
import './HomePage.css'

type HomeNavigationItem = ShellNavigationItem | HardwareInterfaceMenuItem

const SECTION_COPY: Record<NavigationHomeSection, { eyebrow: string; summary: string }> = {
  System: {
    eyebrow: 'Platform & monitoring',
    summary: 'Host readiness, cluster health, platform orientation, and system-level dashboards for operating and understanding MAP2.',
  },
  JUCE: {
    eyebrow: 'Audio engine & processing',
    summary: 'Realtime engine control, signal-flow design, preset management, plugin inventory, and model/IR content workflows.',
  },
  MIDI: {
    eyebrow: 'MIDI & control',
    summary: 'MIDI routing, device control, expression mapping, and external hardware integration for live performance and studio use.',
  },
  AVB: {
    eyebrow: 'Audio networking',
    summary: 'AVB/TSN stream routing, Tesira device management, and networked audio transport control across the installation.',
  },
  Hardware: {
    eyebrow: 'Devices & interfaces',
    summary: 'Audio interface control pages, LCD console access, and hardware-specific connection-state views for supported profiles.',
  },
}

function resolvePinnedRoutes(routes: string[] | null | undefined): string[] {
  const requestedRoutes = normalizePinnedRoutes(routes)
  return pinnableNavigationItems
    .filter((item) => item.to !== '/' && requestedRoutes.includes(item.to))
    .map((item) => item.to)
    .slice(0, MAX_PINNED_NAV_ITEMS)
}

function isBlockedHomeItem(item: HomeNavigationItem): boolean {
  return 'includeInAdvancedMenu' in item ? isBlockedAdvancedMenuItem(item as AdvancedMenuItem) : false
}

/** Flatten all sections into a single ordered card list for the carousel */
function flattenAllCards(): { item: HomeNavigationItem; sectionTitle: NavigationHomeSection }[] {
  const cards: { item: HomeNavigationItem; sectionTitle: NavigationHomeSection }[] = []
  for (const section of homeNavigationSections) {
    for (const item of section.items) {
      cards.push({ item, sectionTitle: section.title })
    }
  }
  return cards
}

export function HomePage() {
  const navigate = useNavigate()
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()

  const pinnedRoutes = useMemo(
    () => resolvePinnedRoutes(specialSettings?.pinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

  const allCards = useMemo(() => flattenAllCards(), [])
  const [carouselIndex, setCarouselIndex] = useState(0)

  const goNext = useCallback(() => {
    setCarouselIndex((prev) => (prev < allCards.length - 1 ? prev + 1 : 0))
  }, [allCards.length])

  const goPrev = useCallback(() => {
    setCarouselIndex((prev) => (prev > 0 ? prev - 1 : allCards.length - 1))
  }, [allCards.length])

  const handleTogglePin = async (item: HomeNavigationItem, checked: boolean) => {
    if (!item.pinnable) {
      return
    }

    if (!checked) {
      await updateSpecialSettings({ pinnedRoutes: pinnedRoutes.filter((route) => route !== item.to) })
      return
    }

    if (!pinnedRouteSet.has(item.to) && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS) {
      return
    }

    const candidateSet = new Set([...pinnedRoutes, item.to])
    const nextRoutes = pinnableNavigationItems
      .filter((candidate) => candidate.to !== '/' && candidateSet.has(candidate.to))
      .map((candidate) => candidate.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)

    await updateSpecialSettings({ pinnedRoutes: nextRoutes })
  }

  const navigateToItem = (item: HomeNavigationItem) => {
    navigate(item.to)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, item: HomeNavigationItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateToItem(item)
    }
  }

  const handleCarouselKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goPrev()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goNext()
    }
  }

  const currentCard = allCards[carouselIndex]
  const currentSectionCopy = currentCard ? SECTION_COPY[currentCard.sectionTitle] : null

  const renderCard = (item: HomeNavigationItem, sectionTitle: NavigationHomeSection) => {
    const Icon = item.icon
    const isBlocked = isBlockedHomeItem(item)
    const checked = pinnedRouteSet.has(item.to)
    const limitReached = !checked && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS
    const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
    const pinTitle = !item.pinnable
      ? 'This card cannot be pinned to the top navigation'
      : limitReached
        ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
        : checked
          ? 'Unpin from top navigation'
          : 'Pin to top navigation'

    const CardBody = (
      <>
        <div className="home-landing-card__topline">
          <span className="home-landing-card__section-label">{sectionTitle}</span>
          <span className="home-landing-card__open-hint">Open feature</span>
        </div>

        <div className="home-landing-card__title-row">
          <span className="home-landing-card__icon" style={{ '--card-accent': item.color } as CSSProperties}>
            <Icon size={28} weight="duotone" aria-hidden />
          </span>
          <div>
            <h3>{item.label}</h3>
            <p className="home-landing-card__purpose">{item.description}</p>
          </div>
        </div>

        {item.gatedReason && (
          <div className="home-landing-card__note">
            {item.gatedReason}
          </div>
        )}
      </>
    )

    if (isBlocked) {
      return (
        <article
          className="home-landing-card home-landing-card--blocked home-landing-card--carousel"
          style={{ '--card-accent': item.color } as CSSProperties}
        >
          <button
            type="button"
            className={`home-landing-card__pin${checked ? ' is-pinned' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            title={pinTitle}
            aria-label={checked ? `Unpin ${item.label}` : `Pin ${item.label}`}
            aria-pressed={checked}
            disabled
          >
            <PushPin size={14} weight={checked ? 'fill' : 'regular'} aria-hidden />
          </button>
          {CardBody}
        </article>
      )
    }

    return (
      <article
        className="home-landing-card home-landing-card--carousel"
        style={{ '--card-accent': item.color } as CSSProperties}
        role="link"
        tabIndex={0}
        onClick={() => navigateToItem(item)}
        onKeyDown={(event) => handleCardKeyDown(event, item)}
      >
        <button
          type="button"
          className={`home-landing-card__pin${checked ? ' is-pinned' : ''}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!pinDisabled) {
              void handleTogglePin(item, !checked)
            }
          }}
          title={pinTitle}
          aria-label={checked ? `Unpin ${item.label}` : `Pin ${item.label}`}
          aria-pressed={checked}
          disabled={pinDisabled}
        >
          <PushPin size={14} weight={checked ? 'fill' : 'regular'} aria-hidden />
        </button>
        {CardBody}
      </article>
    )
  }

  return (
    <div className="home-landing-page">
      <section className="home-landing-hero">
        <div className="home-landing-hero__copy">
          <div className="home-landing-hero__eyebrow">Navigation landing page</div>
          <div className="home-landing-hero__title-row">
            <House size={30} weight="duotone" aria-hidden />
            <h1>MAP2 Home</h1>
          </div>
          <p>
            Browse every navigation destination as an explained card. Use the arrows to step through,
            and pin up to {MAX_PINNED_NAV_ITEMS} routes into the shell navigation bar.
          </p>
        </div>

        <div className="home-landing-hero__stats" role="list" aria-label="Navigation summary">
          <div className="home-landing-stat" role="listitem">
            <span className="home-landing-stat__label">Sections</span>
            <strong>{homeNavigationSections.length}</strong>
          </div>
          <div className="home-landing-stat" role="listitem">
            <span className="home-landing-stat__label">Routes</span>
            <strong>{allCards.length}</strong>
          </div>
          <div className="home-landing-stat" role="listitem">
            <span className="home-landing-stat__label">Pinned</span>
            <strong>{pinnedRoutes.length}/{MAX_PINNED_NAV_ITEMS}</strong>
          </div>
        </div>
      </section>

      {/* Desktop carousel */}
      <div
        className="home-carousel"
        onKeyDown={handleCarouselKeyDown}
        role="region"
        aria-label="Feature carousel"
        aria-roledescription="carousel"
      >
        {currentSectionCopy && (
          <div className="home-carousel__section-header">
            <div className="home-carousel__eyebrow">{currentSectionCopy.eyebrow}</div>
            <p className="home-carousel__section-summary">{currentSectionCopy.summary}</p>
          </div>
        )}

        <div className="home-carousel__stage">
          <button
            type="button"
            className="home-carousel__arrow home-carousel__arrow--prev"
            onClick={goPrev}
            aria-label="Previous card"
          >
            <CaretLeft size={24} weight="bold" />
          </button>

          <div className="home-carousel__card-frame" aria-live="polite">
            {currentCard && renderCard(currentCard.item, currentCard.sectionTitle)}
          </div>

          <button
            type="button"
            className="home-carousel__arrow home-carousel__arrow--next"
            onClick={goNext}
            aria-label="Next card"
          >
            <CaretRight size={24} weight="bold" />
          </button>
        </div>

        <div className="home-carousel__counter">
          {carouselIndex + 1} / {allCards.length}
        </div>
      </div>

      {/* Mobile: simple vertical list */}
      <div className="home-mobile-list">
        {homeNavigationSections.map((section) => {
          const sectionCopy = SECTION_COPY[section.title]

          return (
            <section key={section.title} className="home-landing-section">
              <header className="home-landing-section__header">
                <div>
                  <div className="home-landing-section__eyebrow">{sectionCopy.eyebrow}</div>
                  <h2>{section.title}</h2>
                </div>
                <p>{sectionCopy.summary}</p>
              </header>

              <div className="home-landing-grid">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isBlocked = isBlockedHomeItem(item)
                  const checked = pinnedRouteSet.has(item.to)
                  const limitReached = !checked && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS
                  const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
                  const pinTitle = !item.pinnable
                    ? 'This card cannot be pinned to the top navigation'
                    : limitReached
                      ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
                      : checked
                        ? 'Unpin from top navigation'
                        : 'Pin to top navigation'

                  const CardBody = (
                    <>
                      <div className="home-landing-card__topline">
                        <span className="home-landing-card__section-label">{section.title}</span>
                        <span className="home-landing-card__open-hint">Open feature</span>
                      </div>

                      <div className="home-landing-card__title-row">
                        <span className="home-landing-card__icon" style={{ '--card-accent': item.color } as CSSProperties}>
                          <Icon size={22} weight="duotone" aria-hidden />
                        </span>
                        <div>
                          <h3>{item.label}</h3>
                          <p className="home-landing-card__purpose">{item.description}</p>
                        </div>
                      </div>

                      {item.gatedReason && (
                        <div className="home-landing-card__note">
                          {item.gatedReason}
                        </div>
                      )}
                    </>
                  )

                  if (isBlocked) {
                    return (
                      <article
                        key={`${section.title}-${item.to}-${item.label}`}
                        className="home-landing-card home-landing-card--blocked"
                        style={{ '--card-accent': item.color } as CSSProperties}
                      >
                        <button
                          type="button"
                          className={`home-landing-card__pin${checked ? ' is-pinned' : ''}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          title={pinTitle}
                          aria-label={checked ? `Unpin ${item.label}` : `Pin ${item.label}`}
                          aria-pressed={checked}
                          disabled
                        >
                          <PushPin size={14} weight={checked ? 'fill' : 'regular'} aria-hidden />
                        </button>
                        {CardBody}
                      </article>
                    )
                  }

                  return (
                    <article
                      key={`${section.title}-${item.to}-${item.label}`}
                      className="home-landing-card"
                      style={{ '--card-accent': item.color } as CSSProperties}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigateToItem(item)}
                      onKeyDown={(event) => handleCardKeyDown(event, item)}
                    >
                      <button
                        type="button"
                        className={`home-landing-card__pin${checked ? ' is-pinned' : ''}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (!pinDisabled) {
                            void handleTogglePin(item, !checked)
                          }
                        }}
                        title={pinTitle}
                        aria-label={checked ? `Unpin ${item.label}` : `Pin ${item.label}`}
                        aria-pressed={checked}
                        disabled={pinDisabled}
                      >
                        <PushPin size={14} weight={checked ? 'fill' : 'regular'} aria-hidden />
                      </button>
                      {CardBody}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
