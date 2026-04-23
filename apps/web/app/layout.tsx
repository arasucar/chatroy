import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "roy",
  description: "Phase 1 web shell for the invite-only AI chatbot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
