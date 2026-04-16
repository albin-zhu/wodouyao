export interface PaletteCommand {
  id: string;
  label: string;
  category: CommandCategory;
  keywords: string[];
  shortcut?: string;
  execute: (args?: string) => void;
}

export type CommandCategory = "terminal" | "layout" | "workspace" | "navigation";
