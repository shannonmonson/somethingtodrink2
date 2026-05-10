import React, { useState } from 'react';
import { signInWithGoogle, signupWithEmail, signinWithEmail } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Coffee, GlassWater, Wine, Mail, Lock, ArrowRight, Loader2, User as UserIcon } from 'lucide-react';
import { updateProfile } from 'firebase/auth';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        const { user } = await signupWithEmail(email, password);
        if (displayName.trim()) {
          await updateProfile(user, { displayName: displayName.trim() });
        }
      } else {
        await signinWithEmail(email, password);
      }
    } catch (err: any) {
      console.error(err);
      let message = 'Authentication failed';
      if (err.code === 'auth/email-already-in-use') message = 'Email already in use';
      if (err.code === 'auth/invalid-email') message = 'Invalid email address';
      if (err.code === 'auth/weak-password') message = 'Password is too weak';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') message = 'Invalid credentials';
      if (err.message?.includes('configuration')) {
        message = 'Email auth not enabled. Please enable it in Firebase Console.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center py-12 md:py-20 px-6 md:p-8 text-center relative overflow-x-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-primary opacity-[0.03] rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-secondary opacity-[0.03] rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="max-w-xl w-full space-y-8 md:space-y-12 relative z-10"
      >
        <div className="space-y-4 md:space-y-6">
          <div className="flex justify-center gap-6 md:gap-8 text-brand-primary opacity-30 ink-bleed">
            <div className="-rotate-12"><GlassWater size={42} className="md:w-[52px] md:h-[52px]" strokeWidth={3} /></div>
            <div className="rotate-6"><Coffee size={42} className="md:w-[52px] md:h-[52px]" strokeWidth={3} /></div>
            <div className="-rotate-6"><Wine size={42} className="md:w-[52px] md:h-[52px]" strokeWidth={3} /></div>
          </div>
          <h1 className="text-5xl md:text-8xl font-display text-brand-primary leading-[0.8] tracking-tighter uppercase text-center flex flex-col items-center organic-text ink-bleed">
            <span className="painted-block -rotate-1">SOMETHING</span>
            <span className="rotate-1">TO</span>
            <span className="bg-brand-primary text-white px-4 pb-2 -rotate-1">DRINK.</span>
          </h1>
          <p className="text-text-muted font-bold tracking-tight leading-snug max-w-sm mx-auto text-base md:text-lg uppercase opacity-60">
            A place to share your latest drink and plan your future sips.
          </p>
        </div>

        <div className="max-w-sm mx-auto w-full space-y-6 md:space-y-8">
          <div className="space-y-4">
            <button
              onClick={signInWithGoogle}
              className="group w-full bg-brand-primary text-white py-5 md:py-6 rounded-[32px] font-black tracking-[0.3em] uppercase text-[10px] shadow-[0_24px_48px_-12px_rgba(90,90,64,0.3)] hover:bg-brand-primary/95 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-4 border border-brand-primary cursor-pointer"
            >
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center scale-90 group-hover:scale-100 transition-transform">
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-3 h-3 grayscale opacity-80" />
              </div>
              Sign in with Google
            </button>

            <div className="flex items-center gap-4 py-2">
              <div className="flex-1 h-[1px] bg-brand-primary/10" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted/60">or use email</span>
              <div className="flex-1 h-[1px] bg-brand-primary/10" />
            </div>

            <div className="flex bg-white/50 backdrop-blur-sm p-1 border-2 border-brand-primary/10 rounded-[28px] overflow-hidden">
              <button 
                onClick={() => { setIsSignUp(false); setError(null); }}
                className={`flex-1 py-4 text-[11px] md:text-[10px] font-black uppercase tracking-widest transition-all rounded-[24px] ${!isSignUp ? 'bg-brand-primary text-white shadow-lg' : 'text-text-muted hover:text-brand-primary'}`}
              >
                Log In
              </button>
              <button 
                onClick={() => { setIsSignUp(true); setError(null); }}
                className={`flex-1 py-4 text-[11px] md:text-[10px] font-black uppercase tracking-widest transition-all rounded-[24px] ${isSignUp ? 'bg-brand-primary text-white shadow-lg' : 'text-text-muted hover:text-brand-primary'}`}
              >
                Sign Up
              </button>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3 md:space-y-4 pt-2 md:pt-4">
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="relative group overflow-hidden"
                >
                  <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/40 group-focus-within:text-brand-primary transition-colors" size={18} />
                  <input
                    required
                    type="text"
                    placeholder="DISPLAY NAME"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-white border-2 border-brand-primary/10 rounded-[20px] pl-16 pr-8 py-4 md:py-5 text-xs font-display uppercase tracking-tight outline-none focus:border-brand-primary focus:ring-4 ring-brand-primary/5 transition-all placeholder:text-text-muted/30"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/40 group-focus-within:text-brand-primary transition-colors" size={18} />
              <input
                required
                type="email"
                placeholder="EMAIL ADDRESS"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border-2 border-brand-primary/10 rounded-[20px] pl-16 pr-8 py-4 md:py-5 text-xs font-display uppercase tracking-tight outline-none focus:border-brand-primary focus:ring-4 ring-brand-primary/5 transition-all placeholder:text-text-muted/30"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary/40 group-focus-within:text-brand-primary transition-colors" size={18} />
              <input
                required
                type="password"
                placeholder="PASSWORD"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border-2 border-brand-primary/10 rounded-[20px] pl-16 pr-8 py-4 md:py-5 text-xs font-display uppercase tracking-tight outline-none focus:border-brand-primary focus:ring-4 ring-brand-primary/5 transition-all placeholder:text-text-muted/30"
              />
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full bg-brand-primary text-white py-5 md:py-6 rounded-[32px] font-black tracking-[0.3em] uppercase text-[11px] shadow-xl hover:bg-brand-primary/95 transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95 mt-2 md:mt-4"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  {isSignUp ? 'Create Archive' : 'Open Archive'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-5 border-l-4 border-red-600 text-left shadow-sm"
              >
                {error}
              </motion.div>
            )}
          </form>
        </div>

        <div className="pt-12" />
      </motion.div>
    </div>
  );
}
