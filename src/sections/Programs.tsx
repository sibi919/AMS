import { programs } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { TiltCard } from "../components/TiltCard"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function Programs() {
  return (
    <section id="programs" className="bg-paper py-20 sm:py-28" aria-label="Programs and training areas">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <RevealOnScroll>
          <SectionHeading
            kicker="Programs & training areas"
            title="Where practical training happens"
            intro="These reflect the training areas and initiatives JOAB Academy runs — not a claim that every course is active for every intake."
          />
        </RevealOnScroll>

        <div className="perspective mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <TiltCard
              key={program.name}
              className="rounded-2xl border border-line bg-white p-6 shadow-sm hover:shadow-xl"
            >
              <h3 className="font-display text-lg font-semibold text-ink">{program.name}</h3>
            </TiltCard>
          ))}
        </div>
      </div>
    </section>
  )
}
