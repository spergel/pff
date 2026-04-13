"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  key: string;
}

export function Sidebar({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-52 flex-col border-r-2 border-gray-600 bg-gray-300 lg:flex">
      {/* Logo */}
      <div className="border-b-2 border-gray-600 bg-gray-400 px-5 py-4">
        <div className="font-mono text-sm font-bold tracking-widest text-blue-900 uppercase">
          PFF Tracker
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-gray-700">
          preferred · flow · monitor
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {nav.map((n) => {
          const [navPath, navQuery] = n.href.split("?");
          const navParams = new URLSearchParams(navQuery ?? "");
          // Active if pathname matches AND all nav query params match current URL
          const pathMatch = pathname === navPath;
          const paramMatch = Array.from(navParams.entries()).every(
            ([k, v]) => searchParams.get(k) === v
          );
          const isActive = pathMatch && (navParams.size === 0 || paramMatch);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center px-3 py-2 text-sm border ${
                isActive
                  ? "bg-white text-gray-900 border-gray-600 font-bold"
                  : "border-transparent text-gray-700 hover:bg-gray-200 hover:text-gray-900"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t-2 border-gray-600 bg-gray-400 px-5 py-3">
        <div className="font-mono text-[10px] text-gray-700">PFF · PGX · FPE · PFFA</div>
      </div>
    </aside>
  );
}
