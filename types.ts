

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  content?: string;
  guid: string;
}

export type FeedSourceType = 'SUBSTACK';

export interface FeedData {
  title: string;
  description: string;
  link: string;
  image?: string;
  items: FeedItem[];
  originalUrl: string;
  sourceType: FeedSourceType;
}

export interface LibraryFeed {
  title: string;
  originalUrl: string;
  image?: string;
  description?: string;
  sourceType?: FeedSourceType;
}

export interface AnalysisResult {
  summary: string;
  tone: string;
  audience: string;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
