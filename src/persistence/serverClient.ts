import type { GearInstance } from "../sim/types";

export interface LayoutSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface LayoutDetail extends LayoutSummary {
  gears: GearInstance[];
}

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

export async function saveNewServerLayout(name: string, gears: GearInstance[]): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch("/api/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears }),
    }),
  );
}

export async function updateServerLayout(id: string, name: string, gears: GearInstance[]): Promise<LayoutSummary> {
  return parseOrThrow(
    await fetch(`/api/layouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gears }),
    }),
  );
}
