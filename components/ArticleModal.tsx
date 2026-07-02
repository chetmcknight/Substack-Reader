
import React, { useEffect, useRef } from 'react';
import { FeedItem } from '../types.ts';
import { GlassCard } from './GlassCard.tsx';
import { X, ExternalLink, Calendar } from 'lucide-react';

interface ArticleModalProps {
  item: FeedItem | null;
  onClose: () => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({ item, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [item]);

  // Process injected HTML content for safety and UX
  useEffect(() => {
    if (item && contentRef.current) {
        const container = contentRef.current;
        
        // 1. Force all links to open in new tab
        const links = container.getElementsByTagName('a');
        for (let i = 0; i < links.length; i++) {
            links[i].setAttribute('target', '_blank');
            links[i].setAttribute('rel', 'noopener noreferrer');
        }

        // 2. Ensure iframes (YouTube, etc) are responsive
        const iframes = container.getElementsByTagName('iframe');
        for (let i = 0; i < iframes.length; i++) {
             iframes[i].removeAttribute('width');
             iframes[i].removeAttribute('height');
        }
    }
  }, [item]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
       {/* Modal Content */}
      <GlassCard className="w-full h-full md:h-[90vh] md:max-w-4xl relative z-10 flex flex-col p-0 overflow-hidden bg-surface border-white/10 shadow-2xl animate-in zoom-in-95 duration-300 md:rounded-2xl safe-bottom">
        
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 safe-top border-b border-white/5 bg-surfaceHighlight">
           <div className="flex items-center gap-2 text-textMuted text-sm min-w-0">
             <Calendar size={14} className="shrink-0" />
             <span className="truncate">{new Date(item.pubDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
           </div>
           
           <div className="flex items-center gap-2 shrink-0">
             <a 
               href={item.link}
               target="_blank"
               rel="noreferrer"
               className="p-2 text-textMuted hover:text-brand-end transition-colors rounded-lg hover:bg-white/5"
               title="Open in Browser"
               aria-label="Open in browser"
             >
               <ExternalLink size={20} />
             </a>
             <button 
               onClick={onClose}
               className="p-2 text-textMuted hover:text-white transition-colors rounded-lg hover:bg-white/5"
               aria-label="Close article"
             >
               <X size={24} />
             </button>
           </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10 modal-scroll">
           <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
             {item.title}
           </h1>

           {/* Content Renderer */}
           <div ref={contentRef} className="article-content space-y-4">
               <div dangerouslySetInnerHTML={{ __html: item.content || item.contentSnippet }} />
           </div>

           {/* Fallback for empty content */}
           {!item.content && !item.contentSnippet && (
             <div className="flex flex-col items-center justify-center py-20 text-textMuted space-y-4">
                <p>No content preview available.</p>
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noreferrer"
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors"
                >
                  Read full article on website
                </a>
             </div>
           )}
        </div>
      </GlassCard>
    </div>
  );
};