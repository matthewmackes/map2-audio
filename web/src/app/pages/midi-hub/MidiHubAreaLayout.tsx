import { useEffect, useRef } from 'react'
import { Layer, Tag } from '@carbon/react'
import { Map2BrandMark } from '../../components/branding/map2Branding'
import { useMidiHubNavStore } from '../../stores/midiHubNavStore'
import './MidiHubAreaPage.css'
import './MidiHubAreaLayout.css'

type MidiHubAreaLayoutProps = {
  routeKey: string
  title: string
  summary: string
  tags?: Array<{ label: string; type?: 'blue' | 'cool-gray' | 'green' | 'warm-gray' }>
  children: React.ReactNode
}

export function MidiHubAreaLayout({
  routeKey,
  title,
  summary,
  tags = [],
  children,
}: MidiHubAreaLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollTop = useMidiHubNavStore((state) => state.getScrollTop(routeKey))
  const setScrollTop = useMidiHubNavStore((state) => state.setScrollTop)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = scrollTop
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [routeKey, scrollTop])

  return (
    <div
      ref={containerRef}
      className="midi-hub-area-page"
      onScroll={(event) => setScrollTop(routeKey, event.currentTarget.scrollTop)}
    >
      <Layer className="midi-hub-area-page__hero">
        <div className="midi-hub-area-page__hero-grid">
          <div className="midi-hub-area-page__hero-copy">
            <span className="midi-hub-area-page__eyebrow">MAP2 MIDI Hub</span>
            <h2>{title}</h2>
            <p>{summary}</p>
            <div className="midi-hub-area-page__meta-row">
              <Tag type="blue">Studio workflow</Tag>
              <Tag type="cool-gray">{routeKey}</Tag>
              {tags.map((tag) => (
                <Tag key={tag.label} type={tag.type ?? 'cool-gray'}>
                  {tag.label}
                </Tag>
              ))}
            </div>
          </div>

          <div className="midi-hub-area-page__hero-emblem" aria-hidden="true">
            <div className="midi-hub-area-page__hero-emblem-frame">
              <Map2BrandMark className="midi-hub-area-page__hero-mark" />
            </div>
          </div>
        </div>
      </Layer>

      {children}
    </div>
  )
}
