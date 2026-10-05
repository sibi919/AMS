import { identity } from "../data/academy"
import { CredentialStack } from "../components/CredentialStack"

export function Hero() {
  return (
    <section
      id="home"
      className="hero-stage relative overflow-hidden bg-navy-deep"
      aria-label="Introduction"
    >
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-navy-light/40 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-gold/10 blur-3xl"
        aria-hidden
      />

      <div className="hero-content relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="text-sm font-semibold tracking-wide text-gold-light">
            {identity.tagline}
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl">
            {identity.heroLine}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
            Practical education, skill development, and career guidance for
            students, women, and job seekers — built to be accessible
            regardless of background or income.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="#programs"
              className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-navy-deep transition-transform hover:-translate-y-0.5 hover:shadow-lg"
            >
              Explore our courses
            </a>
            <a
              href="#about"
              className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-gold-light hover:text-gold-light"
            >
              Learn about us
            </a>
          </div>
        </div>

        <CredentialStack />
      </div>
    </section>
  )
}
