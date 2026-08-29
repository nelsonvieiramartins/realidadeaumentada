import { useState, useEffect } from 'react';
import { socket } from '../lib/socket';
import { Dices, LogOut, User } from 'lucide-react';

interface RemoteViewProps {
  onExit: () => void;
}

export default function RemoteView({ onExit }: RemoteViewProps) {
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [recentRolls, setRecentRolls] = useState<any[]>([]);

  useEffect(() => {
    socket.on('dice:rolled', (roll) => {
      setRecentRolls(prev => [roll, ...prev].slice(0, 5));
    });

    return () => {
      socket.off('dice:rolled');
    };
  }, []);

  const handleRoll = (sides: number) => {
    socket.emit('dice:roll', { player: playerName, sides });
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] text-[#e0e0e0] font-sans flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-[#12141a] rounded-xl p-6 border border-white/5 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Join as Player</h2>
            <p className="text-white/40">Enter your character name</p>
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Character Name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-emerald-500 text-white placeholder:text-white/30 transition-colors shadow-inner"
              />
            </div>
            
            <button
              onClick={() => playerName.trim() && setIsJoined(true)}
              disabled={!playerName.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold uppercase tracking-wider text-xs py-3 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-colors"
            >
              Join Session
            </button>
            <button
              onClick={onExit}
              className="w-full bg-white/5 hover:bg-white/10 text-white/60 font-semibold uppercase tracking-wider text-xs py-3 rounded-lg transition-colors border border-transparent hover:border-white/5"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e0e0e0] font-sans flex flex-col">
      <header className="h-14 border-b border-white/10 bg-[#12141a] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            {playerName.charAt(0).toUpperCase()}
          </div>
          <div className="font-medium tracking-tight text-white">{playerName}</div>
        </div>
        <button onClick={onExit} className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex-1 p-4 space-y-6 overflow-y-auto">
        <section className="space-y-4">
          <h3 className="text-xs uppercase tracking-widest text-white/40 font-bold flex items-center gap-2">
            <Dices size={14} /> Quick Roll
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[4, 6, 8, 10, 12, 20].map(d => (
              <button
                key={d}
                onClick={() => handleRoll(d)}
                className="bg-[#12141a] border border-white/5 hover:border-emerald-500/50 hover:bg-white/5 active:bg-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-1 transition-all shadow-lg"
              >
                <span className="text-2xl font-bold text-emerald-400">d{d}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs uppercase tracking-widest text-white/40 font-bold">Recent Rolls</h3>
          <div className="space-y-2 font-mono text-[11px]">
            {recentRolls.length === 0 ? (
              <div className="text-center p-8 border border-dashed border-white/10 rounded-xl text-white/40">
                No rolls yet
              </div>
            ) : (
              recentRolls.map((roll, i) => (
                <div key={roll.id} className="bg-white/5 border border-white/5 rounded-lg p-3 flex items-center justify-between">
                  <div className="opacity-70">
                    <span className="font-bold text-emerald-400">{roll.player}</span> rolled d{roll.sides}
                  </div>
                  <div className="text-lg font-bold bg-black/40 w-10 h-10 flex items-center justify-center rounded-md border border-white/10 shadow-inner text-white">
                    {roll.result}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
