import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sliders, Cpu, HardDrive, ShieldAlert, Sparkles, Trash2, Download } from 'lucide-react';
import localforage from 'localforage';

interface SettingsModalProps {
isOpen: boolean;
onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
const [activeTab, setActiveTab] = useState<'general' | 'inference' | 'data' | 'advanced'>('general');
const [systemPrompt, setSystemPrompt] = useState("You are 'Frank', the private sovereign intelligence engine under the branding 'UNCUTstash AI'.");
const [temperature, setTemperature] = useState(0.2);
const [maxTokens, setMaxTokens] = useState(2048);

useEffect(() => {
// Load persisted settings
const loadSettings = async () => {
const storedPrompt = await localforage.getItem<string>('sovereign_system_prompt');
if (storedPrompt) setSystemPrompt(storedPrompt);

const storedTemp = await localforage.getItem<number>('sovereign_temperature');
if (storedTemp) setTemperature(storedTemp);

const storedTokens = await localforage.getItem<number>('sovereign_max_tokens');
if (storedTokens) setMaxTokens(storedTokens);
};
if (isOpen) {
loadSettings();
}
}, [isOpen]);

const saveSettings = () => {
localforage.setItem('sovereign_system_prompt', systemPrompt);
localforage.setItem('sovereign_temperature', temperature);
localforage.setItem('sovereign_max_tokens', maxTokens);
};

const handleClose = () => {
saveSettings();
onClose();
};

return (
<AnimatePresence>
{isOpen && (
<>
<motion.div
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
onClick={handleClose}
className="fixed inset-0 z-[1] bg-black/60 backdrop-blur-sm"
/>
<motion.div
initial={{ opacity: 0, scale: 0.95, y: 20 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 20 }}
transition={{ type: 'spring', damping: 25, stiffness: 300 }}
className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] w-full max-w-3xl bg-black/80 backdrop-blur-3xl border border-white/10 shadow-[0_0_50px_rgba(139,92,246,0.15)] rounded-2xl overflow-hidden flex flex-col md:flex-row h-[80vh] max-h-[600px]"
>
{/* Sidebar Tabs */}
<div className="w-full md:w-64 bg-white/5 border-b md:border-b-0 md:border-r border-white/10 p-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto">
<h2 className="text-white/40 text-[10px] uppercase tracking-widest font-mono mb-2 hidden md:block px-2 pt-2">Settings</h2>

<button onClick={() => setActiveTab('general')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap ${activeTab === 'general' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
<Sliders size={16} />
General
</button>

<button onClick={() => setActiveTab('inference')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap ${activeTab === 'inference' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
<Cpu size={16} />
Inference Engine
</button>

<button onClick={() => setActiveTab('data')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap ${activeTab === 'data' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
<HardDrive size={16} />
Data & Storage
</button>

<button onClick={() => setActiveTab('advanced')} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap mt-auto ${activeTab === 'advanced' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
<ShieldAlert size={16} />
Advanced
</button>
</div>

{/* Main Content Area */}
<div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar relative">
<button onClick={handleClose} className="absolute top-4 right-4 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors">
<X size={20} />
</button>

{activeTab === 'general' && (
<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
<div>
<h3 className="text-lg font-medium text-white flex items-center gap-2"><Sparkles size={18} className="text-violet-400" /> UI Customization</h3>
<p className="text-sm text-white/50 mt-1">Configure your workspace aesthetics and interactions.</p>
</div>
<div className="space-y-4">
<div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
<div>
<div className="text-sm font-medium text-white/90">Theme Profile</div>
<div className="text-xs text-white/50 mt-1">Switch between deep space dark mode or high-contrast local mode.</div>
</div>
<select className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-violet-500">
<option>Dark (Default)</option>
<option>Pitch Black (OLED)</option>
</select>
</div>

<div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
<div>
<div className="text-sm font-medium text-white/90">Clear Workspace History</div>
<div className="text-xs text-white/50 mt-1">Permanently delete all indexed chat history from OPFS.</div>
</div>
<button className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-mono hover:bg-red-500/20 transition-colors flex items-center gap-2">
<Trash2 size={14} /> PURGE
</button>
</div>
</div>
</div>
)}

{activeTab === 'inference' && (
<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
<div>
<h3 className="text-lg font-medium text-white flex items-center gap-2"><Cpu size={18} className="text-pink-400" /> Inference Engine Rules</h3>
<p className="text-sm text-white/50 mt-1">ChatGPT baseline controls for the local Web-LLM engine.</p>
</div>

<div className="space-y-6">
<div className="space-y-3">
<div className="flex justify-between">
<label className="text-sm font-medium text-white/90">System Prompt (Custom Instructions)</label>
</div>
<textarea
value={systemPrompt}
onChange={(e) => setSystemPrompt(e.target.value)}
className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white/80 resize-none focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all font-mono leading-relaxed"
placeholder="You are a helpful assistant..."
/>
</div>

<div className="space-y-3">
<div className="flex justify-between items-center">
<label className="text-sm font-medium text-white/90">Temperature (Creativity)</label>
<span className="text-xs font-mono text-pink-300">{temperature.toFixed(2)}</span>
</div>
<input
type="range" min="0" max="2" step="0.1"
value={temperature}
onChange={(e) => setTemperature(parseFloat(e.target.value))}
className="w-full accent-pink-500"
/>
<div className="flex justify-between text-[10px] text-white/40 uppercase tracking-widest font-mono">
<span>Deterministic</span>
<span>Creative</span>
</div>
</div>

<div className="space-y-3">
<div className="flex justify-between items-center">
<label className="text-sm font-medium text-white/90">Max Output Tokens</label>
<span className="text-xs font-mono text-pink-300">{maxTokens}</span>
</div>
<input
type="range" min="256" max="8192" step="256"
value={maxTokens}
onChange={(e) => setMaxTokens(parseInt(e.target.value))}
className="w-full accent-pink-500"
/>
</div>
</div>
</div>
)}

{activeTab === 'data' && (
<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
<div>
<h3 className="text-lg font-medium text-white flex items-center gap-2"><HardDrive size={18} className="text-blue-400" /> Data & Storage</h3>
<p className="text-sm text-white/50 mt-1">Manage Sovereign OPFS RAG indexes and model weights.</p>
</div>

<div className="space-y-4">
<div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
<div>
<div className="text-sm font-medium text-white/90">Export Full Session Log</div>
<div className="text-xs text-white/50 mt-1">Download your current unencrypted session context as Markdown.</div>
</div>
<button className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-mono hover:bg-blue-500/20 transition-colors flex items-center gap-2">
<Download size={14} /> EXPORT
</button>
</div>

<div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
<div>
<div className="text-sm font-medium text-white/90">Flush SQLite Vector DB</div>
<div className="text-xs text-white/50 mt-1">Deletes the active in-memory search index. Requires re-uploading documents.</div>
</div>
<button className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-mono hover:bg-red-500/20 transition-colors">
FLUSH
</button>
</div>
</div>
</div>
)}

{activeTab === 'advanced' && (
<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
<div>
<h3 className="text-lg font-medium text-white flex items-center gap-2"><ShieldAlert size={18} className="text-orange-400" /> Advanced Options</h3>
<p className="text-sm text-white/50 mt-1">Low-level pipeline and security controls. Use with caution.</p>
</div>

<div className="space-y-4">
<div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-orange-200 text-xs">
These settings directly modify the inference pipeline and WebWorker threading models. Altering them may trigger out-of-memory errors on mobile devices.
</div>
</div>
</div>
)}

</div>
</motion.div>
</>
)}
</AnimatePresence>
);
};