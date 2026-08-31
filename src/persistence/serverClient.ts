import type { LayoutState } from "../sim/types";

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
  return parseOrThrow(await fetch(`/api/layouts/${id}`));
}

export async function saveNewServerLayout(name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch("/api/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks }),
    }),
  );
}

export async function updateServerLayout(id: string, name: string, layout: LayoutState): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch(`/api/layouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears: layout.gears, remoteLinks: layout.remoteLinks }),
    }),
  );
}

export async function deleteServerLayout(id: string): Promise<void> {
  await parseOrThrow(await fetch(`/api/layouts/${id}`, { method: "DELETE" }));
}
