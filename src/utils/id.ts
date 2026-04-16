import { nanoid } from "nanoid";

export function generateId(prefix = "t"): string {
  return `${prefix}_${nanoid(8)}`;
}
