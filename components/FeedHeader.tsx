
import React, { useState } from 'react';
import { FeedData, AnalysisResult } from '../types.ts';
import { Copy, Check, Sparkles, Bookmark, BookmarkCheck, Rss, RotateCw } from 'lucide-react';
import { analyzeFeedWithGemini } from '../services/geminiService.ts';

interface FeedHeaderProps {
  data: FeedData;
  isSaved: boolean;
  onToggleSave: () => void;
  onRefresh: () => void;
}

// Simple Substack Icon Component
export const SubstackIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M22.5396 8.24219H1.46045V4H22.5396V8.24219ZM22.5396 20H1.46045V15.7578H22.5396V20ZM1.46045 14.4828H22.5396V9.51719H12L1.46045 14.4828Z" />
  </svg>
);

export const FeedHeader: React.FC<FeedHeaderProps> = ({ data, isSaved, onToggleSave, onRefresh }) => {
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.originalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeFeedWithGemini(data);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative overflow-hidden group rounded-2xl">
        <div className="relative z-10 p-2">
          <div className="flex flex-col md:flex-row gap-6 items-start pr-4">
             {data.image && (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-[20px] overflow-hidden shadow-card flex-shrink-0 border border-white/5 bg-black/50">
                  <img src={data.image} alt={data.title} className="w-full h-full object-cover" />
                </div>
             )}
             
             <div className="flex-1 space-y-3">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div className="space-y-1">
                     <a 
                       href={data.originalUrl}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="flex items-center gap-2 text-xs font-bold tracking-wider text-brand-end uppercase hover:text-white transition-colors group/rss mb-1"
                       title="View RSS XML"
                     >
                        <Rss size={14} className="group-hover/rss:scale-110 transition-transform" />
                        RSS Feed
                     </a>
                     <h1 className="text-3xl font-bold text-white tracking-tight leading-none">
                       {data.title}
                     </h1>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                   {/* Actions */}
                   <button
                     onClick={onToggleSave}
                     className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm font-medium ${
                       isSaved 
                         ? 'bg-brand-end/10 border-brand-end/30 text-brand-end hover:bg-brand-end/20' 
                         : 'bg-white/5 border-white/5 text-textSecondary hover:bg-white/10 hover:text-white'
                     }`}
                   >
                     {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                     {isSaved ? 'Saved' : 'Save'}
                   </button>

                   <button 
                      onClick={onRefresh}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium border border-white/5 text-textSecondary hover:text-white"
                      title="Refresh Content"
                    >
                      <RotateCw size={16} />
                      Refresh
                    </button>

                   <button 
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium border border-white/5 text-textSecondary hover:text-white"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                      {copied ? 'Copied' : 'Copy URL'}
                    </button>
                    
                    <a 
                      href={data.link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-start/10 hover:bg-brand-start/20 transition-colors text-sm font-medium border border-brand-start/20 text-brand-start hover:text-white"
                      title="Visit Substack Publication"
                    >
                      <SubstackIcon size={16} />
                      Substack
                    </a>
                </div>

                <p className="text-textSecondary leading-relaxed text-lg font-normal">{data.description}</p>
             </div>
          </div>

          {/* Gemini Analysis Section */}
          <div className="mt-6 pt-6 border-t border-white/5">
             {!analysis ? (
               <button 
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-2 text-[#2E6BFF] hover:text-[#4b7dff] transition-colors font-medium disabled:opacity-50 text-sm"
               >
                 <Sparkles size={16} className={analyzing ? "animate-pulse" : ""} />
                 {analyzing ? "Analyzing feed vibe..." : "Generate AI Summary"}
               </button>
             ) : (
               <div className="bg-[#0B0D10]/50 rounded-xl p-5 border border-white/5 space-y-4 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-2 text-[#2E6BFF]">
                     <Sparkles size={14} />
                     {/* Title Case, text-xs */}
                     <span className="text-xs font-bold tracking-wide">AI Analysis</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-3">
                      <p className="text-white/90 italic font-light text-lg">"{analysis.summary}"</p>
                    </div>
                    <div className="bg-surfaceHighlight p-3 rounded-lg border border-white/5">
                      {/* Title Case, text-xs */}
                      <span className="text-xs text-textMuted block mb-1 font-bold tracking-wide">Tone</span>
                      <span className="font-medium text-white text-sm">{analysis.tone}</span>
                    </div>
                    <div className="bg-surfaceHighlight p-3 rounded-lg md:col-span-2 border border-white/5">
                      {/* Title Case, text-xs */}
                      <span className="text-xs text-textMuted block mb-1 font-bold tracking-wide">Target Audience</span>
                      <span className="font-medium text-white text-sm">{analysis.audience}</span>
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
