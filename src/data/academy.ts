// Single source of truth for JOAB Academy content.
// Most fields below come directly from the brochure content supplied in
// the Phase 1 brief. The `contact` block is an exception: those details
// were supplied directly by the client in a follow-up message, not from
// an uploaded brochure file — see the note on that export below.
// Nothing in this file is invented; where a fact wasn't supplied, the
// field is left absent rather than filled with a placeholder value.

export const identity = {
  name: "JOAB Academy",
  tagline: "Learn, Grow, Achieve",
  heroLine: "Be a part of our academy!",
}

export const about = {
  body:
    "JOAB Academy is a trusted educational and vocational training center committed to empowering students, women, and job seekers with practical skills and career guidance.",
}

export const vision = {
  statement:
    "To make quality, practical education accessible and affordable for every individual, regardless of background or income.",
}

export const missionThemes = [
  "Community awareness programs & workshops",
  "Government-certified Skill India & TNSDC courses",
  "MSME & CSR skill development programs",
  "Career counselling & future guidance",
  "Industry-ready practical training",
  "Free coaching for women & underprivileged youth",
]

// Program/training-area names only. The brief lists these as category
// names without supplied descriptive copy, so no description text is
// added here — inventing descriptive claims (e.g. "career-ready",
// "industrial", "manufacturing roles") would introduce facts the source
// doesn't support.
export const programs = [
  { name: "Skill Trained Courses" },
  { name: "Computer Based Courses" },
  { name: "Solar PV Installation" },
  { name: "Credit Processing Officer" },
  { name: "Assembly Line Operator" },
  { name: "Skill Train Camps" },
  { name: "Awareness Programme" },
  { name: "Career Guidance" },
  { name: "Skill-to-Career Programme" },
]

export const impact = [
  { value: 1000, suffix: "+", label: "Free Education" },
  { value: 450, suffix: "+", label: "Coaching with Stipend" },
  { value: 600, suffix: "+", label: "Placement Support" },
  { value: 150, suffix: "+", label: "Slow Learner Tutorial" },
  { value: 250, suffix: "+", label: "Woman Empowerment" },
  { value: 15, suffix: "+", label: "Skill Based Entrepreneurs" },
]

export const journey = [
  {
    title: "First-Prize Laptop Support",
    body:
      "50 financially disadvantaged students were trained, including a reported first-prize laptop support story.",
  },
  {
    title: "Solar PV Installation",
    body: "60+ students trained in Solar PV Installation, with reported placements.",
  },
  {
    title: "Credit Processing Officer",
    body: "150+ students trained in Credit Processing Officer courses, with reported placements.",
  },
  {
    title: "Assembly Line Operator",
    body: "60+ students trained as Assembly Line Operators, with reported placements.",
  },
  {
    title: "Free Tuition Program",
    body: "An ongoing Free Tuition Program with reported academic results.",
  },
]

export const placementPartners = [
  { name: "Royal Enfield", logo: "/partners/royal-enfield.svg" },
  { name: "Randstad", logo: "/partners/randstad.svg" },
  { name: "HDB Financial Services", logo: "/partners/hdb-financial-services.svg" },
  { name: "HDFC Bank", logo: "/partners/hdfc-bank.svg" },
  { name: "InCred Finance", logo: "/partners/incred.jpg" },
]

export const placementDisclaimer =
  "Placement opportunities depend on company requirements, candidate eligibility, the selection process, and availability of vacancies."

export const skillToCareer = {
  heading: "Skill to Career",
  tagline: "Creating opportunities. Building futures.",
  themes: [
    "Education for Everyone",
    "Awareness Programs",
    "Skill Development",
    "Skill-to-Career Programs",
    "Skill Train Camps",
    "MSME & Skill Development Projects",
    "CSR Partnerships",
  ],
}

export const promises = [
  "Equal Access to Education",
  "Practical Skill Development",
  "Career Opportunities",
  "Continuous Learning",
  "Student-Centred Support",
  "Responsible Partnerships",
]

export const nav = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Courses", href: "#programs" },
  { label: "Our Impact", href: "#impact" },
  { label: "Placement", href: "#placement" },
  { label: "Skill to Career", href: "#skill-to-career" },
  { label: "Contact", href: "#contact" },
]

export const seo = {
  title: "JOAB Academy — Learn, Grow, Achieve",
  description:
    "JOAB Academy is a trusted educational and vocational training center committed to empowering students, women, and job seekers with practical skills and career guidance.",
}

// Contact details as supplied directly by the client in a chat message —
// not from an uploaded brochure file (none has been provided). No field
// here is inferred, guessed, or filled in; every value below was given
// verbatim and is used as-is.
export const contact = {
  address: "176, JOAB Academy, Ramakrishnapuram, Madurai Main Road, Srivilliputhur, Virudhunagar - 626 125",
  phones: ["80152 73047", "77087 08791"],
  email: "joabacademy@gmail.com",
  instagram: "@Joabacademy",
}
