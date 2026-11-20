import { DiscordSDK } from "@discord/embedded-app-sdk";

type SignInResult = { needsGameId: boolean; name: string; discordId: string };

export async function connectDiscordActivity(clientId: string): Promise<{ sdk: DiscordSDK; player: SignInResult }> {
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
  const response = await fetch("/api/discord-entry", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Arcade-Activity": "1" },
    body: JSON.stringify({ code }), cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not sign in with Discord.");
  const auth = await sdk.commands.authenticate({ access_token: result.accessToken });
  if (!auth || auth.user?.id !== result.discordId) throw new Error("Discord account verification did not match. Reopen the Activity.");
  return { sdk, player: { needsGameId: result.needsGameId, name: result.name, discordId: result.discordId } };
}
