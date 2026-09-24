import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Check-In | Bot Dashboard",
  description: "Manage Discord daily codes, embed messages, attachments and check-in progress.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
