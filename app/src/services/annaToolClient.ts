import type { Note, NotesSummary } from "../types/note";

const TOOL_ID = "tool-dev-mini-notes";

interface RawSummaryResponse {
  ok?: boolean;
  success?: boolean;
  tool?: string;
  data?: NotesSummary;
  result?: unknown;
  value?: unknown;
  output?: unknown;
  summary?: string;
  count?: number;
  categories?: string[];
}

function toPlainNotes(notes: Note[]) {
  return notes.map((note) => ({
    id: String(note.id),
    content: String(note.content),
    order: Number(note.order),
    createdAt: String(note.createdAt)
  }));
}

function isNotesSummary(value: unknown): value is NotesSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<NotesSummary>;

  return (
    typeof candidate.summary === "string" &&
    typeof candidate.count === "number" &&
    Array.isArray(candidate.categories)
  );
}

function extractSummary(response: RawSummaryResponse): NotesSummary | null {
  console.log("[Mini Notes] raw tools.invoke response:", response);

  // Case 1: plugin result is returned directly:
  // { success: true, tool: "...", data: { summary, count, categories } }
  if (isNotesSummary(response.data)) {
    return response.data;
  }

  // Case 2: SDK wraps plugin result in result:
  // { result: { success: true, tool: "...", data: { ... } } }
  if (
    response.result &&
    typeof response.result === "object" &&
    isNotesSummary((response.result as any).data)
  ) {
    return (response.result as any).data;
  }

  // Case 3: SDK wraps plugin result in value:
  // { value: { success: true, tool: "...", data: { ... } } }
  if (
    response.value &&
    typeof response.value === "object" &&
    isNotesSummary((response.value as any).data)
  ) {
    return (response.value as any).data;
  }

  // Case 4: SDK wraps plugin result in output:
  // { output: { success: true, tool: "...", data: { ... } } }
  if (
    response.output &&
    typeof response.output === "object" &&
    isNotesSummary((response.output as any).data)
  ) {
    return (response.output as any).data;
  }

  // Case 5: summary itself is returned directly:
  // { summary, count, categories }
  if (isNotesSummary(response)) {
    return response;
  }

  return null;
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

  const response = await anna.tools.invoke({
    tool_id: TOOL_ID,
    method: "summarize_notes",
    args: {
      notes: toPlainNotes(notes)
    }
  }) as RawSummaryResponse;

  const summary = extractSummary(response);

  if (!summary) {
    throw new Error(
      "Invalid tool response: missing summary data. Check browser console for raw response."
    );
  }

  return summary;
}