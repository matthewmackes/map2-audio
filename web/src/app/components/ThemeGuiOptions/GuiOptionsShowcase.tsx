import {
  AnimatePresence,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import './GuiOptionsShowcase.css'

type DemoId =
  | 'layout-morph'
  | 'magnetic-button'
  | 'spring-dock'
  | 'drag-sort'
  | 'scroll-progress'
  | 'shared-layout-tabs'
  | 'stagger-reveal'
  | 'gesture-card'
  | 'path-draw'
  | 'number-ticker'

const DEMOS: Array<{ id: DemoId; name: string; blurb: string }> = [
  { id: 'layout-morph', name: 'Layout Morph', blurb: 'Shared layoutId cards expand in place with spring physics.' },
  { id: 'magnetic-button', name: 'Magnetic Button', blurb: 'Pointer-attracted button driven by motion values and springs.' },
  { id: 'spring-dock', name: 'Spring Dock', blurb: 'macOS-style dock with pointer-distance magnification.' },
  { id: 'drag-sort', name: 'Drag Reorder', blurb: 'Draggable tiles with FLIP layout animations.' },
  { id: 'scroll-progress', name: 'Scroll Progress', blurb: 'useScroll mapped through a smoothed spring.' },
  { id: 'shared-layout-tabs', name: 'Shared Tabs', blurb: 'Sliding indicator tracked via layoutId across tabs.' },
  { id: 'stagger-reveal', name: 'Stagger Reveal', blurb: 'Orchestrated child variants with stagger timing.' },
  { id: 'gesture-card', name: '3D Gesture Card', blurb: 'Hover tilt, tap depth, and press scale via gestures.' },
  { id: 'path-draw', name: 'SVG Path Draw', blurb: 'Animated pathLength for signature-style reveals.' },
  { id: 'number-ticker', name: 'Spring Ticker', blurb: 'Animated counter driven by a spring motion value.' },
]

export function GuiOptionsShowcase() {
  const [active, setActive] = useState<DemoId>('layout-morph')
  const demo = DEMOS.find((d) => d.id === active) ?? DEMOS[0]

  return (
    <div className="gui-options">
      <div className="gui-options__intro">
        <h2 className="gui-options__title">Framer Motion Effects</h2>
        <p className="gui-options__blurb">
          Ten interactive demonstrations of the best Framer Motion patterns. Click a tile to load each effect.
        </p>
      </div>

      <div className="gui-options__grid" role="tablist" aria-label="GUI effect demos">
        {DEMOS.map((entry, index) => {
          const selected = entry.id === active
          return (
            <motion.button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`gui-options__tile${selected ? ' gui-options__tile--active' : ''}`}
              onClick={() => setActive(entry.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035, type: 'spring', stiffness: 220, damping: 22 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="gui-options__tile-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="gui-options__tile-name">{entry.name}</span>
              <span className="gui-options__tile-blurb">{entry.blurb}</span>
              {selected ? (
                <motion.span
                  layoutId="gui-options-tile-underline"
                  className="gui-options__tile-underline"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              ) : null}
            </motion.button>
          )
        })}
      </div>

      <div className="gui-options__stage" aria-live="polite">
        <div className="gui-options__stage-head">
          <h3>{demo.name}</h3>
          <p>{demo.blurb}</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="gui-options__stage-body"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          >
            <DemoRenderer id={active} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function DemoRenderer({ id }: { id: DemoId }) {
  switch (id) {
    case 'layout-morph':
      return <LayoutMorphDemo />
    case 'magnetic-button':
      return <MagneticButtonDemo />
    case 'spring-dock':
      return <SpringDockDemo />
    case 'drag-sort':
      return <DragSortDemo />
    case 'scroll-progress':
      return <ScrollProgressDemo />
    case 'shared-layout-tabs':
      return <SharedLayoutTabsDemo />
    case 'stagger-reveal':
      return <StaggerRevealDemo />
    case 'gesture-card':
      return <GestureCardDemo />
    case 'path-draw':
      return <PathDrawDemo />
    case 'number-ticker':
      return <NumberTickerDemo />
    default:
      return null
  }
}

function LayoutMorphDemo() {
  const [expanded, setExpanded] = useState<number | null>(null)
  const items = [
    { id: 1, label: 'Scenes', color: '#3b82f6' },
    { id: 2, label: 'Mix', color: '#8b5cf6' },
    { id: 3, label: 'Routing', color: '#06b6d4' },
    { id: 4, label: 'Meters', color: '#10b981' },
  ]

  return (
    <div className="demo-layout-morph">
      <div className="demo-layout-morph__row">
        {items.map((item) => (
          <motion.button
            key={item.id}
            layoutId={`morph-${item.id}`}
            type="button"
            className="demo-layout-morph__card"
            style={{ background: item.color }}
            onClick={() => setExpanded(item.id)}
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <motion.span layoutId={`morph-label-${item.id}`}>{item.label}</motion.span>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {expanded !== null ? (
          <motion.div
            className="demo-layout-morph__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(null)}
          >
            <motion.div
              layoutId={`morph-${expanded}`}
              className="demo-layout-morph__expanded"
              style={{ background: items.find((i) => i.id === expanded)?.color }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              <motion.span layoutId={`morph-label-${expanded}`} className="demo-layout-morph__expanded-label">
                {items.find((i) => i.id === expanded)?.label}
              </motion.span>
              <p>Click anywhere to dismiss.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function MagneticButtonDemo() {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 260, damping: 22 })
  const sy = useSpring(y, { stiffness: 260, damping: 22 })

  return (
    <div className="demo-magnetic">
      <motion.button
        ref={ref}
        type="button"
        className="demo-magnetic__button"
        style={{ x: sx, y: sy }}
        onPointerMove={(e) => {
          const rect = ref.current?.getBoundingClientRect()
          if (!rect) return
          x.set((e.clientX - (rect.left + rect.width / 2)) * 0.35)
          y.set((e.clientY - (rect.top + rect.height / 2)) * 0.35)
        }}
        onPointerLeave={() => {
          x.set(0)
          y.set(0)
        }}
      >
        Magnetic Press
      </motion.button>
      <p className="demo-magnetic__hint">Move your pointer near the button.</p>
    </div>
  )
}

function SpringDockDemo() {
  const mouseX = useMotionValue(Infinity)
  const icons = ['◉', '◆', '▲', '■', '✸', '✦', '❂', '◈']
  return (
    <div
      className="demo-dock"
      onPointerMove={(e) => mouseX.set(e.clientX)}
      onPointerLeave={() => mouseX.set(Infinity)}
    >
      {icons.map((icon, i) => (
        <DockIcon key={i} icon={icon} mouseX={mouseX} />
      ))}
    </div>
  )
}

function DockIcon({ icon, mouseX }: { icon: string; mouseX: ReturnType<typeof useMotionValue<number>> }) {
  const ref = useRef<HTMLDivElement>(null)
  const distance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - rect.x - rect.width / 2
  })
  const sizeRaw = useTransform(distance, [-160, 0, 160], [44, 80, 44])
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 180, damping: 14 })
  return (
    <motion.div ref={ref} className="demo-dock__icon" style={{ width: size, height: size }}>
      <span>{icon}</span>
    </motion.div>
  )
}

function DragSortDemo() {
  const [items, setItems] = useState([
    { id: 1, label: 'Gate' },
    { id: 2, label: 'Comp' },
    { id: 3, label: 'EQ' },
    { id: 4, label: 'Reverb' },
    { id: 5, label: 'Limiter' },
  ])

  return (
    <div className="demo-drag-sort">
      <p className="demo-drag-sort__hint">Drag any block to reorder.</p>
      <motion.div layout className="demo-drag-sort__list">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              const step = 58
              const offset = Math.round(info.offset.y / step)
              if (offset === 0) return
              const target = Math.max(0, Math.min(items.length - 1, index + offset))
              if (target === index) return
              const next = [...items]
              const [moved] = next.splice(index, 1)
              next.splice(target, 0, moved)
              setItems(next)
            }}
            whileDrag={{ scale: 1.04, zIndex: 2, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}
            className="demo-drag-sort__item"
          >
            <span className="demo-drag-sort__handle">⋮⋮</span>
            <span>{item.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

function ScrollProgressDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: ref })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 20 })
  const scaleX = useTransform(progress, [0, 1], [0, 1])

  return (
    <div className="demo-scroll">
      <motion.div className="demo-scroll__bar" style={{ scaleX }} />
      <div className="demo-scroll__viewport" ref={ref}>
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="demo-scroll__row">
            Scroll row {i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

function SharedLayoutTabsDemo() {
  const tabs = ['Input', 'Drive', 'EQ', 'Output']
  const [active, setActive] = useState(0)
  return (
    <div className="demo-tabs">
      <div className="demo-tabs__bar">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            className={`demo-tabs__tab${i === active ? ' demo-tabs__tab--active' : ''}`}
            onClick={() => setActive(i)}
          >
            {tab}
            {i === active ? (
              <motion.span
                layoutId="demo-tabs-indicator"
                className="demo-tabs__indicator"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="demo-tabs__panel"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -14 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <strong>{tabs[active]}</strong>
          <p>Panel content for {tabs[active].toLowerCase()} — the indicator slides between tabs using a shared layoutId.</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StaggerRevealDemo() {
  const [key, setKey] = useState(0)
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
  }
  const child = {
    hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
    },
  }
  const rows = ['Loading scene', 'Initializing graph', 'Binding surfaces', 'Arming transport', 'Ready']

  return (
    <div className="demo-stagger">
      <motion.ul key={key} className="demo-stagger__list" variants={container} initial="hidden" animate="show">
        {rows.map((row) => (
          <motion.li key={row} className="demo-stagger__row" variants={child}>
            <span className="demo-stagger__dot" /> {row}
          </motion.li>
        ))}
      </motion.ul>
      <button type="button" className="demo-stagger__replay" onClick={() => setKey((k) => k + 1)}>
        Replay
      </button>
    </div>
  )
}

function GestureCardDemo() {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateY = useTransform(x, [-120, 120], [-18, 18])
  const rotateX = useTransform(y, [-120, 120], [14, -14])

  return (
    <div
      className="demo-gesture"
      onPointerMove={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        x.set(e.clientX - (rect.left + rect.width / 2))
        y.set(e.clientY - (rect.top + rect.height / 2))
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      <motion.div
        className="demo-gesture__card"
        style={{ rotateY, rotateX, transformStyle: 'preserve-3d' }}
        whileTap={{ scale: 0.97 }}
      >
        <div className="demo-gesture__layer demo-gesture__layer--back" />
        <div className="demo-gesture__layer demo-gesture__layer--mid" />
        <div className="demo-gesture__layer demo-gesture__layer--front">
          <strong>MAP2</strong>
          <span>3D gesture card</span>
        </div>
      </motion.div>
    </div>
  )
}

function PathDrawDemo() {
  const [key, setKey] = useState(0)
  return (
    <div className="demo-path">
      <svg viewBox="0 0 260 120" className="demo-path__svg">
        <motion.path
          key={key}
          d="M10 90 C 40 10, 80 10, 110 90 S 180 170, 210 90 S 260 40, 250 20"
          fill="transparent"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        />
      </svg>
      <button type="button" className="demo-path__replay" onClick={() => setKey((k) => k + 1)}>
        Draw again
      </button>
    </div>
  )
}

function NumberTickerDemo() {
  const [target, setTarget] = useState(1337)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 60, damping: 18 })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    mv.set(target)
    const unsub = spring.on('change', (v) => setDisplay(Math.round(v)))
    return () => unsub()
  }, [target, mv, spring])

  return (
    <div className="demo-ticker">
      <motion.div className="demo-ticker__value" key={target} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
        {display.toLocaleString()}
      </motion.div>
      <div className="demo-ticker__actions">
        <button type="button" onClick={() => setTarget(Math.floor(Math.random() * 100000))}>
          Randomize
        </button>
        <button type="button" onClick={() => setTarget(0)}>
          Reset
        </button>
      </div>
    </div>
  )
}
