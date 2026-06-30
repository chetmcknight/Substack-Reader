
import { LibraryFeed } from '../types.ts';

const STORAGE_KEY = 'stackreader_library';

export const dbService = {
  getLibrary: async (): Promise<LibraryFeed[]> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Error loading library", e);
      return [];
    }
  },

  addToLibrary: async (feed: LibraryFeed): Promise<LibraryFeed[]> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let library: LibraryFeed[] = stored ? JSON.parse(stored) : [];
      
      // Remove existing if present to allow update/move to top
      library = library.filter(f => f.originalUrl !== feed.originalUrl);
      
      // Add to top
      library.unshift(feed);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
      return library;
    } catch (e) {
      console.error("Error adding to library", e);
      return [];
    }
  },

  removeFromLibrary: async (url: string): Promise<LibraryFeed[]> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      let library: LibraryFeed[] = JSON.parse(stored);
      library = library.filter(f => f.originalUrl !== url);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
      return library;
    } catch (e) {
      console.error("Error removing from library", e);
      return [];
    }
  }
};
