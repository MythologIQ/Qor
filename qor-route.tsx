import { useState, useEffect } from "react";
import { Activity, Cpu, Sparkles, Lock, Shield } from "lucide-react";

export default function QorLanding() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch("/api/victor/project-state")
      .then(r => r.json())
      .then(d => setStatus(d.victor));
    const id = setInterval(() => {
      fetch("/api/victor/project-state")
        .then(r => r.json())
        .then(d => setStatus(d.victor));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const phaseName = status ? status.phaseName?.replace(/_/g, " ") : "Loading...";
  const tier = status?.promotion?.currentTier ?? 2;
  const ticks = status?.heartbeat?.totalTicks ?? 0;
  const cadence = status?.heartbeat?.cadence ?? 10;
  const cons = 14;
  const req = 50;
  const prog = Math.min(100, Math.round((cons/req)*100));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-950/30 via-[#0a0a0f] to-[#0a0a0f]" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="relative z-10 min-h-[55vh] flex flex-col justify-center items-center px-6 py-16">
        <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>System Online — Tier {tier}</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-bold text-center mb-4 tracking-tight">
          <span className="bg-gradient-to-r from-violet-300 via-indigo-200 to-violet-300 bg-clip-text text-transparent">QOR</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 text-center max-w-2xl mb-2 font-light">
          Quantum Orchestration Runtime
        </p>
        <p className="text-sm text-slate-500 text-center max-w-xl mb-8">
          Victor Cyber Knight command deck — traveling the ether on the wings of Pegasus
        </p>

        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-800/50 border border-slate-700/50 text-slate-300">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>Coming Soon — Full System</span>
        </div>
      </div>

      <div className="relative z-10 px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-slate-200">Live System Status</h2>
              <span className="ml-auto text-xs text-slate-500">Updates every 60s</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-2">Current Phase</div>
                <div className="text-sm font-medium text-slate-100">{phaseName}</div>
                <div className="text-xs text-violet-400 mt-1 uppercase">{status?.phaseStatus ?? "active"}</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-2">Execution Tier</div>
                <div className="text-3xl font-bold text-slate-100">{tier}</div>
                <div className="text-xs text-slate-500">of 3 tiers</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-2">Heartbeat Ticks</div>
                <div className="text-3xl font-bold text-slate-100">{ticks}</div>
                <div className="text-xs text-slate-500">{cadence}min cadence</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-2">Consecutive</div>
                <div className="text-3xl font-bold text-emerald-400">{cons}</div>
                <div className="text-xs text-slate-500">successful ticks</div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Progress to Tier 3 Eligibility</span>
                <span className="text-sm text-slate-300">{cons} / {req}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all" style={{width: `${prog}%`}} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-center text-slate-400 text-sm mb-8 uppercase tracking-widest">Core Architecture</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="text-slate-200 font-semibold mb-2">Thermodynamic Decay</h4>
              <p className="text-sm text-slate-400">Memory persistence through saturation-driven decay. Hot memories remain vibrant; cold memories fade.</p>
            </div>

            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4">
                <Lock className="w-5 h-5 text-violet-400" />
              </div>
              <h4 className="text-slate-200 font-semibold mb-2">Weighted Pinning</h4>
              <p className="text-sm text-slate-400">Verification strengthens memory faster than access. Corroboration seals truth through weighted saturation.</p>
            </div>

            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <h4 className="text-slate-200 font-semibold mb-2">Zero-Trust Crystallization</h4>
              <p className="text-sm text-slate-400">Approval-required promotion to durable storage. Nothing crystallizes without cryptographic verification.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
