import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Paperclip, ArrowUp, X, Loader2, RefreshCw, MessageSquare } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import toast, { Toaster } from 'react-hot-toast';
import { GoogleGenAI } from "@google/genai";
import { optimizeCloudinaryUrl } from '../../lib/cloudinary';
import { compressAndUpload } from '../../utils/uploadMedia';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';

import { LiquidGlass } from '../ui/LiquidGlass';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_GEMINI_API_KEY : undefined);
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
  createdAt: number;
  imageUrl?: string;
}

const FAQS = [
  { q: "How do I pay?", a: "Simply select a plan on the CapCut Pro page and click 'Activate' or 'Buy Now'. You can pay instantly using your card or bank transfer via Paystack." },
  { q: "How long is confirmation?", a: "Confirmation is instant! Once Paystack confirms your payment, our team is notified automatically." },
  { q: "Is this automatic?", a: "Payment verification is automatic. Our team then prepares and sends your premium logins within minutes." },
  { q: "What is CapCut Max Pro?", a: "It's the ultimate toolkit for creators, removing watermarks and providing all premium features." }
];

export default function ChatWidget() {
  const location = useLocation();
  const { user } = useUser();
  const { unreadCount } = useUnreadMessages();
  const [isOpen, setIsOpen] = useState(false);
  const [isDashboardModalOpen, setIsDashboardModalOpen] = useState(false);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('open-chat', handleOpenChat);
    return () => window.removeEventListener('open-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    const handleModalChange = (e: any) => {
      setIsDashboardModalOpen(!!e?.detail?.open);
    };

    if (typeof document !== 'undefined') {
      const isCurrentlyOpen = document.body.classList.contains('dashboard-modal-open');
      setIsDashboardModalOpen(isCurrentlyOpen);
    }

    window.addEventListener('dashboard-modal', handleModalChange);
    return () => window.removeEventListener('dashboard-modal', handleModalChange);
  }, []);

  // Monitor DOM for any active modals to hide the chat widget
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkModals = () => {
      const elements = Array.from(document.querySelectorAll('.fixed, .absolute'));
      const hasModal = elements.some((el: any) => {
        if (containerRef.current && (containerRef.current === el || containerRef.current.contains(el))) {
          return false;
        }
        const classes = typeof el.className === 'string' ? el.className : (typeof el.className?.baseVal === 'string' ? el.className.baseVal : '');
        const isToast = classes.includes('toast') || el.id?.includes('toast') || el.id === 'webpack-hot-middleware' || classes.includes('Toaster');
        if (isToast) return false;

        const hasZIndex = classes.includes('z-50') || classes.includes('z-[50]') || window.getComputedStyle(el).zIndex === '50';
        const hasBgMask = classes.includes('bg-black/70') || classes.includes('bg-black/60') || classes.includes('bg-black/50');
        return hasZIndex || hasBgMask;
      });
      setIsAnyModalOpen(hasModal);
    };

    checkModals();

    const observer = new MutationObserver(() => {
      checkModals();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Hide on admin, chat, and support pages to avoid overlapping with native full-page chats, or when any modal is open
  if (
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/support') ||
    isDashboardModalOpen ||
    isAnyModalOpen
  ) {
    return null;
  }

  const handleSend = async (text: string = input, imageUrl?: string) => {
    if (!text.trim() && !imageUrl) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      text: text || "[Image Attachment]",
      sender: 'user',
      createdAt: Date.now(),
      imageUrl
    };

    const currentMessages = [...messages, newMsg];
    setMessages(currentMessages);
    setInput('');

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: "Thanks for your message! Our team will get back to you shortly.",
        sender: 'bot',
        createdAt: Date.now()
      }]);
    }, 1000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading("Uploading image asset...", { id: "widget-upload" });

    try {
      const url = await compressAndUpload(file);
      handleSend("", url);
      toast.success("Image sent successfully!", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image", { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFaqClick = (faq: typeof FAQS[0]) => {
    handleSend(faq.q);
  };

  const resetChat = () => {
    setMessages([]);
    setInput('');
  };

  const userName = user?.firstName || 'Anwar';

  return (
    <div ref={containerRef} className="fixed bottom-24 right-6 sm:right-8 sm:bottom-8 z-[100] font-sans flex flex-col items-end chat-widget-container">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mb-6 w-[calc(100vw-32px)] sm:w-[420px] h-[560px] rounded-3xl overflow-hidden relative shadow-2xl flex flex-col justify-between"
          >
            {/* Ambient Lighting Gradient Behind Card */}
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-accent/20 via-brand-surface/90 to-brand-surface/90 pointer-events-none" />
            
            {/* Main Glassmorphic Wrapper */}
            <LiquidGlass blur={16} chromaticAberration={2} className="relative flex-1 bg-white/60 dark:bg-brand-surface/80 border border-black/10 dark:border-brand-border/50 flex flex-col justify-between overflow-hidden !rounded-none shadow-[inset_0_1.5px_2px_0px_rgba(255,255,255,0.6)] dark:shadow-none backdrop-blur-xl">
              
              {messages.length === 0 ? (
                /* Welcome View */
                <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-10 relative">
                  
                  {/* Absolute positioning of close button on Welcome View */}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="absolute top-4 right-4 p-1.5 hover:bg-brand-card/10 rounded-full text-white/60 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex flex-col items-center mb-6 text-center">
                    {/* Glowing orb */}
                    <div 
                      className="w-14 h-14 rounded-full mb-6 bg-[radial-gradient(circle_at_30%_30%,_#67e8f9_0%,_#3b82f6_50%,_#1e3a8a_100%)] shadow-[0_0_24px_rgba(59,130,246,0.6)] animate-pulse"
                    />
                    
                    <h2 className="text-slate-900 dark:text-white text-lg sm:text-xl font-medium tracking-tight mb-1">
                      Hi there, {userName}
                    </h2>
                    <h3 className="text-slate-900 dark:text-white text-2xl sm:text-3xl font-bold tracking-tight">
                      What's on <span className="text-blue-500 dark:text-blue-400">your mind?</span>
                    </h3>
                  </div>

                  {/* FAQ quick suggestions */}
                  <div className="w-full max-w-sm mb-6 flex flex-wrap gap-2 justify-center">
                    {FAQS.map((faq, i) => (
                      <button
                        key={i}
                        onClick={() => handleFaqClick(faq)}
                        className="text-[11px] font-bold text-slate-800 dark:text-white/70 bg-black/5 dark:bg-slate-900/50 hover:bg-black/10 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-full border border-black/10 dark:border-white/5 shadow-[inset_0_1.5px_2px_0px_rgba(255,255,255,0.6)] dark:shadow-none transition-all"
                      >
                        {faq.q}
                      </button>
                    ))}
                  </div>

                </div>
              ) : (
                /* Compact Active Chat Header + Scrollable History View */
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* Compact Header */}
                  <div className="p-4 bg-white/40 dark:bg-slate-950/40 border-b border-black/10 dark:border-white/5 shadow-[inset_0_1.5px_2px_0px_rgba(255,255,255,0.6)] dark:shadow-none flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[radial-gradient(circle_at_30%_30%,_#67e8f9_0%,_#3b82f6_50%,_#1e3a8a_100%)] shadow-[0_0_12px_rgba(59,130,246,0.5)] flex items-center justify-center relative">
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-white dark:border-[#0B0F19]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Plugsy Chat</h3>
                        <p className="text-[10px] text-slate-500 dark:text-gray-400 font-medium">Active Assistant</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={resetChat} 
                        title="Reset conversation" 
                        className="p-1.5 hover:bg-black/5 dark:hover:bg-brand-card/10 rounded-lg text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setIsOpen(false)} 
                        className="p-1.5 hover:bg-black/5 dark:hover:bg-brand-card/10 rounded-lg text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {messages.map((msg, index) => {
                      const isUser = msg.sender === 'user';
                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                      const isPrevSameSender = prevMsg && prevMsg.sender === msg.sender;
                      const isNextSameSender = nextMsg && nextMsg.sender === msg.sender;

                      const light = typeof document !== 'undefined' && document?.documentElement?.classList?.contains("light");
                      const bubbleGlassStyle = isUser
                        ? {
                            background: light
                              ? "linear-gradient(135deg, rgba(0, 102, 255, 0.16), rgba(0, 102, 255, 0.05))"
                              : "linear-gradient(135deg, rgba(0, 102, 255, 0.22), rgba(0, 102, 255, 0.08))",
                            boxShadow: light
                              ? "inset 0 1px 1.5px 0px rgba(255, 255, 255, 0.4)"
                              : "inset 0 1px 1px 0px rgba(255, 255, 255, 0.15)",
                            color: light ? "#0f172a" : "#ffffff",
                            borderColor: "rgba(255, 255, 255, 0.1)",
                          }
                        : {
                            background: light
                              ? "linear-gradient(135deg, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.45))"
                              : "linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02))",
                            boxShadow: light
                              ? "inset 0 1px 1.5px 0px rgba(255, 255, 255, 0.7)"
                              : "inset 0 1px 1px 0px rgba(255, 255, 255, 0.15)",
                            color: light ? "#1e293b" : "#e2e8f0",
                            borderColor: "rgba(255, 255, 255, 0.1)",
                          };

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isPrevSameSender ? 'mt-1 !mt-1' : 'mt-4 !mt-4'}`}
                        >
                          <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
                            <div
                              style={bubbleGlassStyle}
                              className={`p-3.5 px-4 text-sm font-medium tracking-tight leading-relaxed border-[0.5px] backdrop-blur-xl transition-all duration-300 ease-in-out ${
                                isUser ? "rounded-[20px] rounded-br-[4px]" : "rounded-[20px] rounded-bl-[4px]"
                              }`}
                            >
                              {msg.imageUrl && (
                                <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block mb-2 overflow-hidden rounded-2xl">
                                  <img 
                                    src={optimizeCloudinaryUrl(msg.imageUrl)} 
                                    loading="lazy"
                                    alt="Payload Attachment" 
                                    className="max-w-[180px] w-full object-cover select-none" 
                                  />
                                </a>
                              )}
                              <div className="whitespace-pre-wrap">{msg.text}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    
                    <div ref={messagesEndRef} />
                  </div>

                </div>
              )}

              {/* The Integrated Input Capsule Area */}
              <div className="p-6 pt-0 bg-transparent shrink-0">
                <LiquidGlass blur={12} chromaticAberration={2} className="w-full bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-[30px] p-4 border border-black/10 dark:border-white/5 relative shadow-[inset_0_1.5px_2px_0px_rgba(255,255,255,0.6)] dark:shadow-inner">
                  {/* Text Area Entry */}
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-slate-400 dark:text-white/50 mt-2 shrink-0" />
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Ask me anything..."
                      className="w-full bg-transparent border-none focus:ring-0 focus:outline-none hover:ring-0 outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 resize-none h-14 p-0 pt-2 text-[15px]"
                    />
                  </div>

                  {/* Bottom Action Bar Row */}
                  <div className="flex items-center justify-between mt-3">
                    {/* Left Tools */}
                    <div className="flex items-center">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 bg-black/5 dark:bg-slate-805/40 hover:bg-black/10 dark:hover:bg-slate-800/80 text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border border-black/10 dark:border-white/5 disabled:opacity-50"
                      >
                        {uploading ? (
                          <Loader2 className="w-4.5 h-4.5 animate-spin text-[#67e8f9]" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                        Attach
                      </button>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>

                    {/* Right Submit Trigger */}
                    <button 
                      onClick={() => handleSend()}
                      disabled={!input.trim() || uploading}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:hover:bg-blue-600 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                </LiquidGlass>
              </div>

            </LiquidGlass>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle, matching glassy utility anchor icon */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-[#0B0F19]/80 backdrop-blur-xl border border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-center relative group overflow-hidden"
      >
        <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {/* Tasteful subtle continuous pulse glowing border */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full border border-blue-400/40 animate-pulse pointer-events-none" />
        )}
        
        <div className="w-6 h-6 rounded-full bg-[radial-gradient(circle_at_30%_30%,_#67e8f9_0%,_#3b82f6_50%,_#1e3a8a_100%)] shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
        
        {/* Unread badge on widget trigger */}
        {!isOpen && unreadCount > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 w-[16px] h-[16px] rounded-full bg-blue-600 border border-[#0B0F19] text-white flex items-center justify-center text-[8px] font-black shadow-lg animate-pulse"
            style={{ zIndex: 100 }}
          >
            {unreadCount}
          </span>
        )}
      </motion.button>
    </div>
  );
}
