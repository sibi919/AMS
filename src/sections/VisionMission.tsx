import { vision, missionThemes } from "../data/academy"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function VisionMission() {
  return (
    <section className="bg-navy py-20 text-white sm:py-28" aria-label="Vision and mission">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.2fr]">
          <RevealOnScroll>
            <p className="text-sm font-semibold tracking-wide text-gold-light">Our vision</p>
            <p className="mt-4 font-display text-2xl font-semibold leading-snug sm:text-3xl">
              {vision.statement}
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={120}>
            <p className="text-sm font-semibold tracking-wide text-gold-light">Our mission</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {missionThemes.map((theme) => (
                <li
                  key={theme}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/85"
                >
                  {theme}
                </li>
              ))}
            </ul>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  )
}
