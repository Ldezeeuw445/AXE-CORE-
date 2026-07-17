import { useEffect, useState, useRef } from "react";

interface GoogleMaps3DState {
  isLoaded: boolean;
  error: string | null;
  is3DAvailable: boolean;
  debugLog: string[];
}

export function useGoogleMaps3D() {
  const [state, setState] = useState<GoogleMaps3DState>({
    isLoaded: false,
    error: null,
    is3DAvailable: false,
    debugLog: [],
  });
  const logsRef = useRef<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
    const logEntry = `[${timestamp}] ${msg}`;
    logsRef.current = [...logsRef.current, logEntry].slice(-20);
    console.log(`[GoogleMaps3D] ${logEntry}`);
  };

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    addLog("useGoogleMaps3D hook initialized");

    if (!apiKey) {
      const errorMsg = "Google Maps API key not configured. Set VITE_GOOGLE_MAPS_API_KEY in your environment.";
      addLog(`ERROR: ${errorMsg}`);
      setState((prev) => ({ ...prev, error: errorMsg }));
      return;
    }
    addLog(`API key found: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

    if (window.google?.maps) {
      addLog("Google Maps already loaded on window");
      const has3D = typeof (window.google.maps as any).maps3d !== "undefined";
      addLog(`3D API available: ${has3D}`);
      setState({
        isLoaded: true,
        error: null,
        is3DAvailable: has3D,
        debugLog: logsRef.current,
      });
      return;
    }

    addLog("Loading Google Maps API script...");
    const script = document.createElement("script");
    // Use v=beta for 3D support (v=alpha is deprecated)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      addLog("Script loaded successfully");
      if (window.google?.maps) {
        addLog("window.google.maps is available");
        const has3D = typeof (window.google.maps as any).maps3d !== "undefined";
        addLog(`google.maps.maps3d available: ${has3D}`);

        if (!has3D) {
          addLog("WARNING: 3D API not available - falling back to standard satellite view");
          addLog("To enable 3D: Create a Map ID in Google Cloud Console, enable Map Tiles API, and enable billing");
        }

        setState({
          isLoaded: true,
          error: null,
          is3DAvailable: has3D,
          debugLog: logsRef.current,
        });
      } else {
        const errorMsg = "Google Maps loaded but window.google.maps is missing";
        addLog(`ERROR: ${errorMsg}`);
        setState((prev) => ({ ...prev, error: errorMsg, debugLog: logsRef.current }));
      }
    };

    script.onerror = () => {
      const errorMsg = "Failed to load Google Maps 3D API. Check your API key and network connection.";
      addLog(`ERROR: ${errorMsg}`);
      setState((prev) => ({ ...prev, error: errorMsg, debugLog: logsRef.current }));
    };

    document.head.appendChild(script);
    addLog(`Script appended to head: ${script.src.split("?")[0]}?key=...&libraries=...&v=beta`);

    return () => {
      addLog("Cleanup: removing script tag");
      if (script.parentNode) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return { ...state, addLog };
}
