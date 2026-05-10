import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, limit, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../App';
import { UserProfile } from '../types';
import { Search as SearchIcon, UserPlus, UserMinus, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function Search() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Sync following list
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', user.uid)
    );
    
    return onSnapshot(q, (snap) => {
      const ids = new Set(snap.docs.map(d => d.data().followedId as string));
      setFollowingIds(ids);
    });
  }, [user]);

  // Search logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        performSearch();
      } else {
        setResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const performSearch = async () => {
    setLoading(true);
    try {
      // Use standard firestore string search pattern
      const q = query(
        collection(db, 'users'),
        where('displayName', '>=', searchTerm),
        where('displayName', '<=', searchTerm + '\uf8ff'),
        limit(20)
      );
      
      const snap = await getDocs(q);
      const docs = snap.docs
        .map(d => d.data() as UserProfile)
        .filter(u => u.uid !== user?.uid); // Don't show self in search
      
      setResults(docs);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async (e: React.MouseEvent, targetUid: string) => {
    e.stopPropagation();
    if (!user) return;

    const isFollowing = followingIds.has(targetUid);
    const followId = `${user.uid}_${targetUid}`;

    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: user.uid,
          followedId: targetUid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'follows');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12 min-h-screen">
      <header className="mb-12 ink-bleed">
        <h1 className="text-3xl md:text-5xl font-display text-brand-primary leading-none uppercase tracking-widest -rotate-1 mb-4">
          Find Fellow <span className="bg-brand-primary text-white px-2 rotate-2 inline-block">Sippers.</span>
        </h1>
        <p className="text-[10px] uppercase tracking-[0.4em] text-text-muted font-black max-w-sm">
          Discover other curators, follow their taste, and populate your feed with the best sips.
        </p>
      </header>

      <div className="relative mb-12 max-w-2xl mx-auto">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary opacity-50" size={18} strokeWidth={3} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="SEARCH BY NAME..."
          className="w-full bg-white border-2 md:border-4 border-brand-primary pl-12 pr-6 py-4 text-xs md:text-base font-display uppercase tracking-widest outline-none shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] focus:shadow-[4px_4px_0px_0px_rgba(240,111,82,0.3)] transition-all placeholder:text-brand-primary/10"
        />
        {loading && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <Loader2 className="animate-spin text-brand-primary" size={24} strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="space-y-6">
        <AnimatePresence>
          {results.length > 0 ? (
            results.map((u, idx) => (
              <motion.div
                key={u.uid}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/profile/${u.uid}`)}
                className="group flex items-center gap-6 p-6 bg-white border-2 border-brand-primary/10 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-[12px_12px_0px_0px_rgba(240,111,82,0.1)] hover:-translate-y-1 hover:border-brand-primary transition-all cursor-pointer"
              >
                <div className="w-20 h-20 flex-shrink-0 border-4 border-brand-primary bg-bg-alt -rotate-3 overflow-hidden group-hover:rotate-0 transition-transform">
                  <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover grayscale group-hover:grayscale-0" />
                </div>

                <div className="flex-1 overflow-hidden">
                  <h3 className="text-sm md:text-base font-sans font-bold text-brand-primary uppercase truncate tracking-[0.2em] mb-1">
                    {u.displayName}
                  </h3>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold truncate opacity-60">
                    {u.bio || 'Curating sips silently.'}
                  </p>
                </div>

                <button
                  onClick={(e) => toggleFollow(e, u.uid)}
                  className={`flex items-center gap-2 px-6 py-3 font-display uppercase tracking-widest text-[9px] transition-all transform active:scale-95 ${
                    followingIds.has(u.uid)
                      ? 'bg-bg-alt text-brand-primary border-2 border-brand-primary'
                      : 'bg-brand-primary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1'
                  }`}
                >
                  {followingIds.has(u.uid) ? (
                    <>
                      <UserMinus size={14} strokeWidth={3} />
                      <span>Unfollow</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} strokeWidth={3} />
                      <span>Follow</span>
                    </>
                  )}
                </button>
              </motion.div>
            ))
          ) : searchTerm && !loading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 border-4 border-dashed border-brand-primary/10 -rotate-1"
            >
              <Sparkles className="mx-auto text-brand-primary opacity-10 mb-6" size={60} strokeWidth={1} />
              <h2 className="text-2xl font-display text-brand-primary opacity-40 uppercase tracking-widest mb-2">No Curators Found.</h2>
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold">Try searching for a different name or invite your circle.</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-30 pointer-events-none">
               {[1,2].map(i => (
                 <div key={i} className="h-32 bg-bg-alt border-2 border-brand-primary/5 rotate-1"></div>
               ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
