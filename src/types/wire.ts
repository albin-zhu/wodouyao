export interface Wire {
  id: string;
  sourceId: string;
  targetId: string;
  /** Resource type: "io" (terminal↔terminal), "note", "file", "team", or unset for legacy. */
  kind?: string;
}
