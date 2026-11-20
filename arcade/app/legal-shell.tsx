import type { ReactNode } from "react";

export default function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="legal-page">
    <header className="site-header">
      <a href="/" className="brand" aria-label="Golden Spatula Arcade home"><img className="brand-logo" src="/golden-spatula-logo.png" alt="" /><strong>ARCADE</strong></a>
      <span className="header-pill">GOLDEN CREATOR</span>
    </header>
    <main className="legal-content">
      <a className="legal-back" href="/">← BACK TO ARCADE</a>
      <span className="overline">GOLDEN CREATOR / LEGAL</span>
      <h1>{title}</h1>
      <p className="legal-date">Effective November 20, 2026</p>
      {children}
    </main>
    <footer>
      <span className="brand"><img className="brand-logo" src="/golden-spatula-logo.png" alt="" /><strong>ARCADE</strong></span>
      <nav className="footer-links" aria-label="Legal"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav>
    </footer>
  </div>;
}
