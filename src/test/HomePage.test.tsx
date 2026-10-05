import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { HomePage } from "../pages/HomePage"

describe("HomePage", () => {
  it("renders the hero headline and does not render a login form", () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    )
    expect(screen.getByText("Be a part of our academy!")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it("includes the placement disclaimer rather than a guarantee", () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    )
    expect(screen.getByText(/depend on company requirements/i)).toBeInTheDocument()
  })

  it("renders the academy's actual contact details in the footer", () => {
    render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>,
    )
    expect(screen.getByText("80152 73047")).toBeInTheDocument()
    expect(screen.getByText("77087 08791")).toBeInTheDocument()
    expect(screen.getByText(/Srivilliputhur/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "joabacademy@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:joabacademy@gmail.com",
    )
  })
})
