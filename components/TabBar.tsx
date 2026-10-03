"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/network", label: "Network" },
  { href: "/companies", label: "Companies" },
  { href: "/government", label: "Government" },
  { href: "/algorithm", label: "Algorithm" },
] as const;

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="border-b border-line bg-canvas">
      <ul className="mx-auto flex w-full max-w-[1920px] gap-1 px-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                data-label={tab.label}
                // The hidden ::after copy reserves the semibold width so tabs don't shift when activated.
                className={`-mb-px flex flex-col border-b-2 px-3 py-3 text-sm outline-none after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted hover:border-line hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
