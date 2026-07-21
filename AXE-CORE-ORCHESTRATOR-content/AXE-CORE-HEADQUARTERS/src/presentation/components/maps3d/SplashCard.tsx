import { Shield, Key, AlertTriangle } from "lucide-react";

export function SplashCard() {
  return (
    <div className="w-full h-full bg-black text-slate-100 flex items-center justify-center p-4 selection:bg-cyan-500 selection:text-black font-sans select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.08),transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-2xl bg-[#050608] border border-cyan-950 rounded-xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/40 rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/40 rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/40 rounded-bl-lg" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/40 rounded-br-lg" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/40 text-cyan-400 rounded-lg">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">System Initialization Interrupted</span>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">Google Maps Key Required</h1>
          </div>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed mb-6 font-sans">
          The 3D Maps view needs a Google Maps Platform API key and a Map ID (a
          separate identifier, not the key itself) to render satellite/photorealistic tiles.
        </p>

        <div className="space-y-4 bg-black border border-cyan-950 rounded-lg p-5 mb-6">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-cyan-400" /> Configuration Steps
          </h3>

          <div className="grid gap-3.5 text-sm font-sans">
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded bg-cyan-950/50 border border-cyan-850 text-xs font-mono text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
              <div>
                <p className="text-slate-200 font-medium">Set VITE_GOOGLE_MAPS_API_KEY in Vercel</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate a browser key at the{" "}
                  <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline font-medium font-mono">
                    Google Cloud Console
                  </a>.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded bg-cyan-950/50 border border-cyan-850 text-xs font-mono text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
              <div>
                <p className="text-slate-200 font-medium">Create a Map ID and set VITE_GOOGLE_MAPS_MAP_ID</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  In Cloud Console → Maps Platform → Map Management → Create Map ID. This is
                  a separate value from the API key — both are required for 3D/vector styling.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded bg-cyan-950/50 border border-cyan-850 text-xs font-mono text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
              <div>
                <p className="text-slate-200 font-medium">Enable billing + the Maps JavaScript API</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Photorealistic 3D Tiles specifically require active billing on the project — a
                  free-tier-only key will load the flat satellite view but not the 3D globe.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3.5 bg-amber-950/10 border border-amber-900/40 text-amber-300 rounded-lg text-xs font-sans">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p className="leading-normal">
            Redeploy after adding both env vars — Vite bakes them in at build time, so a
            running deployment won't pick up new values without a rebuild.
          </p>
        </div>
      </div>
    </div>
  );
}
