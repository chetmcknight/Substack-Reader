
import React, { memo } from 'react';
import { FeedItem, FeedSourceType } from '../types.ts';
import { GlassCard } from './GlassCard.tsx';
import { Calendar, ArrowRight } from 'lucide-react';

interface FeedListProps {
  items: FeedItem[];
  onItemSelect: (item: FeedItem) => void;
  sourceType: FeedSourceType;
}

// Memoized item component to prevent unnecessary re-renders of the entire list
const FeedItemCard = memo(({ item, onSelect }: { item: FeedItem; onSelect: (item: FeedItem) => void }) => {
  
  return (
    <GlassCard 
      onClick={() => onSelect(item)}
      className="group hover:bg-black/5 dark:hover:bg-white/15 transition-transform duration-200 cursor-pointer active:scale-[0.99] relative bg-transparent dark:bg-black/40 border-gray-100 dark:border-white/5"
    >
       <div className="flex flex-col gap-2 pointer-events-none relative z-10">
         <div className="flex justify-between items-start gap-4">
           <h2 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-200 transition-colors pointer-events-auto">
               {item.title}
           </h2>
           <span className="text-xs font-mono text-gray-500 dark:text-white/40 flex items-center gap-1 bg-gray-100 dark:bg-black/20 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
              <Calendar size={12} />
              {new Date(item.pubDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
           </span>
         </div>
         
         <p className="text-gray-600 dark:text-white/60 text-sm line-clamp-3 leading-relaxed">
           {item.contentSnippet}
         </p>
  
         <div className="mt-2 flex justify-end">
           <span className={`text-sm font-medium flex items-center gap-2 transition-all transform translate-x-[-10px] group-hover:translate-x-0 text-orange-500 dark:text-orange-400 opacity-0 group-hover:opacity-100`}>
             Read Post 
             <ArrowRight size={14} />
           </span>
         </div>
       </div>
    </GlassCard>
  );
});

export const FeedList: React.FC<FeedListProps> = ({ items, onItemSelect }) => {
  if (items.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 dark:text-white/80 px-2">
        Recent Posts
      </h3>
      <div className="grid grid-cols-1 gap-4">
        {items.map((item) => (
          <FeedItemCard key={item.guid} item={item} onSelect={onItemSelect} />
        ))}
      </div>
    </div>
  );
};
