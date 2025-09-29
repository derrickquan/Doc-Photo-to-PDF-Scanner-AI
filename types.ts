
export enum ProcessingState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface ImageFile {
  id: string;
  file: File;
  originalUrl: string;
  cleanedUrl: string | null;
}
