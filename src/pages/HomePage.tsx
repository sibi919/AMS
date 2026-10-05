import { Header } from "../components/Header"
import { Footer } from "../components/Footer"
import { Hero } from "../sections/Hero"
import { About } from "../sections/About"
import { VisionMission } from "../sections/VisionMission"
import { Programs } from "../sections/Programs"
import { Impact } from "../sections/Impact"
import { Journey } from "../sections/Journey"
import { Placement } from "../sections/Placement"
import { SkillToCareer } from "../sections/SkillToCareer"
import { Promises } from "../sections/Promises"

export function HomePage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" className="public-experience">
        <Hero />
        <About />
        <VisionMission />
        <Programs />
        <Impact />
        <Journey />
        <Placement />
        <SkillToCareer />
        <Promises />
      </main>
      <Footer />
    </>
  )
}
