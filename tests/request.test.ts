import { describe, expect, it } from "vitest";
import { POST as startEvent } from "../app/api/start/route";
import { POST as saveSettings } from "../app/api/settings/route";

describe("dashboard mutations", () => {
  it("rejects cross-site submissions before accessing the Sheet", async () => {
    for (const action of [startEvent, saveSettings]) {
      const request = new Request("https://dashboard.example.com/api/action", {
        method: "POST", headers: { origin: "https://another-site.example" },
      });
      const response = await action(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Invalid request origin." });
    }
  });
});
