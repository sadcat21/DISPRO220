/**
 * Calculates the distance between two points in kilometers using the Haversine formula.
 * @param lat1 Latitude of the first point
 * @param lon1 Longitude of the first point
 * @param lat2 Latitude of the second point
 * @param lon2 Longitude of the second point
 * @returns Distance in kilometers
 */
export const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
};

const deg2rad = (deg: number): number => {
    return deg * (Math.PI / 180);
};

/**
 * Fetches address using Serper API (Google Search data)
 * @param lat Latitude
 * @param lon Longitude
 * @returns Promise with formatted address or null
 */
const fetchAddressViaSerper = async (lat: number, lon: number): Promise<string | null> => {
    const apiKey = import.meta.env.VITE_SERPER_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: `${lat}, ${lon}`,
                gl: 'dz',
                hl: 'ar'
            })
        });

        if (!response.ok) return null;
        const data = await response.json();

        // Check Knowledge Graph first (usually contains the most accurate address for coordinates)
        if (data.knowledgeGraph?.address) {
            return data.knowledgeGraph.address;
        }

        // Check Organic results if KG is missing
        if (data.organic && data.organic.length > 0) {
            // Usually the first organic result for a coordinate search has the address in the title or snippet
            // However, Serper's KG is the most reliable for this.
            // If KG is missing, we might want to check the title of the first organic result if it looks like an address
            const firstResult = data.organic[0];
            if (firstResult.title && (firstResult.title.includes('،') || firstResult.title.includes('Algeria') || firstResult.title.includes('الجزائر'))) {
                return firstResult.title;
            }
        }

        return null;
    } catch (error) {
        console.error('Serper geocoding failed:', error);
        return null;
    }
};

/**
 * Cleans up bilingual text (e.g., "Mostaganem مستغانم") to keep only Arabic if present.
 */
const cleanArabicText = (text: string): string => {
    if (!text) return '';
    // If it contains Arabic characters
    const arabicMatch = text.match(/[\u0600-\u06FF]+/g);
    if (arabicMatch) {
        return arabicMatch.join(' ');
    }
    return text;
};

/**
 * Gets the address from coordinates using Serper API or OpenStreetMap's Nominatim API as fallback.
 * @param lat Latitude
 * @param lon Longitude
 * @returns Promise with formatted address
 */
export const reverseGeocode = async (
    lat: number,
    lon: number
): Promise<string> => {
    // 1. Try Serper API first for high accuracy (Google Maps data)
    const serperAddress = await fetchAddressViaSerper(lat, lon);
    if (serperAddress) {
        return serperAddress;
    }

    // 2. Fallback to Nominatim with Spiral Search if Serper fails
    console.log('Falling back to Nominatim spiral search...');

    const searchGrid = [
        [0, 0], [0.0003, 0], [-0.0003, 0], [0, 0.0003], [0, -0.0003],
        [0.0005, 0.0005], [-0.0005, -0.0005], [0.0008, 0], [0, 0.0008],
        [-0.0008, 0], [0, -0.0008]
    ];

    let lastKnownAddress = 'عنوان غير معروف';

    for (const [offLat, offLon] of searchGrid) {
        try {
            const searchLat = lat + offLat;
            const searchLon = lon + offLon;
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${searchLat}&lon=${searchLon}&accept-language=ar&addressdetails=1`
            );
            if (!response.ok) continue;
            const data = await response.json();

            if (data && data.address) {
                const addr = data.address;
                const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || addr.road || addr.quarter || addr.subdivision || addr.city_district;

                const parts = [];
                if (neighborhood) parts.push(cleanArabicText(neighborhood));

                const city = addr.municipality || addr.city || addr.town || addr.village;
                if (city) {
                    const cleanCity = cleanArabicText(city);
                    if (cleanCity && cleanCity !== parts[parts.length - 1]) parts.push(`بلدية ${cleanCity}`);
                }

                const daira = addr.county;
                if (daira) {
                    const cleanDaira = cleanArabicText(daira);
                    // Avoid adding if it's the same as the city (e.g., city is also a daira)
                    if (cleanDaira && cleanDaira !== cleanArabicText(city || '') && cleanDaira !== parts[parts.length - 1]) parts.push(`دائرة ${cleanDaira}`);
                }

                const wilaya = addr.state || addr.province;
                if (wilaya) {
                    const cleanWilaya = cleanArabicText(wilaya);
                    // Avoid adding if it's the same as the daira or city
                    if (cleanWilaya && cleanWilaya !== cleanArabicText(daira || '') && cleanWilaya !== cleanArabicText(city || '') && cleanWilaya !== parts[parts.length - 1]) parts.push(`ولاية ${cleanWilaya}`);
                }

                const formatted = parts.length > 0 ? parts.join('، ') : data.display_name;
                if (neighborhood) return formatted;
                if (parts.length > 0) lastKnownAddress = formatted;
            }
            if (offLat !== 0 || offLon !== 0) await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error('Reverse geocoding step failed:', error);
        }
    }
    return lastKnownAddress;
};

/**
 * Formats distance into a human-readable string.
 * @param km Distance in kilometers
 * @returns Formatted string (e.g., "1.2 km" or "500 m")
 */
export const formatDistance = (km: number): string => {
    if (km < 1) {
        return `${Math.round(km * 1000)} متر`;
    }
    return `${km.toFixed(1)} كم`;
};
