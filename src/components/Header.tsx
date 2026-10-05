import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Menu, X } from "lucide-react"
import { nav, identity } from "../data/academy"

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-navy-deep/95 backdrop-blur border-b border-white/10" : "bg-navy-deep"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#home" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gold/60 bg-white p-1">
            <img src="/brand/joab-ja-mark.png" alt="" className="h-full w-full object-contain" width="1254" height="1254" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg font-semibold text-white">
              {identity.name}
            </span>
            <span className="block text-[11px] text-gold-light">
              {identity.tagline.split(", ").join(" · ")}
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-white/85 transition-colors hover:text-gold-light"
            >
              {item.label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-full border border-gold/70 px-4 py-1.5 text-sm font-medium text-gold-light transition-colors hover:bg-gold/10"
          >
            Login
          </Link>
        </nav>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-md text-white lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-navy-deep lg:hidden">
          <nav className="flex flex-col px-5 py-3" aria-label="Mobile">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/5 py-3 text-sm font-medium text-white/85"
              >
                {item.label}
              </a>
            ))}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="mt-3 rounded-full border border-gold/70 px-4 py-2 text-center text-sm font-medium text-gold-light"
            >
              Login
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
