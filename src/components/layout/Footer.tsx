import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Twitter, Instagram, MessageCircle } from "lucide-react";

export default function Footer() {
  const { isSignedIn } = useAuth();

  return (
    <footer className="border-t border-brand-border bg-brand-surface pt-16 md:pt-24 pb-8 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <Link
            to={isSignedIn ? "/dashboard" : "/register"}
            className="flex items-center gap-3 px-8 py-4 bg-brand-accent/10 border border-brand-accent/20 rounded-full font-black uppercase tracking-widest text-brand-accent hover:bg-brand-accent hover:text-white transition-all duration-300 mb-16 shadow-lg shadow-brand-accent/5"
          >
            <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
            Join 1000+ plugged-in users
          </Link>

          <Link to="/" className="flex items-center gap-2 group mb-8">
            <div className="w-10 h-10 rounded-full bg-brand-accent flex items-center justify-center font-black text-white shadow-lg group-hover:scale-110 transition-transform">
              P
            </div>
            <span className="text-3xl font-normal tracking-[-0.02em] text-brand-text uppercase font-display">
              Plugsy<span className="text-brand-accent">.</span>
            </span>
          </Link>

          <nav className="flex flex-wrap justify-center gap-x-12 gap-y-6 mb-12">
            <Link
              to="/products"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              Products
            </Link>
            <Link
              to="/about"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              About Plugsy
            </Link>
            <Link
              to="/coming-soon"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              Learn with Plugsy
            </Link>
            <Link
              to="/support"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              Support
            </Link>
            <Link
              to="/terms"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="text-sm font-bold text-brand-text-secondary hover:text-brand-text transition-colors tracking-tight uppercase"
            >
              Privacy Policy
            </Link>
          </nav>

          <div className="flex justify-center gap-8 mb-12">
            <a
              href="https://x.com/plugsyng?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-full bg-brand-surface dark:bg-white/5 border border-brand-border text-brand-text hover:text-white hover:bg-[#000000] hover:border-[#1DA1F2] transition-all shadow-sm"
            >
              <Twitter size={24} />
            </a>
            <a
              href="https://www.tiktok.com/@plugsyng?_r=1&_t=ZS-96H4C3wqQOz"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-full bg-brand-surface dark:bg-white/5 border border-brand-border text-brand-text hover:text-white hover:bg-[#000000] hover:border-[#00f2fe] transition-all shadow-sm"
            >
              <img
                src="https://i.postimg.cc/jjtSqKQN/download-removebg-preview.png"
                alt="TikTok"
                className="w-6 h-6 object-contain"
              />
            </a>
            <a
              href="https://www.instagram.com/plugsyng?igsh=enlhdXhxZ2Y2OWQ%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-full bg-brand-surface dark:bg-white/5 border border-brand-border text-brand-text hover:text-white hover:bg-gradient-to-tr hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888] transition-all shadow-sm"
            >
              <Instagram size={24} />
            </a>
          </div>

          <div className="pt-12 w-full border-t border-brand-border text-[10px] font-black uppercase tracking-[0.3em] text-brand-text-secondary">
            &copy; {new Date().getFullYear()} Plugsy Platform &bull; Your
            gateway to affordable premium services.
            <div className="mt-2 text-brand-text-secondary/60">
              Smart, Lower the Cost, and for All.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
