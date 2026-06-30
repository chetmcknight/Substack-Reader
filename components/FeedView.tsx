
import React, { useState, useMemo } from 'react';
import { FeedData, FeedItem } from '../types.ts';
import { FeedHeader } from './FeedHeader.tsx';
import { FeedList } from './FeedList.tsx';
import { GlassCard } from './GlassCard.tsx';
import { ChevronDown, ChevronUp, X, Rss } from 'lucide-react';

interface FeedViewProps {
  data: FeedData;
  isSaved: boolean;
  onToggleSave: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onItemSelect: (item: FeedItem) => void;
}

export const FeedView: React.FC<FeedViewProps> = ({ data, isSaved, onToggleSave, onRefresh, onClose, onItemSelect }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const style = useMemo(() => {
      return {
        // More subtle borders and colors
        border: 'border-brand-end/20',
        text: 'text-brand-end',
        bg: 'bg-brand-end/10',
        icon: <Rss size={16} />
      };
  }, [data.sourceType]);

  const icon = useMemo(() => {
    if (data.image) return <img src={data.image} alt="Feed Icon" className="w-full h-full object-cover rounded-full" />;
    return style.icon;
  }, [data.image, style.icon]);

  return (
    <GlassCard className={`mb-6 p-0 overflow-hidden relative border ${style.border}`}>
      
      {/* Collapsible Header Strip */}
      <div 
        className={`relative z-10 flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors ${isExpanded ? 'border-b border-white/5' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`w-8 h-8 rounded-full ${style.bg} flex items-center justify-center ${style.text} flex-shrink-0 shadow-sm`}>
             {icon}
          </div>
          <h2 className="font-bold text-lg text-white truncate">{data.title}</h2>
          {!isExpanded && (
             <span className="text-xs text-textMuted hidden sm:inline-block ml-2">
                Click to expand
             </span>
          )}
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
             className="p-2 text-textMuted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
           >
             {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
           </button>
           <button 
             onClick={(e) => { e.stopPropagation(); onClose(); }}
             className="p-2 text-textMuted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
           >
             <X size={20} />
           </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 md:p-6 relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
          <FeedHeader 
             data={data} 
             isSaved={isSaved}
             onToggleSave={onToggleSave}
             onRefresh={onRefresh}
           />
           <FeedList 
              items={data.items} 
              onItemSelect={onItemSelect} 
              sourceType={data.sourceType}
           />
        </div>
      )}
    </GlassCard>
  );
};
