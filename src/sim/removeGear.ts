import type { GearInstance, RemoteLink } from "./types";

/** Pure removal logic for deleting a single gear from the layout: drops the gear itself
 *  and any remote link (chain/belt) that references its id as either endpoint, so a
 *  dangling link pointing at a since-deleted gear never survives into the next tick or
 *  the next `sceneSync.sync()` call. Returns fresh arrays; does not mutate the inputs. */
export function removeGear(
  id: string,
  gears: GearInstance[],
  remoteLinks: RemoteLink[],
): { gears: GearInstance[]; remoteLinks: RemoteLink[] } {
  return {
    gears: gears.filter((g) => g.id !== id),
    remoteLinks: remoteLinks.filter((link) => link.a !== id && link.b !== id),
  };
}
