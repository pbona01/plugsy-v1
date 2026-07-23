import { useState, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "motion/react"
import { supabase } from "../lib/supabase"
import { Sparkles, X, Smartphone, ArrowRight, Loader2, CheckCircle2, Download } from "lucide-react"
import plugsyLogo from "../assets/images/plugsy_icon.svg"

const INSTALL_STEPS = [
  "Initializing installation engine...",
  "Caching web application bundle...",
  "Registering background service workers...",
  "Establishing secure sandbox database...",
  "Configuring dynamic offline-first capability...",
  "Optimizing startup splash sequences..."
]

export default function InstallApp() {
  const promptRef = useRef<any>(null)
  const location = useLocation()

  // Installation States
  const [canInstall, setCanInstall] = useState(false)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installStep, setInstallStep] = useState(0)

  // Navigation Loading States
  const [isNavigating, setIsNavigating] = useState(false)
  const [navProgress, setNavProgress] = useState(0)

  // Track page navigation (route changes)
  useEffect(() => {
    setIsNavigating(true)
    setNavProgress(15)

    const interval = setInterval(() => {
      setNavProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval)
          return 90
        }
        // Increment randomly for a organic realistic load look
        return prev + Math.floor(Math.random() * 12) + 5
      })
    }, 100)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      setNavProgress(100)
      
      const fadeTimeout = setTimeout(() => {
        setIsNavigating(false)
      }, 250)
      
      return () => clearTimeout(fadeTimeout)
    }, 450)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [location.pathname])

  // PWA Prompt Detection
  useEffect(() => {
    // Already installed as PWA
    const standalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches || (window.navigator as any).standalone

    if (standalone) {
      setIsInstalled(true)
      return
    }

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream
    setIsIOS(ios)

    if (ios) {
      // Show iOS instructions after 6 seconds
      const t = setTimeout(() => {
        if (!sessionStorage.getItem("pwa_dismissed_v4")) {
          setShow(true)
        }
      }, 6000)
      return () => clearTimeout(t)
    }

    // Android/Desktop: listen for install prompt
    const handlePrompt = (e: any) => {
      e.preventDefault()
      promptRef.current = e
      setCanInstall(true)
      console.log("[PWA] install prompt captured")
      
      // Check if user dismissed recently
      if (!sessionStorage.getItem("pwa_dismissed_v4")) {
        setShow(true)
      }
    }

    const handleInstalled = () => {
      console.log("[PWA] installed!")
      setIsInstalled(true)
      setShow(false)
    }

    window.addEventListener("beforeinstallprompt", handlePrompt)
    window.addEventListener("appinstalled", handleInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    // Send tracking event to the database
    try {
      await supabase.from('tracking_events').insert({
        event_name: 'install_app_clicked',
        metadata: { source: 'pwa_prompt' }
      });
    } catch (logErr) {
      console.error("[PWA] tracking error:", logErr);
    }

    if (!promptRef.current) {
      console.log("[PWA] no prompt available")
      return
    }

    try {
      setIsInstalling(true)
      setInstallProgress(0)
      setInstallStep(0)

      // Start simulating high fidelity progress steps with a smooth linear tween
      const duration = 2500 // 2.5s to reach 96%
      const targetPercent = 96
      const startTime = Date.now()

      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const ratio = Math.min(elapsed / duration, 1)
        const next = Math.floor(ratio * targetPercent)

        // Map progress percentages to step descriptions
        const currentStepIndex = Math.min(
          Math.floor((next / 100) * INSTALL_STEPS.length),
          INSTALL_STEPS.length - 1
        )
        setInstallStep(currentStepIndex)
        setInstallProgress(next)

        if (ratio >= 1) {
          clearInterval(progressInterval)
        }
      }, 30)

      await promptRef.current.prompt()
      const result = await promptRef.current.userChoice
      console.log("[PWA] user choice:", result.outcome)

      clearInterval(progressInterval)

      if (result.outcome === "accepted") {
        setInstallProgress(100)
        setInstallStep(INSTALL_STEPS.length - 1)
        
        // Wait briefly for completion animation before hiding
        setTimeout(() => {
          setIsInstalled(true)
          setShow(false)
        }, 1000)
      } else {
        setIsInstalling(false)
        setInstallProgress(0)
        setInstallStep(0)
      }
      promptRef.current = null
      setCanInstall(false)
    } catch (e) {
      console.error("[PWA] install error:", e)
      setIsInstalling(false)
      setInstallProgress(0)
      setInstallStep(0)
    }
  }

  const dismiss = () => {
    setShow(false)
    sessionStorage.setItem("pwa_dismissed_v4", "true")
  }

  return (
    <>
      {/* 1. Global Navigation Slim Top Progress Bar */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#3B82F6] via-[#EF4444] to-[#10B981] z-[99999] shadow-[0_1px_10px_rgba(59,130,246,0.5)] origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: navProgress / 100 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
          />
        )}
      </AnimatePresence>

      {/* 2. PWA Prompts (iOS / Android One-Tap) */}
      <AnimatePresence>
        {show && !isInstalled && (
          <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-[380px] z-[9998] pointer-events-auto">
            {/* iOS manual instructions prompt */}
            {isIOS && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.95 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="bg-slate-900/95 dark:bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_12px_40px_rgba(0,0,0,0.65)] text-left relative"
              >
                {/* Close Button */}
                <button 
                  onClick={dismiss}
                  className="absolute top-3.5 right-3.5 p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>

                {/* Banner Header */}
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-display flex items-center gap-1.5">
                      Install Plugsy PWA
                    </h3>
                    <p className="text-[11px] text-slate-400">Add to your Home Screen for optimal experience</p>
                  </div>
                </div>

                {/* iOS Instructions List */}
                <div className="space-y-3 mb-1">
                  {[
                    "Open inside Safari web browser (not Chrome/Firefox)",
                    "Tap the Share button ⬆️ in the browser bottom panel",
                    "Scroll down & select \"Add to Home Screen\"",
                    "Confirm by clicking \"Add\" in the top right corner"
                  ].map((step, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <span className="bg-[#EF4444] text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-[#EF4444]/20">
                        {idx + 1}
                      </span>
                      <span className="text-xs text-slate-300 font-medium leading-relaxed">
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Android / Desktop prompt */}
            {canInstall && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.95 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="bg-slate-900/95 dark:bg-[#0c0c0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-[0_16px_48px_rgba(0,0,0,0.7)] text-left relative overflow-hidden"
              >
                {/* Glowing subtle ambient accent bar */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-blue-500 via-red-500 to-amber-500" />

                <AnimatePresence mode="wait">
                  {!isInstalling ? (
                    // Regular Prompt View
                    <motion.div
                      key="prompt-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex gap-3.5 items-center">
                        <img 
                          src={plugsyLogo} 
                          alt="Plugsy Logo" 
                          className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-white/10 shadow-md flex-shrink-0" 
                        />
                        <div className="flex-grow">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-black text-white uppercase tracking-wider font-display">
                              Install Plugsy
                            </h3>
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                              PWA
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            Unlock lightning-fast access, native notifications & offline support.
                          </p>
                        </div>
                        <button 
                          onClick={dismiss}
                          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors self-start mt-0.5"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleInstall}
                          className="flex-grow bg-[#EF4444] hover:bg-[#D93838] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-red-500/15 hover:shadow-red-500/25 border border-red-500/10 transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-[0.98]"
                        >
                          <Download size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                          <span>Install App</span>
                        </button>
                        <button 
                          onClick={dismiss} 
                          className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                        >
                          Later
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    // HIGH FIDELITY INSTALLING / PROGRESS VIEW with SKELETON PLACEHOLDERS
                    <motion.div
                      key="installing-view"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      {/* Installation Header */}
                      <div className="flex gap-3.5 items-center">
                        <motion.div 
                          className={`w-12 h-12 rounded-xl border shadow-inner flex items-center justify-center flex-shrink-0 relative overflow-hidden transition-colors duration-500 ${
                            installProgress === 100 
                              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" 
                              : "bg-slate-800/40 border-white/5 text-[#EF4444]"
                          }`}
                        >
                          {/* Skeleton shimmer on logo container */}
                          {installProgress < 100 && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                          )}
                          <AnimatePresence mode="wait">
                            {installProgress === 100 ? (
                              <motion.svg
                                key="checkmark"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={3}
                                stroke="currentColor"
                                className="w-6 h-6"
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              >
                                <motion.path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4.5 12.75l6 6 9-13.5"
                                  initial={{ pathLength: 0 }}
                                  animate={{ pathLength: 1 }}
                                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                                />
                              </motion.svg>
                            ) : (
                              <motion.div
                                key="loader"
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.2 }}
                              >
                                <Loader2 size={20} className="animate-spin" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                        <div className="flex-grow">
                          <h3 className={`text-xs font-black uppercase tracking-widest font-mono transition-colors duration-500 ${
                            installProgress === 100 ? "text-emerald-400" : "text-white/90"
                          }`}>
                            {installProgress === 100 ? "INSTALL COMPLETE" : "INSTALLING SYSTEM"}
                          </h3>
                          {/* Dynamic Step description */}
                          <p className={`text-[11px] font-medium font-mono truncate max-w-[240px] mt-0.5 transition-colors duration-500 ${
                            installProgress === 100 ? "text-emerald-500/90" : "text-slate-400"
                          }`}>
                            &gt; {installProgress === 100 ? "Launch Plugsy from home screen!" : INSTALL_STEPS[installStep]}
                          </p>
                        </div>
                        <span className={`text-xs font-black font-mono transition-colors duration-500 ${
                          installProgress === 100 ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {installProgress}%
                        </span>
                      </div>

                      {/* Interactive Visual Progress Bar */}
                      <div className="space-y-3">
                        <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden border border-white/5 p-[1px]">
                          <motion.div
                            className={`h-full rounded-full transition-all duration-500 ${
                              installProgress === 100
                                ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                : "bg-gradient-to-r from-[#EF4444] to-[#f97316] shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                            }`}
                            initial={{ width: "0%" }}
                            animate={{ width: `${installProgress}%` }}
                            transition={{ ease: "easeOut" }}
                          />
                        </div>

                        {/* Skeleton Interface Mock/Preview while installing */}
                        <div className="bg-slate-950/60 rounded-xl p-3 border border-white/5 space-y-2 relative overflow-hidden select-none">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                          
                          {/* Mock header row */}
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-md transition-colors duration-500 ${
                              installProgress === 100 ? "bg-emerald-500/20" : "bg-white/10"
                            }`} />
                            <div className={`h-2 rounded-full transition-all duration-500 ${
                              installProgress === 100 ? "w-24 bg-emerald-500/20" : "w-16 bg-white/10"
                            }`} />
                            <div className="h-2 w-8 bg-white/5 rounded-full ml-auto" />
                          </div>
                          
                          {/* Mock contents row */}
                          <div className="space-y-1.5 pt-1">
                            <div className="h-1.5 w-full bg-white/5 rounded-full" />
                            <div className="h-1.5 w-3/4 bg-white/5 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
