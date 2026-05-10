import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { UserProfile } from './types';

// Pages
import Feed from './pages/Feed';
import Profile from './pages/Profile';
import MapView from './pages/MapView';
import Search from './pages/Search';
import Auth from './pages/Auth';
import Navigation from './components/Navigation';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const useAuth = () => useContext(AuthContext);

import { APIProvider } from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (authUser) {
        const userDoc = doc(db, 'users', authUser.uid);
        
        // Use onSnapshot for real-time profile updates
        unsubscribeProfile = onSnapshot(userDoc, async (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
            setLoading(false);
          } else {
            // Create profile if it doesn't exist
            const newProfile: any = {
              uid: authUser.uid,
              displayName: authUser.displayName || 'Friend',
              email: authUser.email || '',
              photoURL: authUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(authUser.displayName || 'User')}&background=random`,
              bio: '',
              createdAt: serverTimestamp(),
            };
            try {
              await setDoc(userDoc, newProfile);
              // Profile state will be updated by the next snapshot
            } catch (err) {
              console.error("Error creating user profile:", err);
              setLoading(false);
            }
          }
        }, (err) => {
          console.error("Profile snapshot error:", err);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fefdfa] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (!hasValidKey) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-8 font-sans">
        <div className="max-w-md w-full bg-white border-4 border-brand-primary p-12 shadow-[16px_16px_0px_0px_rgba(0,0,0,0.1)] text-center">
          <h2 className="text-4xl font-display text-brand-primary uppercase tracking-tighter mb-6 ink-bleed">Map Key Required</h2>
          <p className="text-sm text-text-muted mb-8 leading-relaxed">To enable location suggestions, please add your Google Maps API key.</p>
          <ol className="text-left text-xs space-y-4 mb-10 text-text-main font-medium uppercase tracking-tight">
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-brand-primary text-white flex-shrink-0 flex items-center justify-center">1</span>
              <span>Get a key from the Google Cloud Console</span>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-brand-primary text-white flex-shrink-0 flex items-center justify-center">2</span>
              <span>Open Settings (⚙️) → Secrets</span>
            </li>
            <li className="flex gap-4">
              <span className="w-6 h-6 bg-brand-primary text-white flex-shrink-0 flex items-center justify-center">3</span>
              <span>Add <code className="bg-bg-alt px-1">GOOGLE_MAPS_PLATFORM_KEY</code></span>
            </li>
          </ol>
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-black opacity-40">The app will rebuild automatically</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider 
      apiKey={API_KEY} 
      version="weekly"
      libraries={['places', 'marker', 'geometry']}
      onLoad={() => console.log('Maps API Loaded')}
      onError={(err) => {
        console.error('Maps Load Error:', err);
        // Dispatch failure for any error string that suggests an auth/key issue
        const errStr = String(err);
        if (
          errStr.includes('InvalidKey') || 
          errStr.includes('ApiNotActivated') || 
          errStr.includes('PermissionDenied') ||
          errStr.includes('KeyNotAuthorized')
        ) {
          window.dispatchEvent(new CustomEvent('map-auth-failure'));
        }
      }}
    >
      <AuthContext.Provider value={{ user, profile, loading }}>
        <Router>
          <MapKeyGuard apiKey={API_KEY}>
            <div className="h-dvh bg-bg-base flex flex-col md:flex-row overflow-hidden">
              {user && <Navigation />}
              <main className="flex-1 pb-20 md:pb-0 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                <Routes>
                  <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/" />} />
                  <Route path="/" element={user ? <Feed /> : <Navigate to="/auth" />} />
                  <Route path="/profile/:userId" element={user ? <Profile /> : <Navigate to="/auth" />} />
                  <Route path="/map" element={user ? <MapView /> : <Navigate to="/auth" />} />
                  <Route path="/search" element={user ? <Search /> : <Navigate to="/auth" />} />
                </Routes>
              </main>
            </div>
          </MapKeyGuard>
        </Router>
      </AuthContext.Provider>
    </APIProvider>
  );
}

function MapKeyGuard({ children, apiKey }: { children: React.ReactNode, apiKey: string }) {
  const [hasAuthError, setHasAuthError] = React.useState(false);

  React.useEffect(() => {
    // Custom event we trigger from APIProvider onError
    const handler = () => {
      console.error('MapKeyGuard: Auth failure detected via event');
      setHasAuthError(true);
    };
    
    // Standard Google Maps auth failure callback (global)
    (window as any).gm_authFailure = () => {
      console.error('Google Maps: Global auth failure detected (gm_authFailure)');
      setHasAuthError(true);
    };

    window.addEventListener('map-auth-failure', handler);
    return () => {
      window.removeEventListener('map-auth-failure', handler);
      // We don't delete gm_authFailure to ensure it persists if the component remounts 
      // but usually this is at the root.
    };
  }, []);

  if (hasAuthError) {
    const isLikelyTruncated = apiKey && (apiKey.length < 30);
    const hasSpaces = apiKey && (apiKey.includes(' ') || apiKey.trim() !== apiKey);

    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white border-4 border-brand-secondary p-12 shadow-[16px_16px_0px_0px_rgba(0,0,0,0.1)] text-center">
          <div className="w-16 h-16 bg-brand-secondary/10 text-brand-secondary flex items-center justify-center mx-auto mb-6 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          
          <h2 className="text-4xl font-display text-brand-secondary uppercase tracking-tighter mb-4 ink-bleed">Invalid API Key</h2>
          
          <div className="text-sm text-text-muted mb-8 space-y-4 text-left leading-relaxed">
            <p className="font-bold text-brand-secondary uppercase text-[10px] tracking-widest bg-brand-secondary/5 p-2 border-l-4 border-brand-secondary">
              Google rejected the provided key
            </p>
            
            <div className="bg-bg-alt p-4 border-2 border-brand-primary/10 font-mono text-[10px] break-all mb-4">
              Current Key: <span className="text-brand-primary font-bold">{apiKey.substring(0, 6)}...{apiKey.substring(apiKey.length - 4)}</span>
              {hasSpaces && <div className="text-brand-secondary mt-1 font-bold">⚠️ HAS HIDDEN SPACES</div>}
              {isLikelyTruncated && <div className="text-brand-secondary mt-1 font-bold">⚠️ LIKELY INCOMPLETE (TOO SHORT)</div>}
            </div>

            <p>To fix this, check these common issues:</p>
            <ol className="list-decimal pl-5 space-y-3 font-medium uppercase tracking-tight text-[11px]">
              <li>
                <span className="text-brand-primary">Copy Error:</span> Ensure you copied the <strong>entire</strong> key from the Google Cloud Console.
              </li>
              <li>
                <span className="text-brand-primary">Spaces:</span> Make sure there are no spaces when pasting into <strong>Settings → Secrets</strong>.
              </li>
              <li>
                <span className="text-brand-primary">Billing:</span> Ensure your project has an active <strong>Billing Account</strong> attached (even for free tier).
              </li>
              <li>
                <span className="text-brand-primary">APIs:</span> Verify <strong>Maps JavaScript API</strong> is Enabled in your Project.
              </li>
            </ol>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-brand-primary text-white py-4 font-display uppercase tracking-widest text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:bg-brand-primary/90 transition-all active:translate-y-1 active:shadow-none"
          >
            I've updated the secret - Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
