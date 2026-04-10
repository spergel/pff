import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/src/components/Sidebar";

const nav = [
  { href: "/", label: "Dashboard", key: "D" },
  { href: "/holdings", label: "Holdings", key: "H" },
  { href: "/predictions", label: "Predictions", key: "P" },
  { href: "/flows", label: "Flows & Trends", key: "F" },
  { href: "/security", label: "Lookup", key: "L" },
];

export const metadata: Metadata = {
  title: "Preferred Securities Flow Tracker",
  description: "Daily flow monitor for preferred ETFs: PFF, PGX, FPE",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Mobile top nav */}
        <header className="sticky top-0 z-50 border-b-2 border-gray-600 bg-gray-300 lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div>
              <span className="font-mono text-xs font-bold tracking-widest text-blue-900 uppercase">
                PFF
              </span>
              <span className="ml-1.5 font-mono text-xs text-gray-600">
                preferred flow tracker
              </span>
            </div>
            <nav className="ml-auto flex gap-0.5 flex-wrap">
              {nav.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="px-2.5 py-1 text-xs text-gray-700 border border-gray-500 hover:bg-gray-200 hover:text-gray-900"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        {/* Desktop sidebar */}
        <Sidebar nav={nav} />

        {/* Main content */}
        <main className="lg:ml-52 px-4 py-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
