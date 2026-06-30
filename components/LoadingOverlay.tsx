
import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, Coffee, Brain, Wifi, Zap } from 'lucide-react';

const LOADING_MESSAGES = [
  { text: "Waking up the AI hamsters...", icon: <Brain size={24} /> },
  { text: "Greasing the gears of the internet...", icon: <Coffee size={24} /> },
  { text: "Convincing the server to share...", icon: <Wifi size={24} /> },
  { text: "Downloading more RAM...", icon: <Zap size={24} /> },
  { text: "Teaching the AI to read...", icon: <Brain size={24} /> },
  { text: "Untangling the interwebs...", icon: <Wifi size={24} /> },
  { text: "Searching for the end of the internet...", icon: <Sparkles size={24} /> },
  { text: "Asking nicely...", icon: <Zap size={24} /> },
  { text: "Beeping and booping...", icon: <Brain size={24} /> },
  { text: "Generating witty loading text...", icon: <Sparkles size={24} /> }
];

export const LoadingOverlay: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const currentMessage = LOADING_MESSAGES[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/60 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="max-w-sm w-full relative">
        {/* Glow Effect */}
        <div className="absolute -inset-4 bg-gradient-to-r from-brand-start to-brand-end opacity-20 blur-2xl rounded-full animate-pulse"></div>
        
        <div className="relative bg-[#0D0F14]/90 border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl backdrop-blur-md flex flex-col items-center">
          
          {/* Animated Loader Icon */}
          <div className="relative mb-8">
             <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1C1E26] to-[#0B0D10] border border-white/5 flex items-center justify-center shadow-inner">
               <Loader2 size={40} className="text-brand-start animate-spin" strokeWidth={2.5} />
             </div>
          </div>
          
          <div className="text-center space-y-2 mb-8">
            <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tighter font-outfit">
              Analyzing <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end">Feed</span>
            </h3>
            <p className="text-textMuted text-sm font-medium uppercase tracking-widest">StackReader Pro v2.5</p>
          </div>
          
          {/* Progress Indicator */}
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-8">
            <div className="h-full bg-gradient-to-r from-brand-start to-brand-end w-1/3 rounded-full animate-[loading-bar_2s_infinite_ease-in-out]"></div>
          </div>
          
          {/* Cycling Status Text */}
          <div className="h-12 flex flex-col items-center justify-center w-full">
            <div 
              key={currentIndex} 
              className="flex items-center gap-3 text-textSecondary font-medium animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <span className="text-brand-end opacity-80">{currentMessage.icon}</span>
              <p className="text-center">{currentMessage.text}</p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 w-full text-center">
             <p className="text-xs text-textMuted font-mono">ENCRYPTED ANALYTICS ACTIVE</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); width: 20%; }
          50% { width: 40%; }
          100% { transform: translateX(300%); width: 20%; }
        }
      `}</style>
    </div>
  );
};
