"use client";

import { useEffect, useState } from "react";

export default function DiscordActivityBridge() {
  const [error, setError] = useState("");
  useEffect(() => {
    if (window.parent === window || !window.location.hostname.endsWith(".discordsays.com")) return;
    document.documentElement.classList.add("discord-activity");
    let alive = true;
    let close: (() => void) | undefined;
    async function connect() {
      try {
        const response = await fetch("/api/activity-config");
        if (!response.ok) throw new Error("Application ID is missing.");
        const { clientId } = await response.json();
        const { DiscordSDK, RPCCloseCodes } = await import("@discord/embedded-app-sdk");
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        if (!alive) return;
        close = () => sdk.close(RPCCloseCodes.CLOSE_NORMAL, "Player left the arcade");
        window.addEventListener("arcade:close", close);
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : "Discord could not start the activity.");
      }
    }
    connect();
    return () => { alive = false; if (close) window.removeEventListener("arcade:close", close); };
  }, []);
  return error ? <div className="activity-error" role="alert">Discord Activity could not connect: {error}</div> : null;
}
