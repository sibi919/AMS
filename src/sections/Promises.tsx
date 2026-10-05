import { promises } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function Promises() {
  return (
    <section className="bg-navy-deep py-20 text-white sm:py-28" aria-label="Our promises">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <RevealOnScroll>
          <SectionHeading kicker="Our promises" title="What JOAB Academy stands for" tone="light" />
        </RevealOnScroll>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promises.map((promise, i) => (
            <RevealOnScroll key={promise} delayMs={i * 60}>
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm font-medium text-white/85">
                {promise}
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
