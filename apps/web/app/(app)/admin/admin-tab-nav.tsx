"use client";

import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/scripts", label: "Scripts" },
  { href: "/admin/runs", label: "Runs" },
];

export function AdminTabNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-tabnav" aria-label="Admin">
      {tabs.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className={pathname.startsWith(tab.href) ? "admin-tab active" : "admin-tab"}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
