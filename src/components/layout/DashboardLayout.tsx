import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { optimizeCloudinaryUrl } from '../../lib/cloudinary';
import { 
  Home, CreditCard, Briefcase, GraduationCap, 
  Image as ImageIcon, Share2, Settings, Search, Bell,
  Menu, X, LogOut, Wallet
} from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from '../ui/Logo';

interface Props {
  children: React.ReactNode;
  user: any;
}

export default function DashboardLayout({ children, user }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error("Logout error:", error);
      navigate('/');
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Products', href: '/products', icon: CreditCard },
    { name: 'Wallet', href: '/wallet', icon: Wallet },
    { name: 'Learn', href: '/learn', icon: GraduationCap },
    { name: 'Refer & Earn', href: '/refer', icon: Share2 }
  ];

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[var(--brand-border)] bg-[var(--brand-card)] fixed h-full z-20">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-auto flex items-center justify-center">
              <Logo className="h-8 w-auto object-contain" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-[var(--brand-text)]">Plugsy</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 ${
                  isActive 
                    ? 'bg-[#3B82F6]/10 text-[#3B82F6] shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]' 
                    : 'text-[var(--brand-text)]/60 hover:text-[var(--brand-text)] hover:bg-[var(--brand-text)]/5'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-[#3B82F6]' : ''}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        
        {/* User profile card inside sidebar */}
        <div className="p-4 mt-auto">
          <div className="bg-[var(--brand-card)] border border-[var(--brand-border)] rounded-2xl p-3 mb-4">
             <p className="text-[10px] font-bold text-[var(--brand-text-secondary)] uppercase tracking-wider text-center">
                Smart, Lower the Cost, and for All.
             </p>
          </div>
          <div className="bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-2xl p-4 overflow-hidden relative group">
            <div className="flex items-center gap-3">
              <img 
                src={optimizeCloudinaryUrl(user?.imageUrl || `https://ui-avatars.com/api/?name=${user?.primaryEmailAddress?.emailAddress || 'User'}&background=3B82F6&color=fff`)} 
                loading="lazy"
                alt="avatar" 
                className="w-8 h-8 rounded-full border border-[var(--brand-border)]" 
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--brand-text)] truncate">{user?.fullName || 'Creator'}</div>
                <div className="text-[10px] text-[var(--brand-text-secondary)]">Creator</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-64 relative min-h-screen">
        {/* Top Header */}
        <header className="h-20 border-b border-[var(--brand-border)] bg-[var(--brand-bg)]/80 backdrop-blur-md sticky top-0 z-10 hidden md:flex items-center justify-between px-8">
          <div className="flex-1 max-w-xl flex items-center">
             <button 
               onClick={() => window.history.back()} 
               className="mr-4 p-2 rounded-full hover:bg-[var(--brand-text)]/5 transition-colors text-[var(--brand-text)]/60 hover:text-[var(--brand-text)]"
               title="Go Back"
             >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
             </button>
             <div className="relative group w-full">
               <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-text)]/40 group-focus-within:text-[#3B82F6] transition-colors" />
               <input 
                 type="text" 
                 placeholder="Search for tools, resources..." 
                 className="w-full bg-[var(--brand-card)] border border-[var(--brand-border)] rounded-full py-2.5 pl-10 pr-4 text-sm text-[var(--brand-text)] focus:outline-none focus:border-[#3B82F6]/50 focus:ring-1 focus:ring-[#3B82F6]/50 transition-all placeholder:text-[var(--brand-text)]/30"
               />
               <kbd className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-[var(--brand-text)]/10 text-[10px] font-bold text-[var(--brand-text)]/40">⌘K</kbd>
             </div>
          </div>

          <div className="flex items-center gap-6">
             <button className="relative w-10 h-10 rounded-full border border-[var(--brand-border)] flex items-center justify-center text-[var(--brand-text)]/60 hover:text-[var(--brand-text)] hover:bg-[var(--brand-text)]/5 transition-all">
               <Bell className="w-5 h-5" />
             </button>
             
             <div className="relative">
               <button 
                 onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                 className="flex items-center gap-3 pl-6 border-l border-[var(--brand-border)] cursor-pointer hover:opacity-80 transition-opacity"
               >
                 <img src={user?.imageUrl || `https://ui-avatars.com/api/?name=${user?.primaryEmailAddress?.emailAddress || 'User'}&background=3B82F6&color=fff`} alt="avatar" className="w-9 h-9 rounded-full border border-[#3B82F6]/30" />
                 <div className="hidden lg:block text-left">
                   <div className="text-sm font-bold text-[var(--brand-text)]">{user?.fullName || 'Creator'}</div>
                   <div className="text-[10px] text-[#3B82F6] font-medium tracking-wide">Pro Member</div>
                 </div>
                 <svg className={`w-4 h-4 text-[var(--brand-text)]/40 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
               </button>

               <AnimatePresence>
                 {isProfileMenuOpen && (
                   <>
                     <div 
                       className="fixed inset-0 z-10" 
                       onClick={() => setIsProfileMenuOpen(false)} 
                     />
                     <motion.div
                       initial={{ opacity: 0, y: 10, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 10, scale: 0.95 }}
                       className="absolute right-0 mt-2 w-56 bg-[var(--brand-card)] border border-[var(--brand-border)] rounded-2xl shadow-2xl z-20 py-2 overflow-hidden"
                     >
                       <div className="px-4 py-3 border-b border-[var(--brand-border)] mb-1">
                         <div className="text-sm font-bold text-[var(--brand-text)] mb-0.5">{user?.fullName || 'Creator'}</div>
                         <div className="text-[10px] text-[var(--brand-text-secondary)] truncate">{user?.primaryEmailAddress?.emailAddress}</div>
                       </div>
                       
                       <Link 
                         to="/settings" 
                         className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[var(--brand-text-secondary)] hover:text-[var(--brand-text)] hover:bg-[var(--brand-text)]/5 transition-all"
                         onClick={() => setIsProfileMenuOpen(false)}
                       >
                         <Settings className="w-4 h-4" />
                         Account Settings
                       </Link>
                       
                       <button 
                         onClick={handleLogout}
                         className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-all border-t border-[var(--brand-border)] mt-1"
                       >
                         <LogOut className="w-4 h-4" />
                         Sign Out
                       </button>
                     </motion.div>
                   </>
                 )}
               </AnimatePresence>
             </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden h-16 border-b border-[var(--brand-border)] bg-[var(--brand-bg)] flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.history.back()} 
              className="p-1 -ml-1 mr-1 rounded-full hover:bg-[var(--brand-text)]/5 transition-colors text-[var(--brand-text)]/60 hover:text-[var(--brand-text)]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <Link to="/" className="flex items-center gap-2">
              <div className="h-6 w-auto flex items-center justify-center">
                <Logo className="h-6 w-auto object-contain" />
              </div>
              <span className="font-display font-bold text-lg text-[var(--brand-text)]">Plugsy</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-[var(--brand-text)] p-2">
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </header>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-0 top-16 bg-[var(--brand-card)] z-40 md:hidden p-4 pb-32 overflow-y-auto border-t border-[var(--brand-border)]"
            >
              <div className="space-y-2">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                        isActive 
                          ? 'bg-[#3B82F6]/10 text-[#3B82F6]' 
                          : 'text-[var(--brand-text)]/60 hover:text-[var(--brand-text)] hover:bg-[var(--brand-text)]/5'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
                
                <div className="pt-4 mt-4 border-t border-[var(--brand-border)]">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium transition-all text-red-500 hover:bg-red-500/5"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Page area */}
        <main className="flex-1 relative pb-16">
          {children}
        </main>
        
        {/* Footer */}
        <footer className="py-6 px-8 border-t border-[var(--brand-border)] bg-[var(--brand-bg)] mt-auto flex items-center justify-center sm:justify-start">
          <a 
            href="https://twitter.com/TruthOverComfort" 
            target="_blank" 
            rel="noreferrer" 
            className="text-[10px] font-black uppercase tracking-widest text-[#3B82F6]/60 hover:text-[#3B82F6] transition-colors flex items-center gap-2"
          >
            Powered by <span className="text-[#3B82F6]">@TruthOverComfort</span>
          </a>
        </footer>
      </div>
    </div>
  );
}
