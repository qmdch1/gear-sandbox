// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerSyncPanel } from "../../src/ui/serverSyncPanel";
import * as serverClient from "../../src/persistence/serverClient";

describe("ServerSyncPanel", () => {
  beforeEach(() => {
    vi.spyOn(serverClient, "listServerLayouts").mockResolvedValue([{ id: "1", name: "saved-a", updatedAt: "t1" }]);
  });

  it("renders the server layout list on construction", async () => {
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout: () => {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toContain("saved-a");
  });

  it("applies the fetched gears when a saved layout's load button is clicked", async () => {
    vi.spyOn(serverClient, "fetchServerLayout").mockResolvedValue({
      id: "1", name: "saved-a", updatedAt: "t1", gears: [{ id: "g" } as unknown as import("../../src/sim/types").GearInstance], remoteLinks: [],
    });
    const applyLoadedLayout = vi.fn();
    const container = document.createElement("div");
    new ServerSyncPanel(container, { getLayout: () => ({ gears: [], remoteLinks: [] }), applyLoadedLayout });
    await Promise.resolve();
    await Promise.resolve();
    (container.querySelector("li button") as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(applyLoadedLayout).toHaveBeenCalledWith({ id: "1", name: "saved-a", updatedAt: "t1", gears: [{ id: "g" }], remoteLinks: [] });
  });
});
