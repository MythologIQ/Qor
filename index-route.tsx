import { useState, useEffect } from "react";
import { Activity, Shield, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";

export default function QorHome() {
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch("/api/victor/project-state").then(r => r.json()).then(setStatus).catch(() => null);
  }, []);

  const tier = status?.promotion?.currentTier ?? 2;
  const ticks = status?.heartbeat?.totalTicks ?? 0;
  const consecutive = status?.promotion?.consecutiveSuccessfulTicks ?? 0;
  const pct = Math.min(100, Math.round((consecutive / 50) * 100));

  const books = [
    "Getting Real - Simplicity Razor",
    "Shape Up - Appetite Design", 
    "Simple Made Easy - QOR Architecture"
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-hidden">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.1),transparent_70%)]" />
      
      <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/images/victor-avatar.png" className="w-10 h-10 rounded-full border border-violet-500/30" />
            <div>
              <h1 className="text-xl font-bold">QOR</h1>
              <p className="text-xs text-slate-500">Governed Agent Runtime</p>
            </div>
          </div>
          <div className="flex gap-1">
            {["Victor", "Status", "Memory"].map((t, i) => (
              <button key={t} onClick={() => setTab(i)} 
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${tab === i ? 'bg-violet-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <button onClick={() => setTab(t => (t - 1 + 3) % 3)} className="absolute left-4 p-2 rounded-full bg-slate-800/50 hover:bg-slate-700">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="w-full max-w-3xl h-[400px] relative">
          
          {tab === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <img src="/images/victor-avatar.png" className="w-32 h-32 rounded-full border-2 border-violet-500/50 mb-6" />
              <h2 className="text-4xl font-bold mb-2">Victor</h2>
              <p className="text-lg text-slate-400">Cyber Knight of QOR</p>
              <p className="text-sm text-slate-500 mt-4 max-w-md">Paladin of Truth, traveling the ether on Pegasus</p>
              <a href="/victor/chat" className="mt-8 px-5 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium">Enter the Forge</a>
            </div>
          )}

          {tab === 1 && (
            <div className="bg-slate-900/50 rounded-2xl border p-6 h-full">
              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-slate-400 text-xs">Tier</span>
                  <span className="text-4xl font-bold">{tier}</span>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-slate-400 text-xs">Ticks</span>
                  <span className="text-3xl text-violet-400">{ticks}</span>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col justify-center">
                  <span className="text-slate-400 text-xs">Consecutive</span>
                  <span className="text-3xl text-emerald-400">{consecutive}</span>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all" style={{width: `${pct}%`}} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 2 && (
            <div className="bg-slate-900/50 rounded-2xl border p-6 h-full">
              <h3 className="text-sm text-slate-400 mb-4">Memory Foundation (conveyed to Qora)</h3>
              <div className="space-y-2">
                {books.map((b, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-violet-400" />
                    <span className="text-sm">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setTab(t => (t + 1) % 3)} className="absolute right-4 p-2 rounded-full bg-slate-800/50 hover:bg-slate-700">
          <ChevronRight className="w-5 h-5" />
        </button>
      </main>
    </div>
  );
}
