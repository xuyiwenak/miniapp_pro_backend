import type { EchoResult } from './classroomTypes';
import type { EvaluationInput } from './reflectionTypes';

export interface GalleryItem {
  galleryId: string;
  mine: boolean;
  progress: 'not_started' | 'draft' | 'independent_submitted' | 'completed';
}
export interface PeerAnswers {
  valence?: number; arousal?: number; dominance?: number; emotions: string[];
  otherEmotion?: string; confidence?: number; comment?: string;
}
export interface GalleryDetail extends GalleryItem {
  peerConsented?: boolean;
  independent?: PeerAnswers;
  independentSubmittedAt?: string;
  feedbackSubmittedAt?: string;
  moduleResponses?: EvaluationInput['moduleResponses'];
  echo?: EchoResult;
}
export interface GalleryState {
  sharing: boolean;
  readOnly: boolean;
  deadline?: string;
  items: GalleryItem[];
  nextCursor?: string;
  emptyReason?: 'no_shared_works' | 'processing';
}
