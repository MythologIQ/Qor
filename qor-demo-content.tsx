// Victor + Forge Demo Content
const DemoContent = ()=>{
  const [activeMode,setActiveMode]=useState('chat');
  return(
    <div className="max-w-5xl mx-auto">
      <div className="grid md:grid-cols-3 gap-4">
        {/* Main Chat UI */}
        <div className="md:col-span-2">
          <div className="rounded-xl overflow-hidden border" style={{background:'#0a1222',borderColor:'#1a2d4a'}}>
            <div className="px-4 py-3 flex items-center justify-between" style={{background:'#030812',borderBottom:'1px solid #1a2d4a'}}>
              <div className="flex items-center gap-2">
                <img src="/images/victor-avatar.png" className="w-6 h-6 rounded" />
                <span className="text-sm font-medium text-slate-200">Victor</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Online</span>
              </div>
              <div className="flex gap-2">
                <button className={`px-2 py-1 rounded text-xs ${activeMode==='chat'?'bg-blue-500/20 text-blue-400':'bg-slate-800 text-slate-500'}`}>Chat</button>
                <button className={`px-2 py-1 rounded text-xs ${activeMode==='forge'?'bg-amber-500/20 text-amber-400':'bg-slate-800 text-slate-500'}`}>Forge</button>
              </div>
            </div>
            <div className="p-4 space-y-4 max-h-[320px] overflow-y-auto">
              {/* Support message */}
              <div className="flex gap-3">
                <img src="/images/victor-avatar.png" className="w-8 h-8 rounded-full" />
                <div className="max-w-[80%]">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Support Mode</span>
                  <div className="mt-1 px-3 py-2 rounded-lg text-sm" style={{background:'#0d1829',borderLeft:'3px solid #5a9cf8'}}>
                    <p className="text-slate-300">I've reviewed your error logs. Let me analyze the thermodynamic memory decay pattern.</p>
                    <div className="mt-2 flex gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Stance</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">Log Analysis</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Challenge message */}
              <div className="flex gap-3">
                <img src="/images/victor-avatar.png" className="w-8 h-8 rounded-full" />
                <div className="max-w-[80%]">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">Challenge Mode</span>
                  <div className="mt-1 px-3 py-2 rounded-lg text-sm" style={{background:'#0d1829',borderLeft:'3px solid #f59e0b'}}>
                    <p className="text-slate-300">Your weighted pinning hasn't been refreshed since cache migration. The decay threshold at 0.7 is too high — evidence suggests 0.5.</p>
                    <div className="mt-2 flex gap-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Thermodynamic Decay</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Pinning</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center gap-2" style={{borderTop:'1px solid #1a2d4a'}}>
              <span className="text-slate-500">/</span>
              <input type="text" placeholder="Message Victor..." className="flex-1 px-2 py-1.5 rounded-lg text-sm outline-none" style={{background:'#0d1829',border:'1px solid #1a2d4a',color:'#e7efff'}} readOnly />
              <button className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{background:'#5a9cf8',color:'#fff'}}>Send</button>
            </div>
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border" style={{background:'#0a1222',borderColor:'#1a2d4a'}}>
            <h3 className="text-sm font-medium mb-3">⚒️ Forge Skills</h3>
            <div className="space-y-1 text-xs">
              {['/qor-plan','/qor-audit','/qor-implement','/qor-substantiate'].map((s,i)=>(
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/50">
                  <span className="text-blue-400 font-mono">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl border" style={{background:'#0a1222',borderColor:'#1a2d4a'}}>
            <h3 className="text-sm font-medium mb-3">Stance Protocol</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400 font-semibold">Support</span>
                <span className="text-slate-500">Encouragement</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                <span className="text-amber-400 font-semibold">Challenge</span>
                <span className="text-slate-500">Opposition</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 font-semibold">Red Flag</span>
                <span className="text-slate-500">Risk</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DemoContent;