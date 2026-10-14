"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Board"],
  ["/tape", "Tape"],
  ["/gate", "Gate"],
  ["/steer", "Steer"],
  ["/settings", "Levels"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login") return <>{children}</>;
  return (
    <div className="desk">
      {children}
      <nav className="nav" aria-label="Dispatch">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
