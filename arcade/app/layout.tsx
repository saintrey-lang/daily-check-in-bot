import type { Metadata } from "next";
import "./globals.css";
import DiscordActivityBridge from "./discord-activity-bridge";

export const metadata: Metadata = {
  title: "Golden Spatula Arcade",
  description: "Golden Spatula Crosswords and Puzzle. Play, finish, and share your score with the community.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DiscordActivityBridge />{children}</body></html>;
}
