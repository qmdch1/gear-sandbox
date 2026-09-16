import type { LayoutState } from "../sim/types";
import { validateLayout } from "./serialize";

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LayoutDetail extends LayoutSummary, LayoutState {}

async function parseOrThrow(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed with status ${res.status}`);
  return body;
}

export async function listServerLayouts(): Promise<LayoutSummary[]> {
  return parseOrThrow(await fetch("/api/layouts"));
}

export async function fetchServerLayout(id: string): Promise<LayoutDetail> {
  const body = await parseOrThrow(await fetch(`/api/layouts/${id}`));
  // The server's own validation (isValidGearsArray/isValidRemoteLinksArray) guards what gets
  // written, but this is the client's own load-boundary gate -- the same one loadFromLocalStorage
  // and importFromFile already pass every load through via deserializeLayout/validateLayout.
  // Without it, a stored row from before the validator existed, a manually-edited DB, or a
  // duplicate RemoteLink the server's write-side check doesn't catch (it checks shape, not
  // duplication) would flow straight into live sim/render state unchecked.
  // `vehicles` is taken from the validated result for the same reason the other two fields are.
  // Dropping it here was one of THREE places the server round-trip silently lost a car: the
  // send below omitted it, the server stored only { gears, remoteLinks }, and this destructure
  // discarded whatever did come back. A layout that survived all three came back as gears still
  // carrying `ridesOn`, riding a vehicle that no longer existed.
  const { gears, remoteLinks, vehicles } = validateLayout(body);
  return { id: body.id, name: body.name, updatedAt: body.updatedAt, gears, remoteLinks, vehicles };
}

export async function saveNewServerLayout(name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch("/api/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks, vehicles: layout.vehicles }),
    }),
  );
}

export async function updateServerLayout(id: string, name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch(`/api/layouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks, vehicles: layout.vehicles }),
    }),
  );
}

export async function deleteServerLayout(id: string): Promise<void> {
  await parseOrThrow(await fetch(`/api/layouts/${id}`, { method: "DELETE" }));
}
