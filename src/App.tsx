/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import TabletopView from './components/TabletopView';
import RemoteView from './components/RemoteView';

export default function App() {
  const [role, setRole] = useState<'tabletop' | 'remote' | null>(null);

  if (role === 'tabletop') {
    return <TabletopView onExit={() => setRole(null)} />;
  }

  if (role === 'remote') {
    return <RemoteView onExit={() => setRole(null)} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e0e0e0] font-sans flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#12141a] rounded-xl p-8 border border-white/5 shadow-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">RPG Tabletop Simulator</h1>
          <p className="text-white/40">Join a session to start playing.</p>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => setRole('tabletop')}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors text-left group"
          >
            <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] group-hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-shadow">
              <Monitor size={24} />
            </div>
            <div>
              <div className="font-semibold text-lg text-white">Tabletop View</div>
              <div className="text-sm text-white/50">Host the main board on a large screen</div>
            </div>
          </button>
          
          <button 
            onClick={() => setRole('remote')}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors text-left group"
          >
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-shadow">
              <Smartphone size={24} />
            </div>
            <div>
              <div className="font-semibold text-lg text-white">Player Remote</div>
              <div className="text-sm text-white/50">Join from a phone to roll dice</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

