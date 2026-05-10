import React, { useEffect, useState, useCallback, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { LocationMarker, Post, DrinkCategory } from '../types';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Star, Plus, X, Loader2, Heart, Info, Search, Navigation, Coffee, Wine, Beer, Martini, GlassWater, Sparkles, Compass, Edit2 } from 'lucide-react';
import { 
  Map, 
  AdvancedMarker, 
  Pin, 
  InfoWindow, 
  useMap, 
  useMapsLibrary,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import PlaceAutocomplete from '../components/PlaceAutocomplete';

export default function MapView() {
  const { user, profile } = useAuth();
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [locations, setLocations] = useState<LocationMarker[]>([]);
  const [sippedPosts, setSippedPosts] = useState<LocationMarker[]>([]);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'recommended' | 'wishlist' | 'discover'>('recommended');
  const [selectedLocation, setSelectedLocation] = useState<LocationMarker | null>(null);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // Form state
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<DrinkCategory>('Coffee');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [openingHours, setOpeningHours] = useState<string[]>([]);
  const [lat, setLat] = useState<number>(0);
  const [lng, setLng] = useState<number>(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Center map on user location on mount
  useEffect(() => {
    if (navigator.geolocation && map) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.panTo({ lat: latitude, lng: longitude });
          map.setZoom(14);
        },
        (error) => {
          console.warn('Geolocation error:', error);
        }
      );
    }
  }, [map]);

  useEffect(() => {
    if (!user) return;

    const locationsQuery = query(
      collection(db, 'locations'),
      where('userId', '==', user.uid)
    );

    const postsQuery = query(
      collection(db, 'posts'),
      where('userId', '==', user.uid)
    );

    const unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
      const locationData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LocationMarker[];
      setLocations(locationData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'locations');
    });

    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      const postData = snapshot.docs
        .map(doc => {
          const data = doc.data() as Post;
          if (data.latitude && data.longitude) {
            return {
              id: doc.id,
              name: data.drinkName,
              city: data.city,
              category: data.category,
              description: data.locationName ? `At ${data.locationName}. ${data.caption || ''}` : data.caption || '',
              lat: data.latitude,
              lng: data.longitude,
              status: 'recommended',
              userId: data.userId,
              createdAt: data.createdAt,
              isFromFeed: true
            };
          }
          return null;
        })
        .filter(Boolean) as LocationMarker[];
      
      const sortedPosts = postData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setSippedPosts(sortedPosts);
      setLoading(false);
    }, (error) => {
      console.error("Posts query failed", error);
      setLoading(false);
    });

    return () => {
      unsubscribeLocations();
      unsubscribePosts();
    };
  }, [user]);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'locations', editingId), {
          name,
          city,
          category,
          description,
          website,
          openingHours,
          lat: Number(lat),
          lng: Number(lng),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'locations'), {
          name,
          city,
          category,
          description,
          website,
          openingHours,
          status: activeTab,
          lat: Number(lat),
          lng: Number(lng),
          userId: user.uid,
          isPublic: activeTab === 'wishlist' ? (profile?.showWishlist ?? false) : false,
          createdAt: serverTimestamp(),
        });
      }
      setIsAdding(false);
      setEditingId(null);
      setName('');
      setCity('');
      setCategory('Coffee');
      setDescription('');
      setWebsite('');
      setOpeningHours([]);
      setLat(0);
      setLng(0);
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'locations');
    }
  };

  const startEditing = (loc: LocationMarker) => {
    setName(loc.name);
    setCity(loc.city || '');
    setCategory(loc.category);
    setDescription(loc.description || '');
    setWebsite(loc.website || '');
    setOpeningHours(loc.openingHours || []);
    setLat(loc.lat);
    setLng(loc.lng);
    setEditingId(loc.id);
    setIsAdding(true);
  };

  const removeLocation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'locations', id));
      setSelectedLocation(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `locations/${id}`);
    }
  };

  const discoverNearby = async (discoveryType: 'coffee' | 'drink' = 'drink') => {
    if (!placesLib || !map) return;
    
    setLoading(true);
    const center = map.getCenter();
    if (!center) return;

    try {
      const service = new (placesLib as any).PlacesService(map);
      
      const keywords = discoveryType === 'coffee' 
        ? 'cafe bakery coffee shop roasters espresso' 
        : 'bar cocktail lounge pub tavern brewery distillery speakeasy wine bar beer garden';

      const results: any[] = await new Promise((resolve, reject) => {
        service.nearbySearch({
          location: center,
          radius: 3200, // ~2 miles
          keyword: keywords // Targeted keyword search based on type
        }, (res, status) => {
          if (status === (placesLib as any).PlacesServiceStatus.OK || status === (placesLib as any).PlacesServiceStatus.ZERO_RESULTS) {
            resolve(res || []);
          } else {
            reject(new Error(`Places search failed: ${status}`));
          }
        });
      });

      if (results.length === 0) {
        setDiscoveredPlaces([]);
        setLoading(false);
        return;
      }

      const hipKeywords = ['hip', 'trendy', 'cool', 'vibe', 'aesthetic', 'chic', 'minimal', 'modern', 'artsy', 'industrial', 'hidden gem', 'speakeasy', 'curated', 'popular', 'hotspot', 'brunch', 'natural wine', 'craft', 'mixology', 'lounge', 'rooftop', 'underground'];
      
      const processed = results
        .map((p: any) => {
          let hipScore = 0;
          const name = (p.name || '').toLowerCase();
          const types = p.types || [];
          const lat = p.geometry?.location?.lat() || 0;
          const lng = p.geometry?.location?.lng() || 0;
          
          // Basic keyword scoring
          hipKeywords.forEach(word => {
            if (name.includes(word)) hipScore += 5;
          });

          // Classification logic (Prioritized)
          let classification = 'Restaurant';
          
          const isBrewery = types.includes('brewery') || name.includes('brewery') || name.includes('brewing') || types.includes('distillery') || name.includes('distillery') || name.includes('taproom') || name.includes('beer');
          const isBar = types.includes('bar') || types.includes('cocktail_bar') || types.includes('wine_bar') || types.includes('night_club') || name.includes('bar') || name.includes('pub') || name.includes('lounge') || name.includes('tavern') || name.includes('speakeasy') || name.includes('cocktail');
          const isCoffee = types.includes('coffee_shop') || name.includes('coffee') || name.includes('roasters') || name.includes('espresso');
          const isBakery = types.includes('bakery') || name.includes('bakery');
          const isCafe = types.includes('cafe') || name.includes('cafe');

          if (discoveryType === 'drink') {
            if (isBrewery) {
              classification = 'Brewery';
              hipScore += 10;
            } else if (isBar) {
              classification = 'Bar';
              if (types.includes('cocktail_bar') || types.includes('wine_bar') || name.includes('cocktail') || name.includes('mixology')) hipScore += 8;
              else hipScore += 5;
            } else if (isCafe || isCoffee) { // Coffee spots found in drink search (unlikely but possible)
              classification = isCoffee ? 'Coffee Shop' : 'Cafe';
            }
          } else { // coffee search
            if (isCoffee) {
              classification = 'Coffee Shop';
              hipScore += 5;
            } else if (isBakery) {
              classification = 'Bakery';
              hipScore += 3;
            } else if (isCafe) {
              classification = 'Cafe';
              hipScore += 3;
            } else if (isBar || isBrewery) {
               classification = isBrewery ? 'Brewery' : 'Bar';
            }
          }
          
          // Rating boost
          if (p.rating >= 4.5) hipScore += 5;

          // Proximity calculation (squared distance for sorting)
          const distSq = Math.pow(lat - center.lat(), 2) + Math.pow(lng - center.lng(), 2);

          return {
            id: p.place_id,
            name: p.name || 'Unknown Spot',
            lat,
            lng,
            rating: p.rating,
            vicinity: p.vicinity,
            hipScore,
            classification,
            distSq
          };
        })
        // REMOVE anything classified as a general Restaurant
        .filter(p => p.classification !== 'Restaurant')
        // Sort by distance (proximity)
        .sort((a, b) => a.distSq - b.distSq)
        .slice(0, 20) // Top 20 nearby spots
        .map(p => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          description: `${p.classification} • ${p.vicinity || ''}${p.vicinity ? ' • ' : ''}${p.rating ? `${p.rating}★` : 'New'} ${p.hipScore > 10 ? '🔥 Hotspot' : p.hipScore > 5 ? '⚡ Trending' : '✨ Recommended'}`,
          category: p.classification === 'Coffee Shop' || p.classification === 'Cafe' || p.classification === 'Bakery' ? 'Coffee' : p.classification === 'Bar' || p.classification === 'Brewery' ? 'Cocktail' : 'Other',
          status: 'discover',
          website: `https://www.google.com/maps/place/?q=place_id:${p.id}`,
          openingHours: []
        }));
      
      setDiscoveredPlaces(processed);
      setActiveTab('discover');

      if (processed.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        processed.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds);
      }
    } catch (error) {
      console.error('Nearby Search Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractCityFromAddress = (address: string) => {
    if (!address) return '';
    const parts = address.split(',');
    // Generally "City, State Zip, Country" or "City, Zip, Country"
    if (parts.length >= 3) {
      return parts[parts.length - 3].trim();
    }
    return parts[0].trim();
  };

  const fetchPlaceDetails = (placeId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!placesLib || !map) {
        reject('Places library not loaded');
        return;
      }
      const service = new (placesLib as any).PlacesService(map);
      service.getDetails({
        placeId: placeId,
        fields: ['opening_hours', 'website', 'formatted_address']
      }, (place: any, status: any) => {
        if (status === (placesLib as any).PlacesServiceStatus.OK && place) {
          resolve({
            openingHours: place.opening_hours?.weekday_text || [],
            website: place.website || '',
            city: extractCityFromAddress(place.formatted_address || '')
          });
        } else {
          reject(status);
        }
      });
    });
  };

  const selectLocation = async (loc: any) => {
    setSelectedLocation(loc);
    if (map) map.panTo({ lat: loc.lat, lng: loc.lng });

    // If it's a discovered place and we don't have hours yet, fetch them to show in UI
    if (loc.status === 'discover' && (!loc.openingHours || loc.openingHours.length === 0)) {
      try {
        const details = await fetchPlaceDetails(loc.id);
        if (details) {
          const updatedLoc = { ...loc, ...details };
          setSelectedLocation(prev => prev && prev.id === loc.id ? updatedLoc : prev);
          // Also update the discoveredPlaces list so we don't refetch
          setDiscoveredPlaces(prev => prev.map(p => p.id === loc.id ? updatedLoc : p));
        }
      } catch (err) {
        console.warn("Failed to fetch discovery details", err);
      }
    }
  };

  const saveToWishlist = async (place: any) => {
    if (!user) return;
    
    let placeToSave = { ...place };
    
    // Ensure we have hours if it's a discovery place
    if (place.status === 'discover' && (!placeToSave.openingHours || placeToSave.openingHours.length === 0)) {
      try {
        const details = await fetchPlaceDetails(place.id);
        if (details) {
          placeToSave = { ...placeToSave, ...details };
        }
      } catch (err) {
        console.warn("Failed to fetch details before saving", err);
      }
    }

    try {
      await addDoc(collection(db, 'locations'), {
        name: placeToSave.name,
        city: placeToSave.city || '',
        category: placeToSave.category || 'Other',
        description: placeToSave.description || '',
        website: placeToSave.website || '',
        openingHours: placeToSave.openingHours || [],
        status: 'wishlist',
        lat: Number(placeToSave.lat),
        lng: Number(placeToSave.lng),
        userId: user.uid,
        isPublic: profile?.showWishlist ?? false,
        createdAt: serverTimestamp(),
      });
      // Remove from discovered list after saving
      setDiscoveredPlaces(prev => prev.filter(p => p.id !== place.id));
      setSelectedLocation(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'locations');
    }
  };

  const onPlaceSelect = useCallback((place: any) => {
    if (place.location) {
      const pLat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
      const pLng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
      setLat(pLat);
      setLng(pLng);
      setName(place.name || '');
      setWebsite(place.website || '');
      setOpeningHours(place.openingHours || []);
      setIsAdding(true);
      
      if (map) {
        map.panTo({ lat: pLat, lng: pLng });
        map.setZoom(16);
      }
    }
  }, [map]);

  const filteredLocations = activeTab === 'discover' ? discoveredPlaces : [...locations, ...sippedPosts].filter(l => l.status === activeTab);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 min-h-screen">
       <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-8 px-4">
        <div className="ink-bleed">
          <h1 className="text-3xl md:text-5xl font-sans font-black text-brand-primary leading-[0.8] tracking-widest uppercase flex flex-col organic-text">
            <span className="-rotate-1 text-2xl md:text-4xl">SIPS</span>
            <span className="rotate-1 bg-brand-primary text-white px-4 w-fit pb-1">LOG.</span>
          </h1>
        </div>
        
        <div className="flex bg-bg-alt p-1.5 rounded-none w-full lg:w-auto border-2 border-brand-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] items-center">
          <button
            onClick={() => setActiveTab('recommended')}
            className={`flex-1 lg:flex-none px-6 py-2.5 text-[9px] font-display uppercase tracking-[0.2em] transition-all transform ${
              activeTab === 'recommended' ? 'bg-brand-primary text-white shadow-md scale-[1.05]' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Places I've Sipped
          </button>
          <button
            onClick={() => setActiveTab('wishlist')}
            className={`flex-1 lg:flex-none px-6 py-2.5 text-[9px] font-display uppercase tracking-[0.2em] transition-all transform ${
              activeTab === 'wishlist' ? 'bg-brand-primary text-white shadow-md scale-[1.05]' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Places To Sip
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            className={`flex-1 lg:flex-none px-6 py-2.5 text-[9px] font-display uppercase tracking-[0.2em] transition-all transform ${
              activeTab === 'discover' ? 'bg-brand-primary text-white shadow-md scale-[1.05]' : 'text-text-muted hover:text-text-main'
            }`}
          >
            Find a Sip
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[1000px] lg:h-[750px] mb-8">
        {/* Map Container */}
        <div className="h-[450px] lg:h-auto lg:flex-1 rounded-none overflow-hidden border-4 border-brand-primary shadow-[12px_12px_0px_0px_rgba(0,0,0,0.05)] relative z-0">
          {loading ? (
            <div className="w-full h-full bg-bg-alt flex items-center justify-center">
              <Loader2 className="animate-spin text-brand-primary" size={32} strokeWidth={3} />
            </div>
          ) : (
            <div className="w-full h-full relative">
              <Map
                mapId="bf51a91002e1c967" // Standard Map ID
                defaultCenter={{lat: 40.7128, lng: -74.0060}}
                defaultZoom={13}
                onClick={() => setSelectedLocation(null)}
                gestureHandling={'greedy'}
                disableDefaultUI={true}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
              >
                {filteredLocations.map(loc => (
                  <MarkerWithInfoWindow 
                    key={loc.id} 
                    location={loc} 
                    onRemove={removeLocation}
                    onSelect={selectLocation}
                    onSave={saveToWishlist}
                  />
                ))}
              </Map>
              
              {/* Floating Find a Sip Buttons */}
              <div className="absolute top-24 left-6 z-[1000] flex flex-col gap-3">
                <button
                  onClick={() => discoverNearby('coffee')}
                  className="bg-white border-4 border-brand-primary p-3 flex items-center justify-start hover:scale-110 active:scale-95 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] group overflow-hidden"
                >
                  <Coffee className="text-brand-primary group-hover:rotate-12 transition-transform" size={20} strokeWidth={3} />
                  <span className="ml-3 text-[10px] font-sans font-black uppercase tracking-widest text-brand-primary pr-2">Find Coffee Nearby</span>
                </button>
                <button
                  onClick={() => discoverNearby('drink')}
                  className="bg-white border-4 border-brand-primary p-3 flex items-center justify-start hover:scale-110 active:scale-95 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] group overflow-hidden"
                >
                  <Martini className="text-brand-primary group-hover:-rotate-12 transition-transform" size={20} strokeWidth={3} />
                  <span className="ml-3 text-[10px] font-sans font-black uppercase tracking-widest text-brand-primary pr-2">Find a Drink Nearby</span>
                </button>
              </div>

              {/* Floating Search Bar */}
              <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-center pointer-events-none">
                <div className="w-full max-w-md pointer-events-auto group">
                   <div className="relative transform hover:-rotate-1 transition-transform duration-500">
                     <div className="absolute inset-0 bg-brand-primary translate-x-2 translate-y-2 opacity-50 group-focus-within:translate-x-3 group-focus-within:translate-y-3 transition-all"></div>
                     <div className="relative bg-white border-4 border-brand-primary overflow-hidden">
                       <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary pointer-events-none z-10">
                         <Search size={18} strokeWidth={3} />
                       </div>
                       <PlaceAutocomplete 
                         value={name}
                         onInputChange={(val) => setName(val)}
                         onPlaceSelect={onPlaceSelect} 
                       />
                     </div>
                   </div>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 z-[1000]">
                <div className="bg-brand-primary text-white px-6 py-3 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] rotate-2 border-2 border-white/20">
                  <span className="text-[10px] font-sans font-black uppercase tracking-widest">Search above to find places to SIP</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Collection */}
        <div className="flex-1 lg:w-80 flex flex-col gap-4 overflow-y-auto pr-2 min-h-0">
          <AnimatePresence mode="wait">
            {selectedLocation ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white rounded-none p-6 shadow-xl border-4 border-brand-primary relative group rotate-1"
              >
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="absolute top-4 right-4 text-brand-primary hover:scale-110 transition-transform"
                >
                  <X size={20} strokeWidth={3} />
                </button>
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-brand-secondary mb-2">
                    <MapPin size={14} strokeWidth={3} />
                    <span className="text-[8px] uppercase tracking-[0.3em] font-black">Details</span>
                  </div>
                  <h3 className="text-xl font-sans font-black text-text-main leading-tight mb-2 uppercase tracking-[0.2em] ink-bleed">
                    {selectedLocation.name}
                    {selectedLocation.city && <span className="block text-xs opacity-50 font-sans tracking-widest mt-0.5">in {selectedLocation.city}</span>}
                  </h3>
                  {selectedLocation.description && (
                    <p className="text-sm text-text-main font-medium leading-relaxed opacity-70 mb-3">
                      {selectedLocation.description}
                    </p>
                  )}
                  
                  {selectedLocation.website && (
                    <a 
                      href={selectedLocation.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[8px] font-sans font-bold uppercase tracking-widest text-brand-primary border-b-2 border-brand-primary mb-4 hover:opacity-70 transition-opacity"
                    >
                      <Info size={12} />
                      Visit Website
                    </a>
                  )}

                  {selectedLocation.openingHours && selectedLocation.openingHours.length > 0 && (
                    <div className="mb-4 bg-bg-alt p-4 border-l-4 border-brand-primary">
                      <span className="text-[8px] font-sans font-black uppercase tracking-[0.2em] text-text-muted mb-2 block">Hours of Operation</span>
                      <div className="space-y-0.5">
                        {selectedLocation.openingHours.map((line, i) => (
                          <p key={i} className="text-[9px] text-text-main uppercase tracking-tight">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedLocation as any).isFromFeed && (
                    <div className="mt-2 inline-block bg-brand-primary/5 border-l-4 border-brand-primary px-3 py-1.5 mb-2">
                       <span className="text-[8px] font-sans font-black uppercase tracking-widest text-brand-primary">Imported from Feed</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-bg-alt">
                  <div className="flex gap-2">
                    {/* Stars removed at user request */}
                  </div>
                  {activeTab === 'discover' ? (
                    <button
                      onClick={() => saveToWishlist(selectedLocation)}
                      className="text-[8px] uppercase tracking-[0.2em] text-brand-primary font-black font-sans transition-all bg-brand-primary/10 px-3 py-1.5 -rotate-2 hover:scale-105 active:scale-95"
                    >
                      Add to Wishlist
                    </button>
                  ) : !(selectedLocation as any).isFromFeed && (
                    <button
                      onClick={() => removeLocation(selectedLocation.id)}
                      className="text-[8px] uppercase tracking-[0.2em] text-red-500 font-sans font-bold transition-all bg-red-50 px-2 py-1 -rotate-2"
                    >
                      Remove Spot
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                {activeTab === 'discover' && filteredLocations.length === 0 && (
                  <div className="bg-white border-4 border-dashed border-brand-primary p-8 text-center rotate-1">
                    <Sparkles className="mx-auto text-brand-primary opacity-20 mb-4" size={40} />
                    <p className="text-[10px] uppercase tracking-widest text-text-muted font-black">Click find nearby to find a new sip</p>
                  </div>
                )}
                {filteredLocations.map((loc, idx) => (
                  <div
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className={`bg-white rounded-none p-4 border-4 border-brand-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-none transition-all cursor-pointer group ${idx % 2 === 0 ? 'rotate-1' : '-rotate-1'} relative`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-sans font-black text-lg text-text-main group-hover:text-brand-primary transition-colors uppercase tracking-[0.2em] ink-bleed">{loc.name}</h3>
                      <div className="flex items-center gap-2">
                        {activeTab === 'discover' && (
                          <div className="bg-brand-primary text-white px-2 py-1 text-[8px] font-black uppercase -rotate-6">New</div>
                        )}
                        {(activeTab === 'wishlist' || activeTab === 'recommended') && !loc.isFromFeed && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(loc);
                              }}
                              className="text-brand-primary hover:scale-110 transition-all p-1"
                              title="Edit spot"
                            >
                              <Edit2 size={16} strokeWidth={3} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Remove ${loc.name} from your list?`)) {
                                  removeLocation(loc.id);
                                }
                              }}
                              className="text-red-500 hover:scale-110 transition-all p-1"
                              title="Remove from list"
                            >
                              <X size={16} strokeWidth={3} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-text-muted line-clamp-1 font-medium opacity-60">{loc.description}</p>
                  </div>
                ))}
                {filteredLocations.length === 0 && activeTab !== 'discover' && (
                  <div className="bg-bg-alt rounded-none p-8 text-center border-4 border-dashed border-brand-primary -rotate-2">
                    <p className="text-text-muted font-sans font-bold text-xl uppercase tracking-tighter opacity-40">Your log is empty.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Place Dialog */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setName('');
                setLat(0);
                setLng(0);
                setCity('');
                setCategory('Coffee');
                setDescription('');
                setWebsite('');
                setOpeningHours([]);
              }}
              className="absolute inset-0 bg-bg-base/95 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-lg bg-white rounded-none p-8 shadow-2xl border-4 border-brand-primary"
            >
              <button 
                onClick={() => {
                  setIsAdding(false);
                  setEditingId(null);
                  setName('');
                  setLat(0);
                  setLng(0);
                  setCity('');
                  setCategory('Coffee');
                  setDescription('');
                  setWebsite('');
                  setOpeningHours([]);
                }}
                className="absolute top-6 right-6 text-brand-primary hover:scale-110 transition-transform"
              >
                <X size={24} strokeWidth={3} />
              </button>

              <div className="mb-8 text-center text-balance">
                <span className="text-[9px] uppercase tracking-[0.4em] text-brand-primary font-black opacity-60">{editingId ? 'Updating Memory' : 'Memory Keeper'}</span>
                <h2 className="text-2xl font-sans font-black text-text-main mt-2 leading-tight uppercase tracking-[0.2em] ink-bleed">{editingId ? 'Edit your sip spot' : 'Add a spot to sip'}</h2>
                <div className="mt-6 space-y-4 text-left">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">SEARCH OR NAME OF PLACE</label>
                    <PlaceAutocomplete 
                      value={name}
                      onInputChange={(val) => setName(val)}
                      onPlaceSelect={onPlaceSelect} 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">CITY</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="E.G. NEW YORK"
                      className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-3.5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-sans font-bold uppercase tracking-widest text-[10px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">Category</label>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {['Coffee', 'Wine', 'Beer', 'Cocktail', 'Other'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat as DrinkCategory)}
                          className={`px-3 py-1.5 text-[9px] font-sans font-black uppercase tracking-widest transition-all ${
                            category === cat 
                              ? 'bg-brand-primary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] -rotate-2' 
                              : 'bg-bg-alt text-text-muted border-2 border-brand-primary/10 hover:border-brand-primary/40'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-black ml-4">WHY DO YOU LOVE IT? (OPTIONAL)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="TELL US ABOUT THE SIPS..."
                      className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-6 py-3.5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-sans font-bold uppercase tracking-widest text-[10px] min-h-[100px]"
                    />
                  </div>
                </div>

                {lat !== 0 && lng !== 0 ? (
                  <div className="bg-brand-primary text-white p-3 items-center justify-center inline-flex gap-2 rotate-1 mt-4">
                    <Navigation size={12} strokeWidth={3} />
                    <span className="text-[9px] uppercase tracking-[0.2em] font-black">Location Pin Set</span>
                  </div>
                ) : (
                  <p className="text-[9px] uppercase tracking-[0.2em] text-red-500 mt-4 font-black">Search for a spot above</p>
                )}
              </div>

              <form onSubmit={handleAddLocation} className="space-y-6">
                <button
                  type="submit"
                  disabled={lat === 0 || lng === 0}
                  className="w-full bg-brand-primary text-white py-4 rounded-none font-sans font-black uppercase tracking-[0.3em] text-xs transition-all hover:bg-brand-primary/95 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] active:shadow-none translate-y-[-2px] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingId ? "Update spot details" : (activeTab === 'recommended' ? "Capture this memory" : "Put it on my wishlist")}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MarkerWithInfoWindow({ 
  location, 
  onRemove,
  onSelect,
  onSave
}: { 
  location: any, 
  onRemove: (id: string) => void,
  onSelect: (loc: any) => void,
  onSave?: (loc: any) => void
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  const getIcon = () => {
    if (location.status === 'discover') return <Sparkles size={18} strokeWidth={3} />;
    switch (location.category) {
      case 'Coffee': return <Coffee size={18} strokeWidth={3} />;
      case 'Wine': return <Wine size={18} strokeWidth={3} />;
      case 'Beer': return <Beer size={18} strokeWidth={3} />;
      case 'Cocktail': return <Martini size={18} strokeWidth={3} />;
      default: return <GlassWater size={18} strokeWidth={3} />;
    }
  };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: location.lat, lng: location.lng }}
        onClick={() => {
          setOpen(true);
          onSelect(location);
        }}
      >
        <div className={`p-2 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110 active:scale-95 ${
          location.status === 'discover' ? 'bg-brand-secondary text-white' :
          location.status === 'recommended' ? 'bg-brand-primary text-white' : 'bg-brand-primary/40 text-white'
        }`}>
          {getIcon()}
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => setOpen(false)}
        >
          <div className="p-2 min-w-[150px]">
             <h4 className="font-display uppercase tracking-tight text-brand-primary text-sm mb-1">
               {location.name}
               {location.city && <span className="block text-[8px] opacity-60 font-sans tracking-widest">({location.city})</span>}
             </h4>
             <p className="text-[10px] text-text-muted line-clamp-2">{location.description}</p>
             {location.status === 'discover' && onSave && (
               <button 
                 onClick={() => onSave(location)}
                 className="mt-2 w-full bg-brand-primary text-white text-[8px] uppercase tracking-widest font-black py-1 px-2 -rotate-1 active:scale-95 transition-transform"
               >
                 Add to Wishlist
               </button>
             )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

