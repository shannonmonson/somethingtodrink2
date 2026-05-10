import React, { useRef, useEffect } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface Props {
  onPlaceSelect: (place: any) => void;
  onInputChange?: (value: string) => void;
  value?: string;
}

export default function PlaceAutocomplete({ onPlaceSelect, onInputChange, value }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLibrary = useMapsLibrary('places');

  useEffect(() => {
    if (inputRef.current && value !== undefined && value !== inputRef.current.value) {
      inputRef.current.value = value;
    }
  }, [value]);

  useEffect(() => {
    if (!placesLibrary || !inputRef.current) return;

    const options = {
      fields: ['name', 'geometry', 'formatted_address', 'address_components', 'website', 'opening_hours'],
    };

    // Use the standard Autocomplete class (works with standard 'Places API')
    const autocomplete = new placesLibrary.Autocomplete(inputRef.current, options);

    const handlePlaceChanged = () => {
      const place = autocomplete.getPlace();
      
      if (!place.geometry || !place.geometry.location) {
        return;
      }

      // Extract city from address_components
      let city = '';
      if (place.address_components) {
        const locality = place.address_components.find(c => 
          c.types.includes('locality')
        );
        if (locality) {
          city = locality.long_name;
        } else {
          // Fallback to administrative_area_level_1 (state) or postal_town if locality not found
          const adminArea = place.address_components.find(c => 
            c.types.includes('administrative_area_level_1')
          );
          if (adminArea) city = adminArea.short_name;
        }
      }

      const normalizedPlace = {
        name: place.name || '',
        city: city,
        location: place.geometry.location,
        formattedAddress: place.formatted_address || '',
        website: place.website || '',
        openingHours: place.opening_hours?.weekday_text || []
      };
      
      onPlaceSelect(normalizedPlace);
    };

    const listener = autocomplete.addListener('place_changed', handlePlaceChanged);

    return () => {
      // Clean up listeners
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLibrary, onPlaceSelect]);

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        onChange={(e) => onInputChange?.(e.target.value)}
        placeholder="SEARCH FOR A SPOT..."
        className="w-full bg-bg-alt border-2 border-brand-primary rounded-none px-8 py-5 text-text-main outline-none focus:ring-4 ring-brand-primary/10 transition-all font-display placeholder:text-text-muted/20 uppercase tracking-tight text-sm"
      />
      <style dangerouslySetInnerHTML={{ __html: `
        .pac-container {
          border: 4px solid #5A5A40 !important;
          border-radius: 0px !important;
          margin-top: 4px !important;
          box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.1) !important;
          font-family: inherit !important;
          background-color: #fdfcf8 !important;
        }
        .pac-item {
          padding: 12px 20px !important;
          border-top: 1px solid #e2e2d5 !important;
          cursor: pointer !important;
        }
        .pac-item:hover {
          background-color: #f7f6f0 !important;
        }
        .pac-item-query {
          font-size: 14px !important;
          color: #5A5A40 !important;
          text-transform: uppercase !important;
          font-weight: 700 !important;
        }
      `}} />
    </div>
  );
}
