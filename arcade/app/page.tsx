import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import Arcade from "./arcade-client";
import EntryGate from "./entry-gate";

export const dynamic = "force-dynamic";

export default async function Page() {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  return player ? <Arcade gameId={player.gameId} playerName={player.name} /> : <EntryGate />;
}
