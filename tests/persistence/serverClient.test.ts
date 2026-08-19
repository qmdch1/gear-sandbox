import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchServerLayout, saveServerLayout } from "../../src/persistence/serverClient";

afterEach(() => vi.unstubAllGlobals());

describe("serverClient", () => {
  it("fetches the single saved layout's gears from GET /api/layout", async () => {
    const gears = [{ id: "a", type: "spur" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ gears }) }));
    expect(await fetchServerLayout()).toEqual(gears);
  });

  it("saves the layout via PUT /api/layout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ updatedAt: "now" }) });
    vi.stubGlobal("fetch", fetchMock);
    await saveServerLayout([{ id: "a", type: "spur" } as any]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/layout",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("throws with the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "gears (array) is required" }) }),
    );
    await expect(saveServerLayout([])).rejects.toThrow("gears (array) is required");
  });
});
