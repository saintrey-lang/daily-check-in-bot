import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Spatula Arcade",
  description: "Golden Spatula Crosswords and Puzzle. Play, finish, and share your score with the community.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
