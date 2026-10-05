import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { Header } from "../components/Header"

describe("Header", () => {
  it("renders the academy name and a Login link to the portal placeholder", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    )
    expect(screen.getByText("JOAB Academy")).toBeInTheDocument()
    const loginLinks = screen.getAllByRole("link", { name: "Login" })
    expect(loginLinks.length).toBeGreaterThan(0)
    expect(loginLinks[0]).toHaveAttribute("href", "/login")
  })
})
