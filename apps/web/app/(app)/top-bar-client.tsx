"use client";

import { usePathname } from "next/navigation";

function navClass(pathname: string, href: string) {
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  return active ? "tp-nav-link active" : "tp-nav-link";
}

export function TopBarClient({
  userEmail,
  isAdmin,
  logoutAction,
}: {
  userEmail: string;
  isAdmin: boolean;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <header className="tp-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 24, height: "100%" }}>
        <span className="tp-wordmark">CHATROY</span>
        <nav className="tp-topbar-nav" aria-label="Primary">
          <a href="/dashboard" className={navClass(pathname, "/dashboard")}>
            Threads
          </a>
          {isAdmin && (
            <a href="/admin/scripts" className={navClass(pathname, "/admin")}>
              Admin
            </a>
          )}
          <a href="/settings" className={navClass(pathname, "/settings")}>
            Settings
          </a>
        </nav>
      </div>
      <div className="tp-topbar-end">
        <span className="tp-user-email">{userEmail}</span>
        <form action={logoutAction}>
          <button className="tp-btn tp-btn-ghost tp-btn-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
