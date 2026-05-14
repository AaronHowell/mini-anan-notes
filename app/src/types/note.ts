export interface Note {
  id: string;
  content: string;
  order: number;
  createdAt: string;
}

export interface NotesSummary {
  summary: string;
  count: number;
  categories: string[];
  categoryCounts?: Record<string, number>;
  highlights?: string[];
}