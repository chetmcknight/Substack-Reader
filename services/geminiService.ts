
import { FeedData, AnalysisResult } from '../types.ts';

/**
 * Analyzes a feed using the server-side Gemini API Proxy.
 * This keeps the API key hidden from the client.
 */
export const analyzeFeedWithGemini = async (feedData: FeedData): Promise<AnalysisResult> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ feedData }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server responded with ${response.status}`);
    }

    return await response.json() as AnalysisResult;
  } catch (error) {
    console.error("Analysis Request Error:", error);
    throw new Error("Unable to analyze feed. Please check your connection or try again later.");
  }
};
