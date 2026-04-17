import type { Team } from "../types/team";
import type { TerminalNode } from "../types/terminal";

// Horizontal gap between sibling terminals.
const H_GAP = 60;
// Vertical gap between the lead row and the worker row.
const V_GAP = 120;

interface Positioned {
  id: string;
  position: { x: number; y: number };
}

/**
 * Slot the next worker about to be added to a team, keeping already-placed
 * workers fixed (no rebalancing). Used when `spawn --team` lands a new
 * terminal — we want predictable, stable placement.
 *
 * Layout: workers extend horizontally to the right of the lead, starting
 * under the lead's column, then +1 spacing, +2 spacing, etc.
 */
export function nextWorkerSlot(
  lead: TerminalNode,
  existingWorkerCount: number
): { x: number; y: number } {
  const width = lead.size.width;
  const height = lead.size.height;
  const x = lead.position.x + existingWorkerCount * (width + H_GAP);
  const y = lead.position.y + height + V_GAP;
  return { x, y };
}

/**
 * Full rebalanced star layout: lead anchored, workers centered below, observers
 * on a second row. Returns only terminals whose position should change.
 */
export function starLayout(team: Team, terminals: Map<string, TerminalNode>): Positioned[] {
  const lead = team.members.find((m) => m.role === "lead");
  if (!lead) return [];
  const leadNode = terminals.get(lead.term_id);
  if (!leadNode) return [];

  const width = leadNode.size.width;
  const height = leadNode.size.height;
  const lx = leadNode.position.x;
  const ly = leadNode.position.y;
  const leadCenter = lx + width / 2;

  const workers = team.members
    .filter((m) => m.role === "worker")
    .map((m) => m.term_id)
    .filter((id) => terminals.has(id));
  const observers = team.members
    .filter((m) => m.role === "observer")
    .map((m) => m.term_id)
    .filter((id) => terminals.has(id));

  const placements: Positioned[] = [];

  const rowLayout = (ids: string[], rowY: number) => {
    const n = ids.length;
    if (n === 0) return;
    const totalWidth = n * width + (n - 1) * H_GAP;
    const firstX = leadCenter - totalWidth / 2;
    ids.forEach((id, i) => {
      placements.push({
        id,
        position: { x: firstX + i * (width + H_GAP), y: rowY },
      });
    });
  };

  rowLayout(workers, ly + height + V_GAP);
  rowLayout(observers, ly + 2 * (height + V_GAP));
  return placements;
}
