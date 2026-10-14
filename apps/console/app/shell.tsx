"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeHub } from "../hub/client";

const LINKS = [
  ["/", "Board"],
  ["/tape", "Log"],
  ["/gate", "Approve"],
  ["/steer", "Notes"],
  ["/settings", "Access"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [down, setDown] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => subscribeHub(setDown), []);

  useEffect(() => {
    const saved = window.localStorage.getItem("hackswarm-theme");
    const next = saved === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("hackswarm-theme", next);
  }

  const toggle = (
    <button className="theme-toggle" type="button" onClick={toggleTheme}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );

  if (path === "/login") {
    return (
      <>
        {toggle}
        {children}
      </>
    );
  }

  return (
    <div className="desk">
      {toggle}
      {down ? (
        <p className="banner">
          The desk hub is not running. On the PC, start the API, then refresh this page.
        </p>
      ) : null}
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
