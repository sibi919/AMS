import { journey } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function Journey() {
  return (
    <section className="bg-paper py-20 sm:py-28" aria-label="Our journey and success stories">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <RevealOnScroll>
          <SectionHeading
            kicker="Our journey"
            title="Reported outcomes, not guarantees"
            intro="These are outcomes reported by the academy for specific batches and programs — presented as reported results, not promises for every student."
          />
        </RevealOnScroll>

        <ol className="mt-12 space-y-6 border-l border-line pl-8">
          {journey.map((story, i) => (
            <li key={story.title} className="relative">
              <RevealOnScroll delayMs={i * 60}>
                <span className="absolute -left-[2.15rem] top-1.5 h-3 w-3 rounded-full bg-gold" />
                <h3 className="font-display text-lg font-semibold text-ink">{story.title}</h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate">{story.body}</p>
              </RevealOnScroll>
            </li>
          ))}
        </ol>
        <div className="brochure-gallery mt-12" aria-label="Academy photographs from the JOAB brochure">
          <figure><img src="/brochure/student-group.webp" alt="JOAB Academy students and teachers at a practical training event" width="800" height="533" loading="lazy" /><figcaption>Learning through practice</figcaption></figure>
          <figure><img src="/brochure/tuition-group.webp" alt="JOAB Academy tuition group pictured in the brochure" width="800" height="361" loading="lazy" /><figcaption>A community of learners</figcaption></figure>
          <figure><img src="/brochure/placement-group.webp" alt="JOAB Academy trainees pictured together at a workplace" width="800" height="600" loading="lazy" /><figcaption>From skills to opportunity</figcaption></figure>
        </div>
      </div>
    </section>
  )
}
