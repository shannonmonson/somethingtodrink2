import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  bio?: string;
  showWishlist?: boolean;
  createdAt: Timestamp;
}

export type DrinkCategory = 'Coffee' | 'Wine' | 'Beer' | 'Cocktail' | 'Other';

export interface Post {
  id?: string;
  userId: string;
  userName: string;
  userPhoto: string;
  imageUrl: string;
  drinkName: string;
  category?: DrinkCategory;
  caption?: string;
  rating?: number;
  locationName?: string;
  city?: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
  createdAt: Timestamp;
}

export interface LocationMarker {
  id: string;
  name: string;
  city?: string;
  category?: DrinkCategory;
  description?: string;
  website?: string;
  openingHours?: string[];
  lat: number;
  lng: number;
  status: 'recommended' | 'wishlist';
  userId: string;
  isPublic?: boolean;
  createdAt: Timestamp;
}

export interface Follow {
  followerId: string;
  followedId: string;
  createdAt: Timestamp;
}
