import { skillToCareer } from "../data/academy"
import { RevealOnScroll } from "../components/RevealOnScroll"

export function SkillToCareer() {
  return (
    <section
      id="skill-to-career"
      className="relative overflow-hidden bg-paper py-20 sm:py-28"
      aria-label="Skill to career"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold tracking-wide text-[#85631f]">{skillToCareer.heading}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              {skillToCareer.tagline}
            </h2>
          </RevealOnScroll>

          <RevealOnScroll delayMs={100}>
            <div className="perspective">
              <div
                className="tilt-card grid gap-3 rounded-3xl border border-line bg-white p-6 shadow-xl sm:grid-cols-2"
                style={{ transform: "rotate3d(-1, 1, 0, 2deg)" }}
              >
                {skillToCareer.themes.map((theme) => (
                  <div
                    key={theme}
                    className="rounded-xl bg-paper-dim px-4 py-3 text-sm font-medium text-ink-soft"
                  >
                    {theme}
                  </div>
                ))}
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  )
}
