/** A role definition loaded from `~/.wodouyao/roles/<key>.md` (frontmatter
 *  metadata + markdown body as the system prompt). Mirrors the Rust
 *  `roles::Role` struct. */
export interface Role {
  key: string;
  name: string;
  glyph: string;
  color: string;
  hint: string;
  order: number;
  prompt: string;
  /** "user" — read from ~/.wodouyao/roles/. (Bundled defaults are seeded
   *  into the user dir on first launch; we never expose the bundle path.) */
  source: string;
}
