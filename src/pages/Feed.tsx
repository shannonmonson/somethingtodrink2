import React, { useEffect, useState } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, getDocs, serverTimestamp, limit } from 'firebase/firestore';
import { Post as PostType } from '../types';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Camera, X, ThumbsUp, ThumbsDown, MapPin, Loader2, Trash2, BookmarkPlus, Check, Pencil, FolderPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import PlaceAutocomplete from '../components/PlaceAutocomplete';
import { compressImage } from '../lib/imageUtils';

export default function Feed() {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<PostType[]>([]);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  const toggleNotes = (postId: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };
  
  // Create Post Form State
  const [drinkName, setDrinkName] = useState('');
  const [category, setCategory] = useState<PostType['category']>('Coffee');
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Collections State
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Edit State
  const [editingPost, setEditingPost] = useState<PostType | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      try {
        const compressed = await compressImage(file);
        setPreviewUrl(compressed);
        setImageUrl(compressed);
      } catch (error) {
        console.error("Compression error:", error);
      }
    }
  };

  // Get following list
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', user.uid)
    );
    
    return onSnapshot(q, (snap) => {
      const ids = snap.docs.map(d => d.data().followedId as string);
      setFollowedIds(ids);
    }, (error) => {
      console.error("Error fetching following list:", error);
    });
  }, [user]);

  // Feed Query
  useEffect(() => {
    if (!user) return;

    // We include user's own posts + followed users' posts
    const allRelevantIds = [user.uid, ...followedIds].slice(0, 30);

    const q = query(
      collection(db, 'posts'),
      where('userId', 'in', allRelevantIds),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const postData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PostType[];
        setPosts(postData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'posts');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, followedIds]);

  // Collections Query
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'collections'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCollections(data);
    });
  }, [user]);

  const handleCreateCollection = async () => {
    if (!user || !newCollectionName.trim()) return;
    setCreatingCollection(true);
    try {
      const docRef = await addDoc(collection(db, 'collections'), {
        userId: user.uid,
        name: newCollectionName.trim(),
        createdAt: serverTimestamp(),
      });
      setSelectedCollectionIds(prev => [...prev, docRef.id]);
      setNewCollectionName('');
      setIsCreatingCollection(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'collections');
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setSubmitting(true);

    try {
      if (editingPost) {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'posts', editingPost.id!), {
          drinkName,
          category,
          caption,
          collectionIds: selectedCollectionIds,
          locationName,
          city,
          latitude: lat,
          longitude: lng,
        });
      } else {
        await addDoc(collection(db, 'posts'), {
          userId: user.uid,
          userName: profile.displayName,
          userPhoto: profile.photoURL,
          drinkName,
          category,
          caption,
          imageUrl: previewUrl || imageUrl || `https://picsum.photos/seed/${Math.random()}/600/800`, 
          locationName,
          city,
          latitude: lat,
          longitude: lng,
          collectionIds: selectedCollectionIds,
          createdAt: serverTimestamp(),
        });
      }
      setIsCreating(false);
      setEditingPost(null);
      // Reset form
      setDrinkName('');
      setCategory('Coffee');
      setCaption('');
      setSelectedFile(null);
      setPreviewUrl(null);
      setImageUrl('');
      setLocationName('');
      setCity('');
      setLat(null);
      setLng(null);
      setSelectedCollectionIds([]);
    } catch (error) {
      handleFirestoreError(error, editingPost ? OperationType.UPDATE : OperationType.CREATE, 'posts');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPost = (post: PostType) => {
    setEditingPost(post);
    setDrinkName(post.drinkName);
    setCategory(post.category || 'Coffee');
    setCaption(post.caption || '');
    setPreviewUrl(post.imageUrl);
    setImageUrl(post.imageUrl);
    setLocationName(post.locationName || '');
    setCity(post.city || '');
    setLat(post.latitude || null);
    setLng(post.longitude || null);
    setSelectedCollectionIds(post.collectionIds || []);
    setIsCreating(true);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [wishlistingIds, setWishlistingIds] = useState<Set<string>>(new Set());
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());

  const handleAddToWishlist = async (post: PostType) => {
    if (!user || !profile || !post.locationName || !post.id) return;
    
    setWishlistingIds(prev => new Set(prev).add(post.id!));
    try {
      await addDoc(collection(db, 'locations'), {
        userId: user.uid,
        name: post.locationName,
        city: post.city || '',
        category: post.category || 'Other',
        description: `Discovered through ${post.userName}'s post of ${post.drinkName}`,
        lat: post.latitude || null,
        lng: post.longitude || null,
        status: 'wishlist',
        isPublic: profile.showWishlist || false,
        createdAt: serverTimestamp(),
      });
      
      setJustAddedIds(prev => new Set(prev).add(post.id!));
      setTimeout(() => {
        setJustAddedIds(prev => {
          const next = new Set(prev);
          next.delete(post.id!);
          return next;
        });
      }, 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'locations');
    } finally {
      setWishlistingIds(prev => {
        const next = new Set(prev);
        next.delete(post.id!);
        return next;
      });
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!postId) return;
    
    try {
      console.log(`Attempting to delete post: ${postId}`);
      await deleteDoc(doc(db, 'posts', postId));
      console.log(`Post ${postId} deleted successfully`);
      setDeletingId(null);
    } catch (error) {
      console.error("Error deleting post:", error);
      handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
    }
  };

  const closeModal = () => {
    setIsCreating(false);
    setEditingPost(null);
    setDrinkName('');
    setCategory('Coffee');
    setCaption('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageUrl('');
    setLocationName('');
    setCity('');
    setLat(null);
    setLng(null);
    setSelectedCollectionIds([]);
  };

  return (
    <div className="max-w-lg mx-auto px-6 py-12 relative min-h-screen">
      <div className="flex justify-between items-end mb-16 px-2">
        <div className="ink-bleed">
          <h1 className="text-4xl md:text-5xl font-display text-brand-primary leading-[0.8] tracking-widest uppercase flex flex-col organic-text">
            <span className="-rotate-1">YOUR</span>
            <span className="rotate-1 bg-brand-primary text-white px-6 w-fit pb-2">FEED.</span>
          </h1>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-brand-primary text-white p-5 transition-all active:scale-95 group -rotate-3 hover:rotate-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none border-2 border-brand-primary"
        >
          <Plus size={28} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-brand-primary" size={32} strokeWidth={3} />
        </div>
      ) : (
        <div className="grid gap-20">
          {posts.length > 0 ? (
            posts.map((post, idx) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.6 }}
                className="group"
              >
                <div className="flex items-center gap-6 mb-8 px-4">
                  <Link to={`/profile/${post.userId}`} className="block transform transition-transform hover:scale-105 active:scale-95">
                    <div className="w-12 h-12 transform rotate-3 overflow-hidden border-2 border-brand-primary shadow-sm bg-bg-alt flex-shrink-0">
                      <img src={post.userPhoto} alt={post.userName} className="w-full h-full object-cover" />
                    </div>
                  </Link>
                  <div className="ink-bleed">
                    <Link to={`/profile/${post.userId}`} className="block group/name">
                      <span className="block font-sans font-bold text-[10px] tracking-[0.2em] uppercase group-hover/name:text-brand-primary transition-colors">{post.userName}</span>
                    </Link>
                    <span className="text-[10px] text-text-muted uppercase tracking-widest font-black opacity-60">
                      {post.createdAt?.toDate?.()?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    {user?.uid === post.userId && (
                      <div className="flex items-center">
                        <button
                          onClick={() => handleEditPost(post)}
                          className="p-3 text-text-muted hover:text-brand-primary hover:bg-brand-primary/5 rounded-none transition-all flex items-center justify-center border-2 border-transparent hover:border-brand-primary/10 mr-1"
                          title="Edit Post"
                        >
                          <Pencil size={18} strokeWidth={2.5} />
                        </button>
                        {deletingId === post.id ? (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="bg-red-500 text-white text-[9px] font-display uppercase tracking-widest px-3 py-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)] active:translate-y-0.5 active:shadow-none"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-text-muted text-[9px] font-display uppercase tracking-widest px-2"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => post.id && setDeletingId(post.id)}
                            className="p-3 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-none transition-all flex items-center justify-center border-2 border-transparent hover:border-red-100"
                            title="Delete Post"
                          >
                            <Trash2 size={18} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    )}
                    
                    {post.locationName && (
                      <button
                        onClick={() => handleAddToWishlist(post)}
                        disabled={wishlistingIds.has(post.id!) || justAddedIds.has(post.id!)}
                        className={`p-3 transition-all flex items-center justify-center border-2 ${
                          justAddedIds.has(post.id!)
                            ? 'bg-green-50 text-green-600 border-green-200'
                            : 'text-text-muted hover:text-brand-primary hover:bg-brand-primary/5 border-transparent hover:border-brand-primary/10'
                        }`}
                        title="Add to List"
                      >
                        {wishlistingIds.has(post.id!) ? (
                          <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
                        ) : justAddedIds.has(post.id!) ? (
                          <Check size={18} strokeWidth={3} />
                        ) : (
                          <BookmarkPlus size={18} strokeWidth={2.5} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="relative aspect-square overflow-hidden bg-bg-alt border-[6px] border-brand-primary shadow-[24px_24px_0px_0px_rgba(0,0,0,0.05)] group-hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,0.1)] transition-all duration-700 -rotate-1 group-hover:rotate-0">
                  <img 
                    src={post.imageUrl} 
                    alt={post.drinkName} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out grayscale-[0.2] group-hover:grayscale-0" 
                  />
                  
                  {/* Persistent Info Overlays (Top Left) */}
                  <div className="absolute top-6 left-6 z-10 flex flex-col items-start gap-2 pointer-events-none">
                     {post.locationName && (
                       <div className="bg-white text-brand-primary px-3 py-1.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] -rotate-1 border border-brand-primary/10">
                          <p className="text-[9px] font-black uppercase tracking-[0.15em]">
                            {post.locationName}
                          </p>
                       </div>
                     )}
                     {post.city && post.city !== post.locationName && (
                       <div className="bg-brand-primary text-white px-2 py-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.05)] rotate-1 ml-2 border border-white/10">
                          <p className="text-[7.5px] font-black uppercase tracking-[0.1em]">
                            {post.city}
                          </p>
                       </div>
                     )}
                     {post.category && (
                       <div className="bg-brand-secondary text-white px-3 py-1.5 shadow-[3px_3px_0px_0_rgba(0,0,0,0.1)] rotate-1 border border-white/10 text-[8px] font-black uppercase tracking-widest">
                         {post.category}
                       </div>
                     )}
                  </div>
  
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-primary/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="absolute bottom-8 left-8 right-8 z-10 pointer-events-none flex flex-col items-start gap-2">
                    <div className="bg-brand-primary text-white px-4 py-2 text-[12px] font-black uppercase tracking-[0.3em] shadow-2xl rotate-1 group-hover:rotate-0 transition-transform">
                      {post.locationName}{post.city && post.city !== post.locationName ? ` · ${post.city}` : ''}
                    </div>
                    <h3 className="text-2xl md:text-4xl font-display text-white leading-none uppercase tracking-widest drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] ink-bleed">{post.drinkName}</h3>
                  </div>
                </div>
  
                {post.caption && (
                  <div className="mt-12 px-4">
                    <button 
                      onClick={() => toggleNotes(post.id)}
                      className="flex items-center gap-6 group/btn cursor-pointer"
                    >
                      <div className="w-12 h-12 bg-bg-alt border-2 border-brand-primary flex items-center justify-center -rotate-3 group-hover/btn:rotate-0 transition-transform shadow-[6px_6px_0px_0px_rgba(0,0,0,0.05)] text-brand-primary">
                         <motion.div
                           animate={{ rotate: expandedNotes[post.id] ? 180 : 0 }}
                           transition={{ type: "spring", stiffness: 200, damping: 15 }}
                         >
                           <Plus size={20} strokeWidth={3} className={expandedNotes[post.id] ? 'rotate-45' : ''} />
                         </motion.div>
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted group-hover/btn:text-brand-primary transition-colors">
                          {expandedNotes[post.id] ? 'COLLAPSE' : 'SIPPER NOTES'}
                        </span>
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {expandedNotes[post.id] && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-12 px-8 border-l-[6px] border-brand-primary py-2">
                            <p className="text-text-main text-sm font-light leading-relaxed opacity-90 italic organic-text">
                              "{post.caption}"
                            </p>
                            <div className="mt-6 flex items-center gap-3">
                              <div className="w-6 h-[2px] bg-brand-primary/20" />
                              <span className="text-[9px] uppercase tracking-[0.4em] font-black text-brand-primary opacity-60">Sip Impression</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.article>
            ))
          ) : (
            <div className="text-center py-20 px-8 border-4 border-dashed border-brand-primary/20 -rotate-1">
              <h2 className="text-4xl font-display text-brand-primary opacity-20 uppercase tracking-tighter mb-4">Quiet in the café.</h2>
              <p className="text-xs uppercase tracking-widest text-text-muted font-bold">Follow your friends to see their sips here, or start the ritual yourself.</p>
            </div>
          )}
        </div>
      )}

      {/* New Post Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-bg-base/95 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-white rounded-[40px] p-8 shadow-[0_32px_64px_-16px_rgba(90,90,64,0.15)] border border-border-subtle overflow-y-auto max-h-[90vh]"
            >
              <button 
                onClick={closeModal}
                className="absolute top-6 right-6 text-brand-primary hover:scale-110 transition-transform"
              >
                <X size={24} strokeWidth={3} />
              </button>

              <div className="mb-6 text-center ink-bleed">
                <span className="text-[9px] uppercase tracking-[0.4em] text-brand-primary font-black opacity-60">{editingPost ? 'EDIT LOG' : 'LOG'}</span>
                <h2 className="text-2xl font-display text-text-main mt-1 uppercase tracking-widest organic-text">{editingPost ? 'Refine your entry.' : 'Log your drink.'}</h2>
              </div>

              <form onSubmit={handleCreatePost} className="space-y-5">
                {/* Image Upload Area */}
                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">The Aesthetic (Image)</label>
                  <div 
                    onClick={() => document.getElementById('image-upload')?.click()}
                    className="relative aspect-[16/5] bg-bg-alt border-4 border-dashed border-brand-primary/30 hover:border-brand-primary transition-all cursor-pointer flex flex-col items-center justify-center gap-1 overflow-hidden"
                  >
                    {previewUrl ? (
                      <img src={previewUrl} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Camera size={32} className="text-brand-primary opacity-40" />
                        <span className="text-[10px] font-display uppercase tracking-widest text-text-muted">Tap to upload sip</span>
                      </>
                    )}
                  </div>
                  <input 
                    id="image-upload"
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileChange}
                    disabled={!!editingPost}
                  />
                  {editingPost && (
                    <p className="text-[7px] uppercase tracking-widest text-text-muted text-center opacity-50">Images cannot be changed during edit</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">Drink Category</label>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {['Coffee', 'Wine', 'Beer', 'Cocktail', 'Other'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat as PostType['category'])}
                        className={`px-3 py-1.5 text-[9px] font-display uppercase tracking-widest transition-all ${
                          category === cat 
                            ? 'bg-brand-primary text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)] -rotate-1' 
                            : 'bg-bg-alt text-text-muted border-2 border-brand-primary/10 hover:border-brand-primary/40'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">Drink Name</label>
                  <input
                    required
                    value={drinkName}
                    onChange={(e) => setDrinkName(e.target.value)}
                    placeholder="E.g. Lavender Matcha Latte"
                    className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-3.5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-display placeholder:text-text-muted/20 uppercase tracking-tight text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">Spot</label>
                    <PlaceAutocomplete 
                      key={isCreating ? 'active' : 'inactive'}
                      onPlaceSelect={(place) => {
                        setLocationName(place.name || '');
                        if (place.city) setCity(place.city);
                        if (place.location) {
                          setLat(place.location.lat());
                          setLng(place.location.lng());
                        }
                      }} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">City</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="E.g. Los Angeles"
                      className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-4 py-3.5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-display placeholder:text-text-muted/20 uppercase tracking-tight text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">Notes</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Thoughts on this drink..."
                    rows={2}
                    className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-3.5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all resize-none font-display placeholder:text-text-muted/20 uppercase tracking-tight text-xs"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-4">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black">Add to Sip Collection</label>
                    <button 
                      type="button"
                      onClick={() => setIsCreatingCollection(true)}
                      className="text-[8px] uppercase tracking-widest text-brand-primary font-black hover:underline"
                    >
                      + Create New
                    </button>
                  </div>

                  {isCreatingCollection && (
                    <div className="mx-4 p-4 bg-bg-alt border-2 border-dashed border-brand-primary/20 flex gap-2">
                       <input 
                        type="text"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        placeholder="COLLECTION NAME..."
                        className="flex-1 bg-white border-2 border-brand-primary px-3 py-2 text-[10px] outline-none font-display uppercase tracking-widest"
                       />
                       <button
                        type="button"
                        onClick={handleCreateCollection}
                        disabled={creatingCollection || !newCollectionName.trim()}
                        className="bg-brand-primary text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                       >
                         {creatingCollection ? '...' : 'Add'}
                       </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 px-4 max-h-32 overflow-y-auto">
                    {collections.length > 0 ? (
                      collections.map(col => {
                        const isSelected = selectedCollectionIds.includes(col.id);
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => {
                              setSelectedCollectionIds(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== col.id)
                                  : [...prev, col.id]
                              );
                            }}
                            className={`px-3 py-1.5 border-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                              isSelected 
                                ? 'bg-brand-primary text-white border-brand-primary' 
                                : 'bg-white text-text-muted border-brand-primary/10 hover:border-brand-primary/30'
                            }`}
                          >
                            {col.name}
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-[8px] uppercase tracking-widest text-text-muted opacity-40 py-2">No collections yet. Curate your sips!</p>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    disabled={submitting || !drinkName || (!previewUrl && !imageUrl && !editingPost)}
                    className="w-full bg-brand-primary text-white py-4 rounded-none font-display uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-primary/95 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.1)] active:shadow-none translate-y-[-2px] active:translate-y-0 mt-2"
                  >
                    {submitting ? 'Sharing...' : (editingPost ? 'Update Sip' : 'Share Sip')}
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
