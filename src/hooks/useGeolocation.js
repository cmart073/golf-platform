import { useCallback, useState } from 'react';

// Thin wrapper over navigator.geolocation that exposes idle / requesting
// / granted / denied states and never throws. The wizard's "Find courses
// near me" button calls request() and renders one of the four states.

const STATES = { idle: 'idle', requesting: 'requesting', granted: 'granted', denied: 'denied' };

export function useGeolocation() {
  const [status, setStatus] = useState(STATES.idle);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus(STATES.denied);
      setError('Geolocation is not available in this browser');
      return Promise.resolve(null);
    }
    setStatus(STATES.requesting);
    setError(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setCoords(c);
          setStatus(STATES.granted);
          resolve(c);
        },
        (e) => {
          setStatus(STATES.denied);
          setError(e?.message || 'Location request denied');
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }, []);

  return { status, coords, error, request };
}
