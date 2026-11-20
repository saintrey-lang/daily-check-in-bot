"use client";

import { useEffect, useState } from "react";
import { connectDiscordActivity } from "./discord-auth-client";

export default function DiscordActivityBridge() {
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (window.parent === window || !window.location.hostname.endsWith(".discordsays.com")) return;
    document.documentElement.classList.add("discord-activity");
    // Discord supplies these values on launch; the SDK needs them on every full-page navigation.
    const launchQuery = new URLSearchParams(window.location.search);
    const launchKeys = ["frame_id", "instance_id", "platform", "custom_id", "referrer_id", "guild_id", "channel_id", "location_id", "mobile_app_version"];
    const preserveContext = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || !launchQuery.get("frame_id")) return;
      const destination = new URL(link.href);
      if (destination.origin !== window.location.origin) return;
      for (const key of launchKeys) {
        const value = launchQuery.get(key);
        if (value && !destination.searchParams.has(key)) destination.searchParams.set(key, value);
      }
      link.href = destination.toString();
    };
    document.addEventListener("click", preserveContext, true);
    if (window.location.pathname !== "/") return () => document.removeEventListener("click", preserveContext, true);
    if (document.querySelector("[data-entry-gate]")) return () => document.removeEventListener("click", preserveContext, true);
    setVerifying(true);
    document.documentElement.classList.add("discord-activity-verifying");
    let alive = true;
    let close: (() => void) | undefined;
    async function connect() {
      try {
        setError("");
        const response = await fetch("/api/activity-config", { cache: "no-store" });
        if (!response.ok) throw new Error("Application ID is missing.");
        const { clientId, oauthEnabled } = await response.json();
        const { DiscordSDK, RPCCloseCodes } = await import("@discord/embedded-app-sdk");
        const sdk = oauthEnabled ? (await connectDiscordActivity(clientId)).sdk : new DiscordSDK(clientId);
        if (!oauthEnabled) await sdk.ready();
        if (!alive) return;
        if (oauthEnabled) {
          // Recheck the current Discord account on every Activity launch, even if a session cookie already exists.
          // connectDiscordActivity sets a fresh cookie; check it against the server-rendered player before play resumes.
          const result = await fetch("/api/discord-session", { cache: "no-store" });
          const player = await result.json();
          const current = document.querySelector("[data-arcade-discord-id]");
          if (!result.ok || !current || current.getAttribute("data-arcade-discord-id") !== player.discordId ||
              current.getAttribute("data-arcade-player-name") !== player.name) {
            window.location.reload();
            return;
          }
          document.documentElement.classList.remove("discord-activity-verifying");
          setVerifying(false);
        }
        if (!oauthEnabled) { document.documentElement.classList.remove("discord-activity-verifying"); setVerifying(false); }
        close = () => sdk.close(RPCCloseCodes.CLOSE_NORMAL, "Player left the arcade");
        window.addEventListener("arcade:close", close);
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : "Discord could not start the activity.");
      }
    }
    connect();
    return () => { alive = false; document.removeEventListener("click", preserveContext, true); if (close) window.removeEventListener("arcade:close", close); };
  }, [attempt]);
  return <>{verifying && <div className="activity-verifying" role="status">{error ? <>Discord sign-in: {error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>TRY AGAIN</button></> : "Checking your Discord account…"}</div>}{error && !verifying && <div className="activity-error" role="alert">Discord Activity could not connect: {error}</div>}</>;
}
