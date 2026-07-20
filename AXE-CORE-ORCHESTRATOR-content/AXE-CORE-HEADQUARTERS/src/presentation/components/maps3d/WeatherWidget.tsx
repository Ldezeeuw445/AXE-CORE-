import React, { useState, useEffect } from "react";
import { WeatherData } from "@/domain/maps3d/types";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  HelpCircle,
  Droplets,
  Wind,
  Thermometer,
  RefreshCw,
  X,
} from "lucide-react";

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  cityName: string;
}

export function WeatherWidget({ lat, lng, cityName }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchWeather = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
      if (!response.ok) {
        throw new Error("Unable to fetch weather details.");
      }
      const data = await response.json();
      setWeather(data);
    } catch (err: any) {
      console.error(err);
      setError("Weather feed offline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, [lat, lng]);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="w-10 h-10 text-cyan-400 animate-pulse" />;
    if (code >= 1 && code <= 3) return <Cloud className="w-10 h-10 text-slate-400" />;
    if (code >= 51 && code <= 65) return <CloudRain className="w-10 h-10 text-cyan-400 animate-pulse" />;
    if (code >= 71 && code <= 75) return <CloudSnow className="w-10 h-10 text-cyan-200" />;
    if (code >= 80 && code <= 82) return <CloudRain className="w-10 h-10 text-cyan-500" />;
    if (code >= 95 && code <= 99) return <CloudLightning className="w-10 h-10 text-violet-400 animate-bounce" />;
    return <HelpCircle className="w-10 h-10 text-slate-500" />;
  };

  return (
    <div className="bg-[#050608] border border-cyan-950/80 rounded-xl overflow-hidden shadow-xl font-sans select-none">
      <div className="p-3 bg-[#030406] border-b border-cyan-950/60 flex items-center justify-between">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-cyan-400" /> Atmospheric Sensors
        </span>
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="p-1 hover:bg-cyan-950/20 rounded text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh weather data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs text-slate-500 font-mono">Acquiring atmospheric feed...</span>
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-xs text-rose-400 font-mono">{error}</p>
            <button
              onClick={fetchWeather}
              className="mt-2 text-[10px] uppercase font-mono tracking-wider text-cyan-400 hover:underline cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : weather ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getWeatherIcon(weather.conditionCode)}
                <div>
                  <span className="text-2xl font-bold text-white tracking-tight">{weather.temperature.toFixed(1)}°C</span>
                  <p className="text-xs text-slate-400 font-medium capitalize mt-0.5">{weather.description}</p>
                </div>
              </div>
              <span className="text-[10px] bg-cyan-950/20 text-cyan-400 px-2 py-1 rounded border border-cyan-950 font-mono text-right shrink-0">
                STATION: {cityName.slice(0, 10).toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cyan-950/40 text-xs">
              <div className="flex items-center gap-2 bg-black border border-cyan-950 p-2 rounded-lg">
                <Thermometer className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[10px] block font-mono uppercase">Apparent</span>
                  <span className="text-slate-200 font-medium font-mono">{weather.apparentTemperature.toFixed(1)}°C</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-black border border-cyan-950 p-2 rounded-lg">
                <Wind className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[10px] block font-mono uppercase">Wind</span>
                  <span className="text-slate-200 font-medium font-mono">{weather.windSpeed.toFixed(1)} km/h</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-black border border-cyan-950 p-2 rounded-lg">
                <Droplets className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[10px] block font-mono uppercase">Humidity</span>
                  <span className="text-slate-200 font-medium font-mono">{weather.humidity}%</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-black border border-cyan-950 p-2 rounded-lg">
                <CloudRain className="w-4 h-4 text-cyan-500 shrink-0" />
                <div>
                  <span className="text-slate-500 text-[10px] block font-mono uppercase">Precip</span>
                  <span className="text-slate-200 font-medium font-mono">{weather.precipitation} mm</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
