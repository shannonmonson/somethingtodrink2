import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search as SearchIcon, User, ArrowRight, Camera, Globe } from 'lucide-react';
import { useAuth } from '../App';
import { logout } from '../lib/firebase';

export default function Navigation() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: '/', icon: Camera, label: 'Feed' },
    { to: '/map', icon: Globe, label: 'Map' },
    { to: `/profile/${user?.uid}`, icon: User, label: 'Profile' },
    { to: '/search', icon: SearchIcon, label: 'Sippers' },
  ];

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-bg-base border-t border-border-subtle px-8 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] flex justify-between items-center z-[100] md:hidden">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 transition-colors ${
                isActive ? 'text-brand-primary' : 'text-text-muted'
              }`
            }
          >
            <Icon size={20} strokeWidth={2} />
            <span className="text-[8px] font-bold uppercase tracking-[0.3em] font-display">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Desktop Sidebar Nav */}
      <nav className="w-80 bg-bg-alt border-r border-border-subtle flex flex-col p-10 shrink-0 sticky top-0 h-dvh hidden md:flex">
        <div className="mb-10">
          <h1 
            onClick={() => navigate('/')}
            className="text-2xl font-display text-brand-primary leading-none tracking-widest uppercase flex flex-col organic-text ink-bleed cursor-pointer"
          >
            <span className="-rotate-1">SOMETHING</span>
            <span className="rotate-1">TO</span>
            <span className="bg-brand-primary text-white px-2 -rotate-2 w-fit">DRINK.</span>
          </h1>
        </div>
        
        <div className="space-y-8 flex-1 relative z-10">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-6 font-black transition-all group ${
                  isActive ? 'text-brand-primary translate-x-2' : 'text-text-muted hover:text-brand-primary hover:translate-x-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-12 h-12 flex items-center justify-center transition-all duration-300 border-2 ${
                    isActive 
                      ? 'bg-brand-primary text-white border-brand-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] -rotate-3' 
                      : 'border-text-muted/20 text-text-muted group-hover:border-brand-primary rotate-1'
                  }`}>
                    <Icon size={20} strokeWidth={isActive ? 3 : 2} />
                  </div>
                  <span className="uppercase tracking-[0.4em] text-[10px] font-display">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto pt-10 border-t border-brand-primary/5">
          <button
            onClick={() => {
              if (window.confirm('Ready to sign out?')) {
                logout();
              }
            }}
            className="flex items-center gap-4 text-text-muted hover:text-brand-primary transition-colors group px-2"
          >
            <div className="w-10 h-10 flex items-center justify-center border-2 border-text-muted/10 group-hover:border-brand-primary transition-all duration-300 -rotate-2">
              <ArrowRight size={18} strokeWidth={2} className="rotate-180" />
            </div>
            <span className="uppercase tracking-[0.4em] text-[10px] font-display">Log Out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
