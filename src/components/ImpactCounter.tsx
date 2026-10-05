import { useEffect, useRef, useState } from "react"

type ImpactCounterProps = {
  value: number
  suffix?: string
  durationMs?: number
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Counts up from 0 to `value` once it scrolls into view.
 * Falls back to the plain final number when the user prefers reduced motion.
 */
export function ImpactCounter({ value, suffix = "", durationMs = 1400 }: ImpactCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(prefersReducedMotion() ? value : 0)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const node = ref.current
    if (!node) return

    let frame: number
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const progress = Math.min((now - start) / durationMs, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setDisplay(Math.round(eased * value))
          if (progress < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [value, durationMs])

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  )
}
