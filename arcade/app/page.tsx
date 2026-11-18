import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import Arcade from "./arcade-client";
import EntryGate from "./entry-gate";

export const dynamic = "force-dynamic";

export default async function Page() {
  const gameId = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  return gameId ? <Arcade gameId={gameId} /> : <EntryGate />;
}
