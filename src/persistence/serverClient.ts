import type { GearInstance } from "../sim/types";

async function parseOrThrow(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed with status ${res.status}`);
  return body;
}

/** The single saved layout on the server -- there's no per-user separation, so this
 *  always returns everything that's been saved (an empty array if nothing has). */
export async function fetchServerLayout(): Promise<GearInstance[]> {
  const body = await parseOrThrow(await fetch("/api/layout"));
  return body.gears;
}

/** Overwrites the single saved layout on the server with the given gears. */
export async function saveServerLayout(gears: GearInstance[]): Promise<void> {
  await parseOrThrow(
    await fetch("/api/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gears }),
    }),
  );
}
