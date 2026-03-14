export interface PdfDocument {
  id: string;
  name: string;
  uploadedAt: string;
  status: 'processing' | 'ready' | 'error';
}

export interface PdfChunk {
  id: string;
  docId: string;
  text: string;
  embedding: number[];
}

export interface HistoryItem {
  id: string;
  userId: string;
  question: string;
  answer: string;
  source: string;
  timestamp: string;
}
