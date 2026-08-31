import type { RemoteLink } from "./types";

/** A remote link (chain/belt) is an unordered pair -- `{a: x, b: y}` and `{a: y, b: x}`
 *  describe the same physical connection -- so "is this link already present" must match
 *  on `kind` plus the pair in either order, not on `a`/`b` positionally. Shared by
 *  `main.ts`'s live "connect mode" UI (reject a duplicate before it's ever created) and
 *  `persistence/serialize.ts`'s `dedupeRemoteLinks` (drop duplicates already present in a
 *  loaded save file), so the two can't silently diverge on what counts as a duplicate. */
export function wouldDuplicateLink(link: RemoteLink, existing: RemoteLink[]): boolean {
  return existing.some(
    (other) =>
      other.kind === link.kind &&
      ((other.a === link.a && other.b === link.b) || (other.a === link.b && other.b === link.a)),
  );
}
