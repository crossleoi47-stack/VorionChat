import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vorion Systems — Secure Messaging",
  description: "Company-controlled business messaging. Client contact details stay with the company.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
