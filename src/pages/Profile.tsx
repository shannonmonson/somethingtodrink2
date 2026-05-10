import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, getDocs, serverTimestamp, updateDoc, setDoc } from 'firebase/firestore';
import { UserProfile, Post as PostType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Grid, MapPin, Loader2, UserPlus, UserMinus, Trash2, Settings, X, Camera, Save, Info } from 'lucide-react';
import { useAuth } from '../App';
import { compressImage } from '../lib/imageUtils';

export default function Profile() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followId, setFollowId] = useState<string | null>(null);
  
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedPost, setSelectedPost] = useState<PostType | null>(null);
  
  // Edit Profile State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editShowWishlist, setEditShowWishlist] = useState(false);
  const [saving, setSaving] = useState(false);

  const [wishlist, setWishlist] = useState<any[]>([]);
  const [showWishlistSection, setShowWishlistSection] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Fetch Profile
    const unsubscribeProfile = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.displayName || 'User')}&background=random`;
        
        // Only update edit states if not currently editing to prevent overwriting user input
        if (!isEditing) {
          setEditName(data.displayName || '');
          setEditBio(data.bio || '');
          setEditPhoto(data.photoURL || defaultAvatar);
          setEditShowWishlist(data.showWishlist ?? false);
        }
        setShowWishlistSection(data.showWishlist || userId === currentUser?.uid);
      }
    }, (error) => {
      console.error("Profile fetch error:", error);
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });

    return () => unsubscribeProfile();
  }, [userId, currentUser, isEditing]);

  useEffect(() => {
    if (!userId) return;

    // Fetch Posts
    const q = query(
      collection(db, 'posts'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PostType[];
      
      // Client-side sort to avoid requiring composite index
      const sortedPosts = postData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setPosts(sortedPosts);
      setLoading(false);
    }, (error) => {
      console.error("Profile posts snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'posts');
      setLoading(false);
    });

    // Fetch Wishlist
    const wishlistQ = query(
      collection(db, 'locations'),
      where('userId', '==', userId),
      where('status', '==', 'wishlist')
    );

    const unsubscribeWishlist = onSnapshot(wishlistQ, (snapshot) => {
      const wishlistData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      setWishlist(wishlistData);
    }, (error) => {
      console.log("Wishlist access restricted or error:", error);
    });

    // Check Following Status and get counts
    if (userId) {
      const followersQuery = query(
        collection(db, 'follows'),
        where('followedId', '==', userId)
      );

      const followingQuery = query(
        collection(db, 'follows'),
        where('followerId', '==', userId)
      );

      const unsubscribeFollowers = onSnapshot(followersQuery, (snap) => {
        setFollowerCount(snap.size);
        if (currentUser && userId !== currentUser.uid) {
          const followDoc = snap.docs.find(d => d.data().followerId === currentUser.uid);
          if (followDoc) {
            setIsFollowing(true);
            setFollowId(followDoc.id);
          } else {
            setIsFollowing(false);
            setFollowId(null);
          }
        }
      });

      const unsubscribeFollowing = onSnapshot(followingQuery, (snap) => {
        setFollowingCount(snap.size);
      });

      return () => {
        unsubscribeFollowers();
        unsubscribeFollowing();
      };
    }
  }, [userId, currentUser]);

  const toggleFollow = async () => {
    if (!currentUser || !userId) return;

    try {
      if (isFollowing && followId) {
        await deleteDoc(doc(db, 'follows', followId));
        setIsFollowing(false);
        setFollowId(null);
      } else {
        const docRef = await addDoc(collection(db, 'follows'), {
          followerId: currentUser.uid,
          followedId: userId,
          createdAt: serverTimestamp()
        });
        setIsFollowing(true);
        setFollowId(docRef.id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'follows');
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 400, 400, 0.8);
        setEditPhoto(compressed);
      } catch (error) {
        console.error("Profile photo compression error:", error);
      }
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !currentUser) return;

    setSaving(true);
    try {
      // First update the user document
      await updateDoc(doc(db, 'users', userId), {
        displayName: editName,
        bio: editBio,
        photoURL: editPhoto,
        showWishlist: editShowWishlist
      });

      // If showWishlist changed, update all existing wishlist locations
      if (editShowWishlist !== profile?.showWishlist) {
        const wishlistQuery = query(
          collection(db, 'locations'),
          where('userId', '==', userId),
          where('status', '==', 'wishlist')
        );
        const wishlistSnap = await getDocs(wishlistQuery);
        const updatePromises = wishlistSnap.docs.map(d => 
          updateDoc(doc(db, 'locations', d.id), { isPublic: editShowWishlist })
        );
        await Promise.all(updatePromises);
      }

      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setSaving(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingWishlistId, setDeletingWishlistId] = useState<string | null>(null);

  // Followers/Following Lists
  const [activeList, setActiveList] = useState<'followers' | 'following' | null>(null);
  const [listUsers, setListUsers] = useState<UserProfile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [currentUserFollowingIds, setCurrentUserFollowingIds] = useState<Set<string>>(new Set());

  // Sync current user's following list to show "Follow Back" statuses
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', currentUser.uid)
    );
    return onSnapshot(q, (snap) => {
      const ids = new Set(snap.docs.map(d => d.data().followedId as string));
      setCurrentUserFollowingIds(ids);
    });
  }, [currentUser]);

  const openList = async (type: 'followers' | 'following') => {
    if (!userId) return;
    setActiveList(type);
    setListLoading(true);
    setListUsers([]);

    try {
      const q = query(
        collection(db, 'follows'),
        where(type === 'followers' ? 'followedId' : 'followerId', '==', userId)
      );
      const snap = await getDocs(q);
      const targetIds = snap.docs.map(d => type === 'followers' ? d.data().followerId : d.data().followedId);
      
      if (targetIds.length > 0) {
        // Fetch profiles in batches of 10 (Firestore 'in' limit is 30, but let's be safe/efficient)
        const profiles: UserProfile[] = [];
        for (let i = 0; i < targetIds.length; i += 10) {
          const batch = targetIds.slice(i, i + 10);
          const usersQ = query(collection(db, 'users'), where('uid', 'in', batch));
          const usersSnap = await getDocs(usersQ);
          profiles.push(...usersSnap.docs.map(d => d.data() as UserProfile));
        }
        setListUsers(profiles);
      }
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    } finally {
      setListLoading(false);
    }
  };

  const handleListFollowToggle = async (targetUid: string) => {
    if (!currentUser) return;
    const isFollowing = currentUserFollowingIds.has(targetUid);
    const followId = `${currentUser.uid}_${targetUid}`;

    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: currentUser.uid,
          followedId: targetUid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'follows');
    }
  };

  const handleDeletePost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!postId) return;
    
    try {
      console.log(`Attempting to delete post: ${postId}`);
      await deleteDoc(doc(db, 'posts', postId));
      console.log("Delete successful");
      setDeletingId(null);
    } catch (error) {
      console.error("Delete failed:", error);
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
    }
  };

  const handleDeleteWishlistItem = async (e: React.MouseEvent, locationId: string) => {
    e.stopPropagation();
    if (!locationId || !currentUser || userId !== currentUser.uid) return;
    
    try {
      await deleteDoc(doc(db, 'locations', locationId));
      setDeletingWishlistId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `locations/${locationId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 min-h-screen">
        <Loader2 className="animate-spin text-brand-primary" size={32} strokeWidth={3} />
      </div>
    );
  }

  if (!profile) return <div className="text-center py-20 font-serif italic">User not found</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 min-h-screen">
      <header className="flex flex-col md:flex-row items-center gap-8 mb-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <div className="w-32 h-32 overflow-hidden border-8 border-brand-primary shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] relative z-10 -rotate-3 hover:rotate-0 transition-transform duration-500">
            <img 
              src={profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || 'User')}&background=random`} 
              alt={profile.displayName} 
              className="w-full h-full object-cover grayscale-[0.2] hover:grayscale-0" 
            />
          </div>
        </motion.div>

        <div className="text-center md:text-left flex-1 ink-bleed">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            <h1 className="text-xl font-bold font-sans text-brand-primary tracking-[0.2em] uppercase">{profile.displayName}</h1>
            <div className="flex gap-4">
              {currentUser && currentUser.uid !== userId && (
                <button
                  onClick={toggleFollow}
                  className={`flex items-center justify-center gap-3 px-10 py-3 rounded-none text-[10px] font-display uppercase tracking-[0.2em] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] active:shadow-none translate-y-[-2px] active:translate-y-0 ${
                    isFollowing 
                      ? 'bg-bg-alt text-text-muted border-2 border-border-subtle' 
                      : 'bg-brand-primary text-white hover:bg-brand-primary/90'
                  }`}
                >
                  {isFollowing ? <UserMinus size={16} strokeWidth={3} /> : <UserPlus size={16} strokeWidth={3} />}
                  {isFollowing ? 'Following' : 'Connect'}
                </button>
              )}
              {currentUser && currentUser.uid === userId && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center justify-center gap-3 px-10 py-3 bg-white text-brand-primary border-2 border-brand-primary rounded-none text-[10px] font-display uppercase tracking-[0.2em] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] active:shadow-none translate-y-[-2px] active:translate-y-0 hover:bg-brand-primary hover:text-white"
                >
                  <Settings size={16} strokeWidth={3} />
                  Edit Profile
                </button>
              )}
            </div>
          </div>
          <p className="text-text-main text-base font-medium max-w-lg leading-relaxed mb-6 border-l-[4px] border-brand-primary pl-6 opacity-70">
            {profile.bio || "Crafting thoughts, one sip at a time. Digital library of beverages and beautiful spaces."}
          </p>
          <div className="flex justify-center md:justify-start gap-10">
            <div className="text-center md:text-left">
              <span className="block text-3xl font-display text-brand-primary leading-none mb-1">{posts.length}</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted font-black">Archives</span>
            </div>
            <button 
              onClick={() => openList('followers')}
              className="text-center md:text-left hover:opacity-70 transition-opacity group"
            >
              <span className="block text-2xl font-display text-brand-primary leading-none mb-1 group-hover:scale-110 transition-transform">{followerCount}</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted font-black border-b border-transparent group-hover:border-brand-primary">Followers</span>
            </button>
            <button 
              onClick={() => openList('following')}
              className="text-center md:text-left hover:opacity-70 transition-opacity group"
            >
              <span className="block text-2xl font-display text-brand-primary leading-none mb-1 group-hover:scale-110 transition-transform">{followingCount}</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted font-black border-b border-transparent group-hover:border-brand-primary">Connected</span>
            </button>
          </div>
        </div>
      </header>

      <div className="border-t-[4px] border-brand-primary pt-12">
        <div className="flex items-center justify-between mb-8 px-4">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-brand-primary text-white flex items-center justify-center -rotate-6">
              <Grid size={18} strokeWidth={3} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] uppercase tracking-[0.4em] font-black text-text-muted">Past Sips</span>
              <span className="text-[9px] uppercase tracking-[0.1em] text-brand-primary font-bold">The Collection</span>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-black opacity-40">Grid View</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {posts.map((post, idx) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setSelectedPost(post)}
              className="group aspect-square relative overflow-hidden bg-bg-alt border-4 border-brand-primary shadow-[12px_12px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-none transition-all duration-700 cursor-pointer -rotate-1 hover:rotate-0"
            >
              <img src={post.imageUrl} alt={post.drinkName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" />
              <div className="absolute top-4 left-4 z-10 flex flex-col items-start gap-1 pointer-events-none group-hover:opacity-0 transition-opacity">
                {post.locationName && (
                  <div className="bg-white text-brand-primary px-2 py-1 text-[8px] font-black uppercase tracking-[0.15em] shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)] -rotate-1 border border-brand-primary/10">
                    {post.locationName}
                  </div>
                )}
                {post.city && post.city !== post.locationName && (
                  <div className="bg-brand-primary text-white px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] rotate-1 border border-white/10 ml-2">
                    {post.city}
                  </div>
                )}
                {post.category && (
                  <div className="bg-brand-secondary text-white px-2 py-0.5 text-[6px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] rotate-0 border border-white/10 mt-1">
                    {post.category}
                  </div>
                )}
              </div>
              

              
              {currentUser?.uid === userId && (
                <div className="absolute top-4 right-4 z-20">
                  {deletingId === post.id ? (
                    <div className="flex flex-col gap-2 animate-in fade-in zoom-in">
                      <button
                        onClick={(e) => handleDeletePost(e, post.id)}
                        className="bg-red-600 text-white text-[9px] font-display uppercase tracking-widest px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] active:translate-y-1 active:shadow-none"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(null);
                        }}
                        className="bg-white text-brand-secondary text-[9px] font-display uppercase tracking-widest px-4 py-2 border-2 border-brand-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(post.id);
                      }}
                      className="p-3 bg-white text-brand-secondary border-2 border-brand-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-600 active:translate-y-1 active:shadow-none"
                      title="Delete Sip"
                    >
                      <Trash2 size={18} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )}

              <div className="absolute inset-0 bg-brand-primary/80 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center text-white p-8 text-center backdrop-blur-sm">
                <span className="text-xl md:text-2xl font-display mb-2 transform translate-y-6 group-hover:translate-y-0 transition-transform duration-500 uppercase tracking-widest ink-bleed">{post.drinkName}</span>
                {post.locationName && (
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 transform translate-y-6 group-hover:translate-y-0 transition-transform duration-500 delay-75">
                    at {post.locationName}{post.city && post.city !== post.locationName ? ` · ${post.city}` : ''}
                  </span>
                )}
                <div className="mt-6 w-12 h-1 bg-white transform scale-x-0 group-hover:scale-x-100 transition-transform duration-700" />
              </div>
            </motion.div>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-40 bg-bg-alt border-4 border-dashed border-brand-primary -rotate-1">
            <p className="text-text-muted font-display text-4xl uppercase tracking-tighter opacity-40">The collection is currently empty.</p>
          </div>
        )}

        {showWishlistSection && wishlist.length > 0 && (
          <div className="mt-16 pt-12 border-t-[4px] border-brand-primary/20">
            <div className="flex items-center gap-4 mb-8 px-4">
              <div className="w-8 h-8 bg-brand-primary text-white flex items-center justify-center rotate-6">
                <MapPin size={18} strokeWidth={3} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.4em] font-black text-text-muted">Future Sips</span>
                <span className="text-[9px] uppercase tracking-[0.1em] text-brand-primary font-bold">Wishlist places to discover</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {wishlist.map((loc, idx) => (
                <motion.div
                  key={loc.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className={`bg-white border-2 border-brand-primary p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-none transition-all ${idx % 2 === 0 ? '-rotate-1' : 'rotate-1'} relative group`}
                >
                  {currentUser?.uid === userId && (
                    <div className="absolute top-4 right-4 z-20">
                      {deletingWishlistId === loc.id ? (
                        <div className="flex flex-col gap-2 animate-in fade-in zoom-in slide-in-from-top-1">
                          <button
                            onClick={(e) => handleDeleteWishlistItem(e, loc.id)}
                            className="bg-red-600 text-white text-[9px] font-display uppercase tracking-widest px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] active:translate-y-1 active:shadow-none"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingWishlistId(null);
                            }}
                            className="bg-white text-brand-primary text-[9px] font-display uppercase tracking-widest px-4 py-2 border-2 border-brand-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingWishlistId(loc.id);
                          }}
                          className="p-3 bg-white text-brand-primary border-2 border-brand-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-600 hover:border-red-600 active:translate-y-1 active:shadow-none"
                          title="Remove from wishlist"
                        >
                          <Trash2 size={18} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-3">
                    {loc.category && (
                      <span className="bg-brand-primary text-white text-[9px] font-black px-3 py-1 uppercase tracking-widest -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                        {loc.category}
                      </span>
                    )}
                    {!loc.category && (
                      <span className="bg-bg-alt text-brand-primary text-[9px] font-black px-3 py-1 uppercase tracking-widest border border-brand-primary/20 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)]">
                        Spot
                      </span>
                    )}
                  </div>

                  <h3 className="font-sans font-black text-2xl uppercase tracking-[0.2em] ink-bleed text-brand-primary mb-3 underline underline-offset-4 decoration-2 pr-10">{loc.name}</h3>
                  
                  {loc.city && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
                       <MapPin size={12} className="text-brand-primary" />
                       {loc.city}
                    </p>
                  )}

                  {loc.description && (
                    <p className="text-[10px] text-text-main font-bold opacity-70 leading-relaxed line-clamp-3 mb-6 font-sans uppercase tracking-[0.2em]">
                      {loc.description}
                    </p>
                  )}

                  <div className="space-y-4 pt-4 border-t border-brand-primary/10">
                    {loc.website && (
                      <a 
                        href={loc.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[9px] font-sans font-bold uppercase tracking-[0.2em] text-brand-primary hover:opacity-70 transition-opacity w-fit bg-brand-primary/5 px-3 py-1 border-l-4 border-brand-primary"
                      >
                        <Info size={12} strokeWidth={3} />
                        Visit Website
                      </a>
                    )}

                    {loc.openingHours && loc.openingHours.length > 0 ? (
                      <div className="pt-2">
                        <span className="text-[9px] font-sans font-black uppercase tracking-[0.3em] text-brand-primary mb-3 block">Current Hours</span>
                        <div className="space-y-1.5 bg-bg-alt/50 p-4 border border-brand-primary/5">
                          {loc.openingHours.map((line: string, i: number) => (
                            <p key={i} className="text-[9px] text-text-main uppercase tracking-tight font-medium opacity-80 leading-tight">{line}</p>
                          ))}
                        </div>
                      </div>
                    ) : (
                       <p className="text-[9px] font-display uppercase tracking-widest text-text-muted italic opacity-60">Hours not available</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeList && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-brand-primary/10 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md border-8 border-brand-primary shadow-[24px_24px_0px_0px_rgba(0,0,0,0.1)] flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b-4 border-brand-primary flex items-center justify-between bg-bg-alt">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.4em] text-brand-primary font-black opacity-60">Archive Network</span>
                  <h2 className="text-2xl font-display text-brand-primary leading-none uppercase tracking-widest mt-1 italic">
                    {activeList === 'followers' ? 'The Followers' : 'The Connected'}
                  </h2>
                </div>
                <button 
                  onClick={() => setActiveList(null)}
                  className="p-2 bg-brand-primary text-white hover:rotate-90 transition-transform duration-500"
                >
                  <X size={20} strokeWidth={3} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {listLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-brand-primary" size={24} strokeWidth={3} />
                  </div>
                ) : listUsers.length > 0 ? (
                  listUsers.map((u, idx) => (
                    <motion.div
                      key={u.uid}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-4 p-4 border-2 border-brand-primary/10 hover:border-brand-primary transition-colors group"
                    >
                      <div 
                        onClick={() => {
                          setActiveList(null);
                          window.location.href = `/profile/${u.uid}`;
                        }}
                        className="w-12 h-12 shrink-0 border-2 border-brand-primary bg-bg-alt -rotate-3 group-hover:rotate-0 transition-transform cursor-pointer overflow-hidden"
                      >
                        <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover grayscale group-hover:grayscale-0" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 
                          onClick={() => {
                            setActiveList(null);
                            window.location.href = `/profile/${u.uid}`;
                          }}
                          className="font-bold font-sans uppercase text-[10px] tracking-widest truncate text-brand-primary cursor-pointer hover:underline"
                        >
                          {u.displayName}
                        </h4>
                        <p className="text-[8px] uppercase tracking-widest text-text-muted truncate font-bold opacity-60">
                          {u.bio || 'Silence in the archives.'}
                        </p>
                      </div>

                      {currentUser && u.uid !== currentUser.uid && (
                        <button
                          onClick={() => handleListFollowToggle(u.uid)}
                          className={`shrink-0 px-4 py-2 text-[8px] font-display uppercase tracking-widest transition-all ${
                            currentUserFollowingIds.has(u.uid)
                              ? 'bg-bg-alt text-brand-primary border border-brand-primary'
                              : 'bg-brand-primary text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] active:translate-y-0.5 active:shadow-none'
                          }`}
                        >
                          {currentUserFollowingIds.has(u.uid) ? 'Following' : (activeList === 'followers' && userId === currentUser.uid ? 'Follow Back' : 'Follow')}
                        </button>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-10 italic text-text-muted font-display uppercase opacity-40">
                    No records found in this archive.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {selectedPost && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-brand-primary/40 backdrop-blur-xl"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-4xl border-8 border-brand-primary shadow-[40px_40px_0px_0px_rgba(0,0,0,0.15)] relative overflow-hidden grid grid-cols-1 md:grid-cols-2"
            >
              <button
                onClick={() => setSelectedPost(null)}
                className="absolute top-4 right-4 z-50 p-2 bg-brand-primary text-white hover:rotate-90 transition-transform duration-500 shadow-lg"
              >
                <X size={24} strokeWidth={3} />
              </button>

              <div className="aspect-square bg-bg-alt relative overflow-hidden h-full">
                <img 
                  src={selectedPost.imageUrl} 
                  alt={selectedPost.drinkName} 
                  className="w-full h-full object-cover" 
                />
              </div>

              <div className="p-8 md:p-12 flex flex-col h-full bg-white relative">
                <div className="mb-6 flex flex-wrap gap-2">
                  <span className="bg-brand-primary text-white text-[10px] font-black px-3 py-1 uppercase tracking-[0.2em] -rotate-1">
                    {selectedPost.category}
                  </span>
                </div>

                <div className="mb-8">
                  <h2 className="text-3xl md:text-4xl font-display text-brand-primary leading-none uppercase tracking-widest ink-bleed mb-4">
                    {selectedPost.drinkName}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-bg-alt border border-brand-primary/10 px-3 py-1.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)] rotate-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-text-muted">
                        at {selectedPost.locationName}{selectedPost.city && ` · ${selectedPost.city}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto mb-8 pr-4 custom-scrollbar">
                  <div className="border-l-4 border-brand-primary pl-6 py-2">
                    <p className="text-xl md:text-2xl font-light text-text-muted leading-relaxed italic">
                      {selectedPost.caption || "No notes were recorded for this sip."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-bg-alt">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border-2 border-brand-primary p-1">
                      <img 
                        src={profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.displayName || 'User')}&background=random`} 
                        className="w-full h-full object-cover grayscale" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div>
                      <span className="block text-[8px] uppercase tracking-[0.2em] font-black text-text-muted">Archived By</span>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-widest text-brand-primary">{profile.displayName}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-brand-primary/20 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, rotate: -1 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.95, rotate: 1 }}
              className="bg-white w-full max-w-2xl border-8 border-brand-primary shadow-[32px_32px_0px_0px_rgba(0,0,0,0.1)] p-12 relative"
            >
              <button
                onClick={() => setIsEditing(false)}
                className="absolute top-8 right-8 text-brand-primary hover:rotate-90 transition-transform duration-500"
              >
                <X size={32} strokeWidth={3} />
              </button>

              <div className="mb-12">
                <span className="text-[10px] uppercase tracking-[0.4em] text-brand-primary font-black opacity-60">Identity Craft</span>
                <h2 className="text-3xl font-display text-text-main mt-3 leading-tight uppercase tracking-widest ink-bleed underline-offset-8">Edit Your Profile</h2>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-10">
                <div className="flex flex-col md:flex-row gap-12">
                  <div className="shrink-0">
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-text-muted font-black mb-4">Picture</label>
                    <div className="relative group">
                      <div className="w-40 h-40 overflow-hidden border-4 border-brand-primary shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)] relative z-10 rotate-2 group-hover:rotate-0 transition-transform">
                        <img src={editPhoto} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <label className="absolute -bottom-4 -right-4 z-20 w-12 h-12 bg-brand-primary text-white flex items-center justify-center cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] hover:scale-110 transition-transform">
                        <Camera size={20} strokeWidth={3} />
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoChange} />
                      </label>
                    </div>
                  </div>

                  <div className="flex-1 space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-black">Display Name</label>
                      <input
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-4 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-display uppercase tracking-tight"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-black">Bio</label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        rows={3}
                        className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-4 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-display uppercase tracking-tight resize-none"
                        placeholder="Write a short bio..."
                      />
                    </div>

                    <div className="flex items-center gap-4 pt-2">
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input 
                           type="checkbox" 
                           className="sr-only peer"
                           checked={editShowWishlist}
                           onChange={(e) => setEditShowWishlist(e.target.checked)}
                         />
                         <div className="w-14 h-8 bg-bg-alt border-2 border-brand-primary peer-focus:outline-none ring-4 ring-transparent peer-focus:ring-brand-primary/10 transition-all peer-checked:bg-brand-primary after:content-[''] after:absolute after:top-[6px] after:left-[6px] after:bg-brand-primary peer-checked:after:bg-white after:border-brand-primary after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-6"></div>
                       </label>
                       <div className="flex flex-col">
                         <span className="text-[10px] uppercase tracking-[0.2em] text-text-main font-black">Public Wishlist</span>
                         <span className="text-[9px] uppercase tracking-[0.1em] text-text-muted font-medium">Let others see your "Places to Sip"</span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-brand-primary text-white py-6 text-sm font-display uppercase tracking-[0.2em] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50 flex items-center justify-center gap-4"
                  >
                    {saving ? <Loader2 className="animate-spin" size={20} strokeWidth={3} /> : <Save size={20} strokeWidth={3} />}
                    {saving ? 'Preserving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
