import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Fixed-row-height windowing against the app's single scroll container (#main).
 * Keeps scrolling smooth on older iPhones with thousands of songs; small lists render fully.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  render,
  getKey,
  overscan = 8,
  scrollParentId = 'main',
}: {
  items: T[]
  rowHeight: number
  render: (item: T, index: number) => ReactNode
  getKey: (item: T, index: number) => string
  overscan?: number
  scrollParentId?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<[number, number]>([0, Math.min(items.length, 40)])
  const small = items.length <= 60

  useLayoutEffect(() => {
    if (small) return
    const parent = document.getElementById(scrollParentId)
    const node = ref.current
    if (!parent || !node) return
    let raf = 0
    const compute = () => {
      raf = 0
      const pr = parent.getBoundingClientRect()
      const nr = node.getBoundingClientRect()
      const top = pr.top - nr.top
      const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
      const end = Math.min(items.length, Math.ceil((top + pr.height) / rowHeight) + overscan)
      setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute)
    }
    compute()
    parent.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      parent.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [items.length, rowHeight, overscan, scrollParentId, small])

  // Re-measure when content above the list changes height (e.g. banners).
  useEffect(() => {
    if (!small) document.getElementById(scrollParentId)?.dispatchEvent(new Event('scroll'))
  })

  if (small) {
    return (
      <div role="list">
        {items.map((it, i) => (
          <div role="listitem" key={getKey(it, i)} style={{ height: rowHeight }}>
            {render(it, i)}
          </div>
        ))}
      </div>
    )
  }

  const [start, end] = range
  return (
    <div ref={ref} role="list" style={{ height: items.length * rowHeight, position: 'relative' }}>
      {items.slice(start, end).map((it, k) => {
        const i = start + k
        return (
          <div
            role="listitem"
            key={getKey(it, i)}
            style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }}
          >
            {render(it, i)}
          </div>
        )
      })}
    </div>
  )
}
