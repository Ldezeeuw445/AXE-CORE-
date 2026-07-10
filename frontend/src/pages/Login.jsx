import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { TriangleLogo } from "../components/axe/TriangleLogo";
import { Spinner } from "../components/axe/Spinner";
import { ShieldCheck, KeyRound, AtSign, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("operator@axe.intel");
  const [password, setPassword] = useState("axe2026");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(email, password);
      toast.success("OPERATOR AUTHENTICATED");
      nav("/", { replace: true });
    } catch (e) {
      const msg = e?.response?.data?.detail || "Authentication failed";
      setErr(msg);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen w-full bg-black relative overflow-hidden" data-testid="login-page">
      <div className="absolute inset-0 pointer-events-none"
           style={{ backgroundImage:
             "radial-gradient(45% 35% at 15% 12%, rgba(0,212,255,0.08) 0%, rgba(0,0,0,0) 70%)," +
             "radial-gradient(40% 35% at 85% 90%, rgba(124,58,237,0.06) 0%, rgba(0,0,0,0) 70%)" }} />
      <div className="absolute inset-0 axe-grain" />

      <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left identity */}
        <div className="hidden lg:flex flex-col justify-between p-10 border-r border-white/5">
          <div className="flex items-center gap-3">
            <TriangleLogo size={28} animate />
            <div>
              <div className="text-[12px] font-semibold tracking-[0.18em] text-[#66E6FF]">AXE INTELLIGENCE</div>
              <div className="text-[10px] tracking-[0.14em] uppercase text-[#6F8193]">OSINT × Macro × Correlation Engine</div>
            </div>
          </div>
          <div>
            <h1 className="text-4xl xl:text-5xl font-semibold tracking-[-0.02em] text-[#EAF2F7] leading-[1.05]">
              Eight live<br/>intelligence layers,<br/>
              <span className="axe-triangle-grad">one operator brain.</span>
            </h1>
            <p className="mt-4 max-w-md text-[12px] leading-[1.5] text-[#9FB0C0]">
              News·Air·Vessel·Space·Macro·Crypto·Thermal·Intel. Streamed, normalized, and
              correlated by AXE — the Claude‑powered intelligence engine designed for operators
              who don't have time for noise.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["GDELT","ADS‑B","DIGITRAFFIC","VIIRS","USGS","CISA KEV","COINGECKO","WORLD BANK"].map(s=>{
                return <span key={s} className="axe-badge axe-badge-cyan">{s}</span>
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#6F8193]">
            <ShieldCheck size={12} className="text-[#2EF2C2]" />
            <span>SECURE OPERATOR SESSION · JWT · ENCRYPTED</span>
          </div>
        </div>

        {/* Right form */}
        <div className="flex items-center justify-center p-6 lg:p-10">
          <form onSubmit={submit} className="axe-panel relative w-full max-w-md p-7" data-testid="login-card">
            <div className="flex items-center gap-2 mb-6">
              <TriangleLogo size={20} />
              <div className="axe-panel-title">OPERATOR SIGN‑IN</div>
            </div>
            <h2 className="text-2xl font-semibold text-[#EAF2F7] tracking-[-0.01em]">Welcome back.</h2>
            <p className="text-[12px] text-[#9FB0C0] mt-1">Authenticate to enter the intelligence hub.</p>

            <label className="axe-section-label mt-6 block">Operator Email</label>
            <div className="relative mt-1">
              <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6F8193]" />
              <input
                data-testid="login-email-input"
                type="email" required value={email} onChange={(e)=>setEmail(e.target.value)}
                className="axe-input w-full pl-9"
                placeholder="operator@axe.intel"
              />
            </div>

            <label className="axe-section-label mt-4 block">Passcode</label>
            <div className="relative mt-1">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6F8193]" />
              <input
                data-testid="login-password-input"
                type="password" required value={password} onChange={(e)=>setPassword(e.target.value)}
                className="axe-input w-full pl-9"
                placeholder="Enter passcode"
              />
            </div>

            {err && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[#FF4D6D]" data-testid="login-error">
                <AlertCircle size={12} /> {err}
              </div>
            )}

            <button
              type="submit" disabled={busy}
              data-testid="login-submit-button"
              className="mt-6 group w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#00D4FF] text-black font-semibold text-[12px] tracking-[0.06em] uppercase px-4 py-3 hover:bg-[#66E6FF] transition-colors disabled:opacity-60"
            >
              {busy ? <Spinner variant="braille" colorClassName="text-black" label="AUTHENTICATING"/> : <>Enter Hub <ArrowRight size={14}/></>}
            </button>

            <div className="mt-5 text-[10px] tracking-[0.06em] uppercase text-[#6F8193] flex items-center gap-2">
              <ShieldCheck size={12} className="text-[#2EF2C2]"/>
              No‑auth OSINT adapters · Operator session required to view correlations
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
