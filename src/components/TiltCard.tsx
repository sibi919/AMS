import { useRef, type ReactNode } from "react"

type TiltCardProps = {
  children: ReactNode
  className?: string
}

/**
 * Subtle pointer-driven 3D tilt. Disabled entirely for touch/coarse
 * pointers and for prefers-reduced-motion, where the card just sits flat.
 */
export function TiltCard({ children, className = "" }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return
    const node = ref.current
    if (!node) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const rect = node.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    node.style.transform = `rotateY(${px * 10}deg) rotateX(${py * -10}deg) translateZ(8px)`
  }

  const handleLeave = () => {
    const node = ref.current
    if (!node) return
    node.style.transform = "rotateY(0deg) rotateX(0deg) translateZ(0px)"
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`tilt-card ${className}`}
    >
      {children}
    </div>
  )
}
