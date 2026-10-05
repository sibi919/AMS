import { placementPartners, placementDisclaimer } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function Placement() {
  return (
    <section id="placement" className="bg-navy py-20 text-white sm:py-28" aria-label="Placement partners">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <RevealOnScroll>
          <SectionHeading kicker="Placement" title="Organizations connected to our training" tone="light" />
        </RevealOnScroll>

        <RevealOnScroll delayMs={100}>
          <div className="placement-partners mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {placementPartners.map((partner) => (
              <div key={partner.name} className="placement-partner-card">
                <div className="placement-logo-plate"><img src={partner.logo} alt={partner.name} loading="lazy" /></div>
                <span>{partner.name}</span>
              </div>
            ))}
          </div>
        </RevealOnScroll>

        <RevealOnScroll delayMs={160}>
          <p className="mt-8 max-w-2xl rounded-xl border border-gold/25 bg-gold/10 p-4 text-sm leading-relaxed text-gold-light">
            {placementDisclaimer}
          </p>
        </RevealOnScroll>
      </div>
    </section>
  )
}
