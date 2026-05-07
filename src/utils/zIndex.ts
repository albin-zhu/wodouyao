/** Shared monotonic z-index allocator for canvas nodes (terminals,
 *  notes, file_nodes, task_boards). Lets `bringToFront` from any store
 *  pull the node above every other node in any other store — without
 *  this, each store maintained its own counter and cross-store ordering
 *  was undefined, which is why terminals always covered notes etc.
 *
 *  Initial state is set lazily from whatever the syncFromRust calls feed
 *  in via `seed(maxZ)` so reloading a workspace doesn't reset ordering. */

let counter = 1;

export function getNextZ(): number {
  return counter++;
}

/** Bump the allocator if the supplied value is higher than the current
 *  watermark. Called from each store's `syncFromRust` after loading an
 *  on-disk slice so new bringToFront calls always win against persisted
 *  layouts. Idempotent and safe to call repeatedly. */
export function seed(maxZ: number): void {
  if (Number.isFinite(maxZ) && maxZ >= counter) {
    counter = maxZ + 1;
  }
}

/** Test/debug helper. */
export function _peek(): number {
  return counter;
}
