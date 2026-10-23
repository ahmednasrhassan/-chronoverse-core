"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "@/config/institutionalNavigation";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header
      className="cv-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isMenuOpen) {
          setIsMenuOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="cv-header-inner cv-container">
        <Link
          href="https://chronoversecapital.com/"
          aria-label="Chronoverse Capital home"
          className="cv-brand"
          onClick={() => setIsMenuOpen(false)}
        >
          <Image
            src="/icon.png"
            alt=""
            width={42}
            height={42}
            loading="eager"
          />
          <span>
            <span className="cv-wordmark">
              CHRONOVERSE <span>CAPITAL</span>
            </span>
            <span className="cv-brand-caption">Independent by design</span>
          </span>
        </Link>
        <nav className="cv-desktop-nav" aria-label="Primary navigation">
          <ul>
            {PUBLIC_PRIMARY_NAV_V1.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="cv-header-actions">
          {PUBLIC_ACCOUNT_NAV_V1.map((item) => (
            <Link className="cv-account-link" href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
          <Link
            className="cv-header-contact"
            href="https://chronoversecapital.com/contact"
          >
            Let’s talk <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <button
          ref={toggle}
          type="button"
          className="cv-menu-toggle"
          aria-label={
            isMenuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <span>{isMenuOpen ? "Close" : "Menu"}</span>
          <span className="cv-menu-icon" aria-hidden="true">
            {isMenuOpen ? "×" : "☰"}
          </span>
        </button>
      </div>
      {isMenuOpen ? (
        <nav
          id="mobile-navigation"
          className="cv-mobile-nav cv-container"
          aria-label="Mobile navigation"
        >
          <ul>
            {[
              ...PUBLIC_PRIMARY_NAV_V1,
              ...PUBLIC_ACCOUNT_NAV_V1,
              {
                label: "Contact",
                href: "https://chronoversecapital.com/contact",
              },
            ].map((item) => (
              <li key={item.label}>
                <Link href={item.href} onClick={() => setIsMenuOpen(false)}>
                  {item.label}
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
