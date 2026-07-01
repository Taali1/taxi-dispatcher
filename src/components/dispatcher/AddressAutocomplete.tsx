import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapPin, Loader, Star, Database } from 'lucide-react';

interface AddressSuggestion {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    municipality?: string;
    county?: string;
    postcode?: string;
  };
}

export interface CustomPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  preference_ids: number[];
}

export interface LocalAddress {
  id: number;
  street: string;
  house_number: string | null;
  city: string;
  postcode: string | null;
  lat: number;
  lng: number;
  notes: string | null;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  /** Przycisk renderowany po prawej stronie inputa (wewnątrz flex-row) */
  rightButton?: React.ReactNode;
  zoneBadge?: string | null;
  /** Gdy true — zamiast badge wyświetla kręcące się kółko (trwa wykrywanie rejonu) */
  isDetectingZone?: boolean;
  onCoordinateSelect?: (lat: number, lng: number) => void;
  /** Miasto bazowe z ustawień systemu — priorytetyzuje wyniki Nominatim */
  baseCity?: string;
  /** Niestandardowe adresy z bazy danych (pinezki z panelu Adresy) */
  customPins?: CustomPin[];
  /** Wywoływane gdy użytkownik wybierze niestandardowy adres */
  onCustomPinSelect?: (pin: CustomPin) => void;
  /** Lokalna baza adresów (załadowana z /api/local-addresses/all) */
  localAddresses?: LocalAddress[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Linia główna podpowiedzi: "Ulica Numer" (tak jak Google Maps)
 */
const formatSuggestionLabel = (s: AddressSuggestion): string => {
  const road = s.address?.road || '';
  const num  = s.address?.house_number || '';
  const street = num ? `${road} ${num}` : road;
  if (street) return street;
  // Fallback: pierwszy segment display_name
  return s.display_name.split(',')[0].trim();
};

/**
 * Linia pomocnicza podpowiedzi: "32-600 Bydgoszcz" (kod pocztowy + miasto)
 */
const formatSuggestionSecondary = (s: AddressSuggestion): string => {
  const city     = s.address?.city || s.address?.town || s.address?.village || s.address?.suburb || '';
  const postcode = s.address?.postcode || '';
  if (postcode && city) return `${postcode} ${city}`;
  if (city) return city;
  return '';
};

/**
 * Wartość wpisywana do inputa po wyborze sugestii.
 * Format: "Leśna 21, 32-600 Bydgoszcz"
 */
const formatSelectedValue = (s: AddressSuggestion): string => {
  const road   = s.address?.road || '';
  const num    = s.address?.house_number || '';
  const street = num ? `${road} ${num}` : road;
  const city   = s.address?.city || s.address?.town || s.address?.village || '';
  const postcode = s.address?.postcode || '';

  const location = postcode && city ? `${postcode} ${city}` : city;
  if (street && location) return `${street}, ${location}`;
  if (street) return street;
  return s.display_name.split(',').slice(0, 2).join(',').trim();
};

// ─── Fuzzy helpers ───────────────────────────────────────────────────────────

/**
 * Normalizuje polskie znaki diakrytyczne → ASCII
 * Dzięki temu "Sklodow" trafi na "Skłodowskiej", "lodz" na "Łódź" itp.
 */
const normalizePL = (s: string): string =>
  s.toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');

// ─── Component ───────────────────────────────────────────────────────────────

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  placeholder,
  className,
  icon,
  rightButton,
  zoneBadge,
  isDetectingZone = false,
  onCoordinateSelect,
  baseCity = '',
  customPins = [],
  onCustomPinSelect,
  localAddresses = [],
}) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Niestandardowe pinezki pasujące do bieżącego wpisanego tekstu
  const matchingCustomPins = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!customPins.length || trimmed.length < 1) return [];
    return customPins
      .filter(p => p.name.toLowerCase().includes(trimmed))
      .slice(0, 5);
  }, [value, customPins]);

  // Lokalna baza adresów — fuzzy matching:
  // Każde słowo z zapytania musi wystąpić gdziekolwiek w "ulica nr miasto"
  // Normalizacja polskich liter: "Sklodow" pasuje do "Skłodowskiej"
  const matchingLocalAddresses = useMemo(() => {
    const trimmed = value.trim();
    if (!localAddresses.length || trimmed.length < 2) return [];
    const words = normalizePL(trimmed.replace(/,/g, ' '))
      .split(/\s+/)
      .filter(w => w.length >= 2);
    if (words.length === 0) return [];
    return localAddresses
      .filter(addr => {
        const haystack = normalizePL(
          `${addr.street} ${addr.house_number ?? ''} ${addr.city} ${addr.postcode ?? ''}`
        );
        return words.every(w => haystack.includes(w));
      })
      .slice(0, 8);
  }, [value, localAddresses]);

  // Zamknij dropdown po kliknięciu poza komponentem
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Wyszukiwanie Nominatim ───────────────────────────────────────────────

  const searchAddresses = useCallback(async (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const fetchNominatim = async (q: string): Promise<AddressSuggestion[]> => {
        const params = new URLSearchParams({
          format: 'json',
          q,
          countrycodes: 'PL',
          limit: '8',
          addressdetails: '1',
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          { headers: { 'User-Agent': 'TaxiDispatchSystem/1.0' } }
        );
        if (!res.ok) return [];
        return res.json();
      };

      // Jeśli brak przecinka → user wpisuje ulicę → szukaj równolegle:
      //   1. "ulica miasto" — spacja (free-text) zamiast przecinka, dzięki czemu
      //      Nominatim robi dopasowanie dowolnego słowa w nazwie ulicy
      //      (np. "Skłodow Bydgoszcz" trafi na "Marii Skłodowskiej-Curie")
      //   2. sama ulica bez miasta — aby pokazać też wyniki spoza baseCity
      // Jeśli jest przecinek → sformatowany adres po selekcji → szukaj bez zmian
      const hasComma = trimmed.includes(',');
      const queries: string[] = [];

      if (!hasComma && baseCity) {
        queries.push(`${trimmed} ${baseCity}`); // lokalne — free-text z miastem
        queries.push(trimmed);                  // globalne — poza miastem
      } else {
        queries.push(trimmed);
      }

      // Równoległe zapytania
      const batches = await Promise.all(queries.map(fetchNominatim));

      // Scalaj i deduplikuj po place_id
      // Kolejność: wyniki z pierwszego zapytania (lokalne) trafiają pierwsze
      const seen = new Set<string>();
      const merged: AddressSuggestion[] = [];
      for (const batch of batches) {
        for (const r of batch) {
          if (!seen.has(r.place_id)) {
            seen.add(r.place_id);
            merged.push(r);
          }
        }
      }

      // Sortuj: wyniki z baseCity na górze, reszta poniżej
      const targetCity = baseCity.toLowerCase().trim();
      merged.sort((a, b) => {
        const aCity = (
          a.address?.city || a.address?.town || a.address?.village || a.address?.suburb || ''
        ).toLowerCase();
        const bCity = (
          b.address?.city || b.address?.town || b.address?.village || b.address?.suburb || ''
        ).toLowerCase();
        const aMatch = targetCity && aCity.includes(targetCity) ? 0 : 1;
        const bMatch = targetCity && bCity.includes(targetCity) ? 0 : 1;
        return aMatch - bMatch;
      });

      setSuggestions(merged.slice(0, 12));
    } catch (error) {
      console.error('[AddressAutocomplete] Nominatim error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [baseCity]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);

    // Debounce 350ms dla Nominatim
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 350);
  };

  const handleInputFocus = () => {
    if (matchingCustomPins.length > 0 || (value.trim().length >= 2 && suggestions.length > 0)) {
      setShowSuggestions(true);
    }
  };

  const handleSuggestionClick = (suggestion: AddressSuggestion) => {
    const selected = formatSelectedValue(suggestion);
    onChange(selected);
    setShowSuggestions(false);
    setSuggestions([]);

    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      onCoordinateSelect?.(lat, lng);
    }
  };

  const handleCustomPinClick = (pin: CustomPin) => {
    onChange(pin.name);
    setShowSuggestions(false);
    setSuggestions([]);
    onCoordinateSelect?.(pin.lat, pin.lng);
    onCustomPinSelect?.(pin);
  };

  const handleLocalAddressClick = (addr: LocalAddress) => {
    const street = addr.house_number ? `${addr.street} ${addr.house_number}` : addr.street;
    const location = addr.postcode && addr.city
      ? `${addr.postcode} ${addr.city}`
      : addr.city;
    const formatted = location ? `${street}, ${location}` : street;
    onChange(formatted);
    setShowSuggestions(false);
    setSuggestions([]);
    const lat = typeof addr.lat === 'number' ? addr.lat : parseFloat(addr.lat as any);
    const lng = typeof addr.lng === 'number' ? addr.lng : parseFloat(addr.lng as any);
    if (!isNaN(lat) && !isNaN(lng)) onCoordinateSelect?.(lat, lng);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasDropdownContent = matchingCustomPins.length > 0 || matchingLocalAddresses.length > 0 || suggestions.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      <div className="flex">
        {icon && (
          <div className="bg-gray-200 dark:bg-[#444444] border border-r-0 border-gray-300 dark:border-[#7a7a7a] rounded-l-lg px-3 py-2 flex items-center flex-shrink-0">
            {icon}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          className={className}
          style={(zoneBadge || isDetectingZone) ? { paddingRight: '3.5rem' } : undefined}
          placeholder={placeholder ?? (baseCity ? `np. Leśna 21` : 'Ulica Numer')}
          autoComplete="off"
        />

        {rightButton}

        {/* Spinner Nominatim (wyszukiwanie adresu) */}
        {isLoading && (
          <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${(zoneBadge || isDetectingZone) ? 'right-14' : 'right-3'}`}>
            <Loader className="w-4 h-4 text-gray-400 animate-spin" />
          </div>
        )}

        {/* Kręcące się kółko gdy trwa wykrywanie rejonu */}
        {isDetectingZone && !isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader className="w-4 h-4 text-black dark:text-white animate-spin" />
          </div>
        )}

        {/* Badge rejonu (R-56) — czarny tekst, rozmiar jak input */}
        {zoneBadge && !isDetectingZone && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <span className="text-sm text-black dark:text-white">
              {zoneBadge}
            </span>
          </div>
        )}
      </div>

      {/* Lista podpowiedzi */}
      {showSuggestions && hasDropdownContent && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-[#383838] border border-gray-300 dark:border-[#7a7a7a] rounded-lg shadow-lg max-h-72 overflow-y-auto"
        >
          {/* ── Sekcja niestandardowych pinezek (na górze) ── */}
          {matchingCustomPins.length > 0 && (
            <>
              {matchingCustomPins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => handleCustomPinClick(pin)}
                  className="w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors duration-150 border-b border-gray-200 dark:border-[#7a7a7a] last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <Star className="w-4 h-4 text-amber-500 shrink-0 fill-amber-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {pin.name}
                      </div>
                      {pin.preference_ids.length > 0 && (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          {pin.preference_ids.length} {pin.preference_ids.length === 1 ? 'preferencja' : 'preferencje'}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              {/* Separator gdy są też wyniki lokalne lub Nominatim */}
              {(matchingLocalAddresses.length > 0 || suggestions.length > 0) && (
                <div className="px-4 py-1 bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-[#7a7a7a]">
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-300 uppercase tracking-wide">Wszystkie adresy</span>
                </div>
              )}
            </>
          )}

          {/* ── Sekcja lokalnej bazy adresów ── */}
          {matchingLocalAddresses.length > 0 && (
            <>
              {matchingLocalAddresses.map((addr) => {
                const streetLine = addr.house_number ? `${addr.street} ${addr.house_number}` : addr.street;
                const cityLine = addr.postcode && addr.city
                  ? `${addr.postcode} ${addr.city}`
                  : addr.city;
                return (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => handleLocalAddressClick(addr)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-150 border-b border-gray-200 dark:border-[#7a7a7a] last:border-b-0"
                  >
                    <div className="flex items-start gap-3">
                      <Database className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-black dark:text-white truncate">
                          {streetLine}
                        </div>
                        <div className="text-xs text-blue-500 dark:text-blue-400 truncate">
                          {cityLine}{addr.notes ? ` · ${addr.notes}` : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Separator przed Nominatim */}
              {suggestions.length > 0 && (
                <div className="px-4 py-1 bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-[#7a7a7a]">
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-300 uppercase tracking-wide">OpenStreetMap</span>
                </div>
              )}
            </>
          )}

          {/* ── Sekcja wyników Nominatim ── */}
          {suggestions.map((suggestion) => {
            const label     = formatSuggestionLabel(suggestion);
            const secondary = formatSuggestionSecondary(suggestion);

            return (
              <button
                key={suggestion.place_id}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-[#585858] transition-colors duration-150 border-b border-gray-200 dark:border-[#7a7a7a] last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-black dark:text-white truncate">
                      {label}
                    </div>
                    {secondary && (
                      <div className="text-xs text-gray-500 dark:text-gray-300 truncate">
                        {secondary}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
