// src/App.tsx
import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useLocalRuntime, AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { ragApp, setActiveProgressCallback } from "@/orchestrator";
import { SovereignBootloader } from "@/workers/custom-loader"; // CRITICAL UPDATE: New Bootloader
import ModelSelector from "@/components/ModelSelector";
import StyleSelector from "@/components/StyleSelector";
import ProceduralBackground from "@/components/ProceduralBackground";
import Lenis from "@studio-freight/lenis";
import gsap from "gsap";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarMenu } from "@/components/SidebarMenu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SpatialPanel } from "@/components/SpatialPanel";
import DocumentDropzone from "@/components/DocumentDropzone";
import CommandPalette from "@/components/CommandPalette";
import OfflineIndicator from "@/components/OfflineIndicator";
import CubeLoader from "@/components/CubeLoader";
import { SettingsModal } from "@/components/SettingsModal";
import { Cpu, Activity, HardDrive } from "lucide-react";
import { useSovereignStore } from "@/store";
import A2HSOverlay from "@/components/A2HSOverlay";

const PanelGroup = ResizablePanelGroup as any;

export default function App() {
  const { targetModel, isBooting, engineReady, setEngineState, borderStyle, bgVariant, setUIPreferences } = useSovereignStore();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [scrollMode, setScrollMode] = useState<"container" | "page">("container");
  const [downloadLog, setDownloadLog] = useState("Initiating Sovereign AI Boot Sequence...");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  const chatPanelRef = useRef<HTMLDivElement>(null);
  const bootLockRef = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Detect iOS via user agent to prevent locking out standard browsers
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS) {
      setIsStandalone(isPWA);
    } else {
      setIsStandalone(true); // Always allow desktop, Windows, Android, and macOS
    }
  }, []);

  // BOOT SEQUENCE (Dynamic Model Router Integration)
  useEffect(() => {
    if (!targetModel || bootLockRef.current || !isStandalone) return;
    bootLockRef.current = true;

    setBootError(null);
    setEngineState(true, false);

    // CRITICAL UPDATE: Connect to the new Comlink-powered Bootloader
    SovereignBootloader.initiateBootSequence((progress, log) => {
      setDownloadLog(log);
      setDownloadPercent(progress);
    })
      .then(() => {
        setDownloadPercent(100);
        setEngineState(false, true);
      })
      .catch((err) => {
        setEngineState(false, false);
        setBootError(`Initialization Failed: ${err.message || String(err)}`);
        bootLockRef.current = false;
      });
  }, [targetModel, setEngineState, isStandalone]);

  // UI ANIMATIONS
  useEffect(() => {
    if (engineReady && chatPanelRef.current) {
      gsap.fromTo(
        chatPanelRef.current,
        { opacity: 0, scale: 0.95, filter: "blur(10px)" },
        { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.2, ease: "expo.out" }
      );
    }
  }, [engineReady]);

  // SMOOTH SCROLLING (Lenis)
  useEffect(() => {
    gsap.ticker.lagSmoothing(0);
    let lenis: Lenis | null = null;
    function update(time: number) { if (lenis) lenis.raf(time * 1000); }

    const initLenis = (container: HTMLElement | Window) => {
      if (lenis) { gsap.ticker.remove(update); lenis.destroy(); }
      lenis = new Lenis({
        wrapper: container === window ? window : (container as HTMLElement),
        content: container === window ? document.documentElement : (container as HTMLElement).firstElementChild as HTMLElement,
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });
      (window as any).activeLenis = lenis;
      gsap.ticker.add(update);
    };

    if (scrollMode === "page") {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
      initLenis(window);
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      setTimeout(() => {
        const viewport = document.querySelector("[data-radix-scroll-area-viewport]");
        if (viewport) initLenis(viewport as HTMLElement);
        else initLenis(window);
      }, 100);
    }
    return () => { if (lenis) { gsap.ticker.remove(update); lenis.destroy(); } };
  }, [scrollMode, engineReady]);

  // iOS PWA BULLETPROOFING: Prevent native form reloads globally
  useEffect(() => {
    const preventNativeSubmit = (e: Event) => e.preventDefault();
    window.addEventListener('submit', preventNativeSubmit, { capture: true });
    return () => window.removeEventListener('submit', preventNativeSubmit, { capture: true });
  }, []);

  // ASSISTANT RUNTIME (LangGraph Orchestrator Integration)
  const runtimeAdapter = useMemo(() => ({
    run: async function* ({ messages, abortSignal }: any) {
      try {
        const recentMessages = messages.slice(-3);
        const queryText = recentMessages.map((m: any) => {
          const text = typeof m.content === "string"
            ? m.content
            : m.content.find((p: any) => p.type === "text")?.text || "";
          return `${m.role === 'user' ? 'User' : 'Frank'}: ${text}`;
        }).join('\n');

        const queue: any[] = [];
        let done = false;
        let error: any = null;

        setActiveProgressCallback((msg) => queue.push(msg));

        ragApp.invoke({ query: queryText }, { signal: abortSignal })
          .then((state) => { queue.push({ type: "done", text: state.answer }); done = true; })
          .catch((e) => { error = e; done = true; });

        let displayedText = "";
        let currentLog = "";
        let tokenCount = 0;
        const startTime = performance.now();

        while (!done || queue.length > 0) {
          if (abortSignal.aborted) {
            console.warn("Run aborted by UI. Halting generator.");
            break;
          }

          if (queue.length > 0) {
            const msg = queue.shift();
            if (msg.type === "done") {
              yield { content: [{ type: "text" as const, text: msg.text }] };
            } else if (msg.log) {
              currentLog = msg.log;
              setGlobalStatus(currentLog);
              yield { content: [{ type: "text" as const, text: `${currentLog}\n\n${displayedText}` }] };
            } else if (msg.delta !== undefined) {
              displayedText += msg.delta;
              tokenCount++;

              const currentTps = Math.round((tokenCount / ((performance.now() - startTime) / 1000)) * 10) / 10;
              const currentCtx = Math.min(100, (displayedText.length / 8192) * 100);

              const tpsEl = document.getElementById('hud-tps');
              if (tpsEl) tpsEl.innerText = `${currentTps} T/s`;

              const ctxEl = document.getElementById('hud-context');
              if (ctxEl) ctxEl.style.width = `${currentCtx}%`;

              yield { content: [{ type: "text" as const, text: currentLog ? `${currentLog}\n\n${displayedText}` : displayedText }] };
            }
          } else {
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        setActiveProgressCallback(null);

        if (error && !abortSignal.aborted) {
          yield { content: [{ type: "text" as const, text: `System error: ${error.message || error}` }] };
        }
      } catch (err: any) {
        if (!abortSignal?.aborted) {
          yield { content: [{ type: "text" as const, text: `System error: ${err.message || err}` }] };
        }
      }
    }
  }), []);

  const runtime = useLocalRuntime(runtimeAdapter);

  const getBorderClass = (styleIndex: number) => {
    switch (styleIndex) {
      case 1: return "bg-black/60 backdrop-blur-2xl ring-1 ring-violet-500/60 shadow-[0_0_40px_rgba(139,92,246,0.3)]";
      case 2: return "bg-black/50 backdrop-blur-3xl border border-white/20 shadow-[0_60px_120px_-20px_rgba(0,0,0,1)]";
      case 3: return "bg-black/60 backdrop-blur-2xl border-2 border-transparent [box-shadow:inset_0_0_20px_rgba(255,0,0,0.1),0_0_20px_rgba(0,0,255,0.2)]";
      case 4: return "bg-black/40 backdrop-blur-3xl border border-white/10 [box-shadow:inset_1px_1px_2px_rgba(255,255,255,0.5),inset_-2px_-2px_4px_rgba(0,0,0,0.9),0_30px_60px_rgba(0,0,0,0.8)]";
      default: return "bg-black/20 backdrop-blur-xl border border-white/10";
    }
  };

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className={`relative flex w-full bg-zinc-950 text-white selection:bg-violet-500/30 ${scrollMode === "container" ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"}`}>

          {!isStandalone && isIOS && <A2HSOverlay />}

          <DocumentDropzone onProgress={(status) => {
            setGlobalStatus(status);
            if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
            statusTimerRef.current = setTimeout(() => setGlobalStatus(null), 3000);
          }} />
          <OfflineIndicator />
          <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />

          {/* Hardware Telemetry HUD */}
          {engineReady && (
            <div className="absolute top-4 left-4 z-50 flex gap-3 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg">
                <Cpu className="w-3 h-3 text-violet-400" />
                <span className="text-[10px] font-mono text-white/80">WASM/WebGPU Active</span>
              </div>
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span id="hud-tps" className="text-[10px] font-mono text-white/80">0 T/s</span>
              </div>
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg">
                <HardDrive className="w-3 h-3 text-blue-400" />
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div id="hud-context" className="h-full bg-blue-400 transition-all duration-300" style={{ width: `0%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 items-end">
            <ModelSelector targetModel={targetModel} isBooting={isBooting} onModelChange={(target) => {
              bootLockRef.current = false;
              useSovereignStore.getState().setModel(target);
            }} />
            <StyleSelector currentStyle={borderStyle} onStyleChange={(s) => setUIPreferences(s, bgVariant)} />
          </div>

          <div className="absolute inset-0 z-0 pointer-events-none">
            <ProceduralBackground slowMode={engineReady} variant={bgVariant} />
          </div>

          {/* BOOT SCREEN */}
          {!engineReady && isStandalone && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-10 pointer-events-none backdrop-blur-md bg-black/40 transition-opacity duration-1000">
              <div className="relative z-10 flex items-center justify-center pointer-events-none h-48">
                <CubeLoader variant={1} />
              </div>
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-white/80 text-xs font-mono tracking-widest uppercase">
                  <div className={`w-2 h-2 rounded-full ${bootError ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" : "bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]"} animate-pulse`} />
                  <span>{downloadLog}</span>
                </div>
                {downloadPercent >= 0 && (
                  <div className="w-80 bg-white/5 rounded-full overflow-hidden border border-white/10 h-1.5">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-300 ease-out relative" style={{ width: `${Math.max(downloadPercent, 2)}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MAIN CHAT INTERFACE */}
          <div ref={chatPanelRef} className={`relative z-10 w-[92%] md:w-[85%] max-w-6xl mx-auto py-4 flex flex-col ${scrollMode === "container" ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"}`} style={{ opacity: 1 }}>
            <SpatialPanel depth={20} className={`w-full h-full rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-700 ${getBorderClass(borderStyle)}`}>
              <PanelGroup direction="horizontal" className="w-full h-full">
                <ResizablePanel defaultSize={28} minSize={22} maxSize={45} style={{ minWidth: "220px" }} className="hidden md:flex flex-col bg-black/20 border-r border-white/5">
                  <SidebarMenu onOpenSettings={() => setIsSettingsOpen(true)} />
                </ResizablePanel>
                <ResizableHandle className="w-[1px] bg-white/10 hover:bg-violet-500/50 transition-colors cursor-col-resize" />
                <ResizablePanel defaultSize={72} className="bg-transparent relative">
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-violet-400/50 animate-pulse font-mono text-sm">Mounting Secure Boundary...</div>}>
                    <div className="w-full h-full"><Thread /></div>
                  </Suspense>
                </ResizablePanel>
              </PanelGroup>
            </SpatialPanel>
          </div>
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
          {engineReady && <div className="engine-ready-indicator absolute opacity-0 w-0 h-0 pointer-events-none" />}
        </div>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}