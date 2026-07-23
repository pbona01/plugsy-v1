import React, { createContext, useContext, useState, useEffect } from "react";

interface PortfolioAccessContextType {
  isPortfolioUnlocked: boolean;
  setIsPortfolioUnlocked: (unlocked: boolean) => void;
}

const PortfolioAccessContext = createContext<PortfolioAccessContextType>({
  isPortfolioUnlocked: false,
  setIsPortfolioUnlocked: () => {},
});

export const PortfolioAccessProvider = ({ children }: { children: React.ReactNode }) => {
  const [isPortfolioUnlocked, setIsPortfolioUnlocked] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("vp_unlocked") === "true";
    }
    return false;
  });

  const handleSetUnlocked = (unlocked: boolean) => {
    setIsPortfolioUnlocked(unlocked);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("vp_unlocked", unlocked ? "true" : "false");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkUnlock = () => {
        const val = sessionStorage.getItem("vp_unlocked") === "true";
        if (val !== isPortfolioUnlocked) {
          setIsPortfolioUnlocked(val);
        }
      };
      // Check for changes periodically
      const interval = setInterval(checkUnlock, 1000);
      return () => clearInterval(interval);
    }
  }, [isPortfolioUnlocked]);

  return (
    <PortfolioAccessContext.Provider
      value={{ isPortfolioUnlocked, setIsPortfolioUnlocked: handleSetUnlocked }}
    >
      {children}
    </PortfolioAccessContext.Provider>
  );
};

export const usePortfolioAccess = () => useContext(PortfolioAccessContext);
