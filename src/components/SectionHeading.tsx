type SectionHeadingProps = {
  kicker?: string
  title: string
  intro?: string
  align?: "left" | "center"
  tone?: "dark" | "light"
}

/**
 * Shared section heading. Deliberately not an all-caps tracked eyebrow —
 * the kicker (when present) is a small gold label in sentence case, used
 * only where it adds real wayfinding value.
 */
export function SectionHeading({
  kicker,
  title,
  intro,
  align = "left",
  tone = "dark",
}: SectionHeadingProps) {
  const alignCls = align === "center" ? "text-center mx-auto" : "text-left"
  const titleTone = tone === "dark" ? "text-ink" : "text-white"
  const introTone = tone === "dark" ? "text-slate" : "text-white/70"

  return (
    <div className={`max-w-2xl ${alignCls}`}>
      {kicker && (
        <p className={`mb-3 text-sm font-semibold tracking-wide ${tone === "dark" ? "text-[#85631f]" : "text-gold-light"}`}>{kicker}</p>
      )}
      <h2 className={`font-display text-3xl sm:text-4xl font-semibold leading-tight ${titleTone}`}>
        {title}
      </h2>
      {intro && <p className={`mt-4 text-base leading-relaxed ${introTone}`}>{intro}</p>}
    </div>
  )
}
