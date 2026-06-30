
import React from 'react';
import { Loader2, ArrowRight, Rss } from 'lucide-react';
import { GlassCard } from './GlassCard.tsx';

interface SearchInputProps {
  onSearch: (input: string) => void;
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  showExamples: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({ onSearch, isLoading, value, onChange, showExamples }) => {

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value);
    }
  };

  const exampleHandles = ['@theinnermostloop', '@metatrends'];

  return (
    <div className="w-full max-w-[480px] mx-auto mb-24 px-4 md:px-0">
      <GlassCard className="px-6 py-8 flex flex-col gap-6 relative overflow-hidden group">
        
        {/* Card Header - Enhanced padding to prevent 'o' clipping */}
        <div className="flex justify-between items-center overflow-visible">
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-none tracking-tighter font-outfit pr-4">
                StackReader <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end pr-1">Pro</span>
            </h2>
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-brand-start to-brand-end flex items-center justify-center shadow-[0_0_15px_-3px_rgba(255,59,92,0.4)]">
                <Rss size={20} className="text-white" />
            </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
            
            {/* Input Field */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-textMuted ml-1">Substack URL or Handle</label>
                <div className="relative group/input">
                    <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="e.g. @username"
                    className="w-full bg-[#050505] border border-white/10 focus:border-brand-end/50 text-white placeholder-textMuted rounded-2xl h-12 pl-4 pr-12 font-medium transition-all outline-none text-base shadow-inner"
                    disabled={isLoading}
                    autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-textMuted">
                         <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-start/60"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-start/30"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-start/15"></div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Primary Button */}
            <button
            type="submit"
            disabled={isLoading || !value.trim()}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#FF3B5C] to-[#FF8A3D] text-white font-black text-lg shadow-[0_0_20px_-5px_rgba(255,59,92,0.4)] hover:shadow-[0_0_25px_-2px_rgba(255,59,92,0.6)] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-brand-end disabled:opacity-100 disabled:shadow-none"
            >
            {isLoading ? <Loader2 className="animate-spin text-white" size={20} /> : (
                <span className="flex items-center gap-2 drop-shadow-md">
                Get Feed 
                <ArrowRight size={18} strokeWidth={3} />
                </span>
            )}
            </button>
        </form>

        {/* "Try These" Examples */}
        {showExamples && (
          <div className="text-center animate-in fade-in duration-500 delay-200 fill-mode-backwards">
            <p className="text-textMuted mb-4 font-medium text-sm">Or try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {exampleHandles.map(handle => (
                <button
                  key={handle}
                  onClick={() => onSearch(handle)}
                  className="px-3 py-1.5 bg-[#050505] border border-white/10 rounded-xl text-textSecondary hover:text-white hover:bg-brand-end/10 hover:border-brand-end/20 transition-all font-medium text-sm"
                >
                  {handle}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer section */}
        <div className="flex justify-between items-center text-sm pt-6 border-t border-white/5">
            <span className="text-textMuted">Engine</span>
            <span className="text-white font-medium">StackReader Pro v2.5</span>
        </div>
      </GlassCard>
    </div>
  );
};
