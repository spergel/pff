import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preferred Securities Flow Tracker",
  description: "Daily flow monitor for preferred ETFs: PFF, PGX, FPE",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/overlap", label: "Cross-ETF" },
  { href: "/predictions", label: "Predictions" },
  { href: "/holdings", label: "Holdings" },
  { href: "/flows", label: "Flow History" },
  { href: "/trends", label: "Trends" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-screen-xl items-center gap-8 px-6 py-4">
            <div>
              <h1 className="text-base font-bold tracking-tight">
                Preferred Securities Flow Tracker
              </h1>
              <p className="text-xs text-slate-500">
                PFF · PGX · FPE · Daily Flow Monitor
              </p>
            </div>
            <nav className="flex gap-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-screen-xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
