import { Mail, MapPin, Phone, AtSign } from "lucide-react"
import { identity, contact } from "../data/academy"

export function Footer() {
  return (
    <footer id="contact" className="bg-navy-deep text-white/80">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <span className="font-display text-xl font-semibold text-white">
              {identity.name}
            </span>
            <p className="mt-2 text-sm text-gold-light">{identity.tagline}</p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
              A trusted educational and vocational training center committed to
              empowering students, women, and job seekers with practical skills
              and career guidance.
            </p>
          </div>

          <div>
            <h3 className="font-display text-base font-semibold text-white">Get in touch</h3>
            <ul className="mt-4 space-y-3 text-sm text-white/75">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 shrink-0 text-gold-light" size={18} aria-hidden />
                <span>{contact.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="shrink-0 text-gold-light" size={18} aria-hidden />
                <span>
                  {contact.phones.map((phone, i) => (
                    <span key={phone}>
                      <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-gold-light">
                        {phone}
                      </a>
                      {i < contact.phones.length - 1 && <span className="mx-2 text-white/30">/</span>}
                    </span>
                  ))}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="shrink-0 text-gold-light" size={18} aria-hidden />
                <a href={`mailto:${contact.email}`} className="hover:text-gold-light">
                  {contact.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <AtSign className="shrink-0 text-gold-light" size={18} aria-hidden />
                <span>{contact.instagram}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {identity.name}. All rights reserved.</p>
          <p>Learn. Grow. Achieve.</p>
        </div>
      </div>
    </footer>
  )
}
