import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Spatula | Campaign Dashboard",
  description: "Manage daily check-ins and Starplayer submissions for Golden Spatula.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
