
import React, { memo } from 'react';
import { LibraryFeed } from '../types.ts';
import { GlassCard } from './GlassCard.tsx';
import { Trash2, ArrowRight, Rss, RotateCw } from 'lucide-react';

interface LibraryListProps {
  feeds: LibraryFeed[];
  onSelect: (url: string) => void;
  onRemove: (e: React.MouseEvent, url: string) => void;
  onRefresh: (url: string) => void;
}

const LibraryItem = memo(({ 
  feed, 
  onSelect, 
  onRemove,
  onRefresh
}: { 
  feed: LibraryFeed; 
  onSelect: (url: string) => void; 
  onRemove: (e: React.MouseEvent, url: string) => void;
  onRefresh: (url: string) => void;
}) => {
  
  return (
    <GlassCard 
      onClick={() => onSelect(feed.originalUrl)}
      className="group cursor-pointer hover:bg-[#1A1D24] active:scale-[0.98] transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between border-white/5 hover:border-brand-start/30 hover:shadow-glow-subtle hover:scale-[1.01] origin-center"
    >
      <div>
        {/* Icon Container */}
        <div className="w-12 h-12 rounded-xl bg-[#0B0D10] flex items-center justify-center mb-5 relative border border-white/5 group-hover:border-brand-start/20 transition-colors">
            {feed.image ? (
                <img src={feed.image} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
                <Rss className="text-brand-end" size={20} />
            )}
        </div>

        <h3 className="text-lg font-bold text-white mb-2 leading-tight group-hover:text-brand-end transition-colors">
          {feed.title}
        </h3>
        <p className="text-sm text-textSecondary leading-relaxed line-clamp-2 mb-4 font-medium">
          {feed.description || "Substack publication feed."}
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
         <div className="flex gap-1">
            <button 
                onClick={(e) => onRemove(e, feed.originalUrl)}
                className="text-textMuted hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-white/5"
                title="Remove"
            >
                <Trash2 size={14} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onRefresh(feed.originalUrl); }}
                className="text-textMuted hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5"
                title="Refresh"
            >
                <RotateCw size={14} />
            </button>
         </div>
         <span className="text-brand-end text-xs font-bold uppercase tracking-wider flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity transform translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
             Read <ArrowRight size={14} strokeWidth={2.5} />
         </span>
      </div>
    </GlassCard>
  );
});

export const LibraryList: React.FC<LibraryListProps> = ({ feeds, onSelect, onRemove, onRefresh }) => {
  if (feeds.length === 0) return null;

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 px-4 md:px-0">
      <div className="mb-10 text-center">
         <h2 className="text-2xl font-bold text-white mb-2">Your Library</h2>
         <p className="text-textSecondary">Access your saved Substack feeds instantly.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {feeds.map((feed) => (
          <LibraryItem 
            key={feed.originalUrl} 
            feed={feed} 
            onSelect={onSelect} 
            onRemove={onRemove}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
};
