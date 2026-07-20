import { useState, useRef, useEffect } from 'react';
import { Lock, Star, Search, Sparkles } from 'lucide-react';

interface AddressBarProps {
  url: string;
  onNavigate: (url: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

export default function AddressBar({ url, onNavigate, onFocusChange }: AddressBarProps) {
  const [inputValue, setInputValue] = useState(url || '');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(url || '');
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let target = inputValue.trim();
    if (!target) return;

    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = `https://${target}`;
      } else {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    }
    onNavigate(target);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocusChange?.(true);
    inputRef.current?.select();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onFocusChange?.(false);
  };

  const isSecure = url.startsWith('https://');
  const displayUrl = url ? new URL(url).hostname.replace('www.', '') : '';

  return (
    <form
      onSubmit={handleSubmit}
      className={`
        flex items-center gap-2 px-4 h-8 rounded-2xl
        transition-all duration-300 flex-1 max-w-xl
        ${isFocused
          ? 'bg-white/10 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,255,255,0.2)] w-[640px]'
          : 'bg-white/5 border border-transparent hover:bg-white/8 w-[540px]'
        }
      `}
    >
      {url ? (
        <Lock className={`w-3.5 h-3.5 flex-shrink-0 ${isSecure ? 'text-green-400' : 'text-yellow-400'}`} />
      ) : (
        <Search className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
      )}

      {isFocused ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search or enter address"
          className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={handleFocus}
          className="flex-1 text-left text-[13px] font-medium text-white/80 truncate bg-transparent"
        >
          {displayUrl || 'Search or enter address'}
        </button>
      )}

      <button
        type="button"
        className="p-0.5 rounded hover:bg-white/10 transition-colors"
      >
        <Star className="w-3.5 h-3.5 text-white/40" />
      </button>
      <button
        type="button"
        className="p-0.5 rounded hover:bg-white/10 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
      </button>
    </form>
  );
}
