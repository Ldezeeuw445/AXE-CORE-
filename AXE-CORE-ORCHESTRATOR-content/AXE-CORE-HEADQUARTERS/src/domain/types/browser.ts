export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  isActive: boolean;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  icon: string;
  color?: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon: string;
  folder: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  favicon: string;
  timestamp: number;
}

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  size: string;
  progress: number;
  status: 'downloading' | 'completed' | 'failed' | 'paused';
  timestamp: number;
}

export type AIMode = 'ask' | 'summarize' | 'explain';
export type SidebarPanel = 'none' | 'bookmarks' | 'history' | 'downloads';
