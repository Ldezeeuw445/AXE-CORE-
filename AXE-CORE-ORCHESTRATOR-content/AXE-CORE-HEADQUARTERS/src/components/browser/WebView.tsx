import { useState, useEffect } from 'react';
import { Globe, Loader2 } from 'lucide-react';

interface WebViewProps {
  url: string;
  onTitleChange?: (title: string) => void;
}

export default function WebView({ url }: WebViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [url]);

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/40">
        <Globe className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Enter a URL to start browsing</p>
        <p className="text-sm mt-1">Or use AXE AI to search the web</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
          <p className="text-sm text-white/60">Loading {new URL(url).hostname}...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
          <p className="text-red-400 font-medium mb-2">Failed to load page</p>
          <p className="text-sm text-white/40">{error}</p>
        </div>
      )}
      <iframe
        src={url}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        allow="accelerometer; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture; usb; vr"
        title="Web Content"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError('This website cannot be displayed in an embedded frame.');
        }}
      />
    </div>
  );
}
