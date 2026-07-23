import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const LOADING_MESSAGES = [
  "Loading Creator Hub...",
  "Syncing Portfolios...",
  "Securing Connection...",
  "Preparing Dashboard..."
];

export default function LoadingSplash() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0A0A0C]">
      <div className="flex flex-col items-center gap-8">
        <motion.img 
          src="https://i.postimg.cc/4dHFwnzr/IMG-1987.png" 
          alt="Plugsy Logo" 
          className="w-24 h-24 rounded-2xl object-contain drop-shadow-xl"
          animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className="w-48 h-[2px] overflow-hidden bg-black/5 dark:bg-white/5 rounded-full">
            <motion.div 
              className="h-full bg-black dark:bg-white rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          </div>
          
          <div className="h-4 relative w-48 flex justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-gray-500 font-medium tracking-widest uppercase absolute"
              >
                {LOADING_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
