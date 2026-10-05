import { about } from "../data/academy"
import { SectionHeading } from "../components/SectionHeading"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function About() {
  return (
    <section id="about" className="bg-paper py-20 sm:py-28" aria-label="About the academy">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <RevealOnScroll>
            <SectionHeading kicker="About JOAB Academy" title="Practical skills, real guidance" />
            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate">{about.body}</p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={120}>
            <div className="perspective">
              <div
                className="tilt-card rounded-3xl border border-line bg-white p-8 shadow-xl"
                style={{ transform: "rotate3d(1, -1, 0, 3deg)" }}
              >
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">Students</p>
                    <p className="mt-1 text-sm text-slate">Practical training</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">Women</p>
                    <p className="mt-1 text-sm text-slate">Free coaching</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">Job seekers</p>
                    <p className="mt-1 text-sm text-slate">Career guidance</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold text-ink">Community</p>
                    <p className="mt-1 text-sm text-slate">Awareness programs</p>
                  </div>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </div>
        <RevealOnScroll delayMs={180}>
          <aside className="ceo-card mt-12" aria-label="Academy leadership">
            <img className="ceo-photo" src="/leadership/lakshmani-vetrivel.png" alt="Ashwini Vetrivel, CEO of JOAB Academy" width="1106" height="1422" loading="lazy" />
            <div><span className="text-xs font-bold uppercase tracking-[.2em] text-[#85631f]">Academy leadership</span>
              <h3 className="mt-2 font-display text-2xl text-ink">ASHWINI VETRIVEL</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate">Chief Executive Officer · JOAB Academy</p>
            </div>
          </aside>
        </RevealOnScroll>
      </div>
    </section>
  )
}
