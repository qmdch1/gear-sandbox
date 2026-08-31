// Tracks whether the live layout has "unsaved changes" -- edits a save/export/server-sync
// would capture but hasn't yet -- so `main.ts` can warn before an accidental tab close loses
// them (see the `beforeunload` listener there).
//
// Deliberately a tiny, near-pure state machine (start clean, `markDirty()` flips it, any
// successful persist calls `markClean()`) kept in its own module rather than as inline
// module-level state in `main.ts`, for the same reason `frameSafety.ts`'s resilience logic
// lives apart from `main.ts`: `main.ts` wires up heavy side effects (DOM, three.js, the render
// loop) and isn't itself unit-tested, but the *rules* for when the layout counts as dirty are
// simple enough to verify directly, in isolation, without any of that machinery.
//
// `createDirtyTracker` returns a fresh, independent tracker (not shared module state) so tests
// can construct as many isolated instances as they like without leaking state between them --
// mirroring `createFrameRunner`'s reasoning exactly.

export interface DirtyTracker {
  /** True if the layout has changed since the last markClean() (or since creation). */
  isDirty(): boolean;
  /** Call whenever a save-worthy edit happens: a gear added/deleted/moved/axis-changed, or a
   *  remote link added. Idempotent -- calling it repeatedly while already dirty is a no-op. */
  markDirty(): void;
  /** Call after a successful save/export/server-sync (or a load/import, which establishes a
   *  new "saved" baseline). Idempotent -- calling it while already clean is a no-op. */
  markClean(): void;
}

export function createDirtyTracker(): DirtyTracker {
  let dirty = false;
  return {
    isDirty: () => dirty,
    markDirty: () => {
      dirty = true;
    },
    markClean: () => {
      dirty = false;
    },
  };
}
