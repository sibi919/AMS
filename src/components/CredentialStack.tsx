/** Photos are pixel-preserving WebP exports of embedded brochure images. */
export function CredentialStack() {
  return (
    <div className="hero-photo-scene perspective" aria-label="JOAB Academy brochure photographs">
      <figure className="hero-photo hero-photo-main">
        <img src="/brochure/classroom.webp" alt="JOAB Academy students in a classroom" width="800" height="600" fetchPriority="high" />
        <figcaption>Learning together <span>01 / JOAB Academy</span></figcaption>
      </figure>
      <figure className="hero-photo hero-photo-side">
        <img src="/brochure/solar-training.webp" alt="Students taking part in a JOAB Academy solar training session" width="480" height="320" loading="lazy" />
        <figcaption>Skills in action</figcaption>
      </figure>
      <figure className="hero-photo hero-photo-bottom">
        <img src="/brochure/community-group.webp" alt="JOAB Academy community group pictured in the brochure" width="800" height="361" loading="lazy" />
        <figcaption>Our community</figcaption>
      </figure>
      <div className="hero-photo-orbit" aria-hidden="true" />
    </div>
  )
}
