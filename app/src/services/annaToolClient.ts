import type { Note, NotesSummary } from "../types/note";
import "../types/anna-runtime";

const TOOL_ID = "tool-dev-mini-notes";
const METHOD = "summarize_notes";

interface PlainNote {
  id: string;
  content: string;
  order: number;
  createdAt: string;
}

function toPlainNotes(notes: Note[]): PlainNote[] {
  return notes.map((note) => ({
    id: String(note.id),
    content: String(note.content),
    order: Number(note.order),
    createdAt: String(note.createdAt),
  }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotesSummary(value: unknown): value is NotesSummary {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.summary === "string" &&
    typeof value.count === "number" &&
    Array.isArray(value.categories)
  );
}

export async function summarizeNotes(notes: Note[]): Promise<NotesSummary> {
  if (!window.AnnaAppRuntime) {
    throw new Error(
      "AnnaAppRuntime is not available. Please run this app with anna-app dev."
    );
  }

  const anna = await window.AnnaAppRuntime.connect();

  if (!anna.tools?.invoke) {
    throw new Error("anna.tools.invoke is not available on the Anna host.");
  }

  const response = await anna.tools.invoke<NotesSummary>({
    tool_id: TOOL_ID,
    method: METHOD,
    args: {
      notes: toPlainNotes(notes),
    },
  });

  if (!isNotesSummary(response)) {
    console.error("[Mini Notes] Invalid tools.invoke response:", response);
    throw new Error("Invalid tool response: missing summary data.");
  }

  return response;
}