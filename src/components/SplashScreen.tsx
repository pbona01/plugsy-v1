import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Hide after 1.5 seconds delay + some safe buffer for the entrance transition
    const timer = setTimeout(() => {
      setShow(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-[#0A0A0C] flex flex-col items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, filter: "blur(10px)", y: 0 }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center"
          >
            <img 
              src="https://i.postimg.cc/4dHFwnzr/IMG-1987.png" 
              alt="Plugsy Logo" 
              className="w-32 h-32 md:w-40 md:h-40 rounded-3xl object-contain drop-shadow-2xl" 
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
