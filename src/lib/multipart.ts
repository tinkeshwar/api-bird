import type { KV } from "./db.ts";

// A multipart/form-data body is stored as a JSON array of fields. File fields keep only the
// file name (value); the File itself is picked per send and never saved.
export type FormField = { key: string; value: string; file?: boolean };

export const isMultipart = (headers: KV[]) =>
  headers.some((h) => h.key.trim().toLowerCase() === "content-type" && h.value.trim().toLowerCase().startsWith("multipart/form-data"));

export function formFields(body: string): FormField[] {
  try {
    const v = JSON.parse(body);
    return Array.isArray(v) ? v.filter((f) => f && typeof f.key === "string" && typeof f.value === "string") : [];
  } catch {
    return [];
  }
}
