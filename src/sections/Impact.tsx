import { impact } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { ImpactCounter } from "../components/ImpactCounter"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function Impact() {
  return (
    <section id="impact" className="relative overflow-hidden bg-navy-deep py-20 text-white sm:py-28" aria-label="Academy impact">
      <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <RevealOnScroll>
          <SectionHeading kicker="Our impact" title="Reported outcomes so far" tone="light" />
        </RevealOnScroll>

        <div className="perspective mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {impact.map((item, i) => (
            <RevealOnScroll key={item.label} delayMs={i * 80}>
              <div
                className="tilt-card rounded-2xl border border-white/10 bg-white/5 p-7 text-center backdrop-blur-sm"
                style={{ transform: "rotate3d(1, 1, 0, 2deg)" }}
              >
                <p className="font-display text-4xl font-semibold text-gold-light">
                  <ImpactCounter value={item.value} suffix={item.suffix} />
                </p>
                <p className="mt-2 text-sm text-white/75">{item.label}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
