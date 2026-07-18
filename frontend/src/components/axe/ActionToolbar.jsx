import React, { useState, useEffect } from "react";
import {
  Monitor,
  Camera,
  FileUp,
  Search,
  Globe,
  BrainCircuit,
  Sparkles,
  ChevronDown,
  Zap,
} from "lucide-react";
import { listActions } from "../../lib/actionRegistry";

export function ActionToolbar({
  onScreenCapture,
  onWebcamToggle,
  onFileUpload,
  onQuickAction,
  disabled,
}) {
  const [actions, setActions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showDropdown, setShowDropdown] = useState(null);

  useEffect(() => {
    listActions().then((res) => {
      if (res?.status === "ok") {
        setActions(res.actions || []);
        setCategories(res.categories || []);
      }
    }).catch(() => {
      // Fallback static actions if API fails
      setActions([]);
    });
  }, []);

  const quickActions = [
    { id: "screen_capture", icon: Monitor, label: "Screen", action: onScreenCapture },
    { id: "webcam", icon: Camera, label: "Webcam", action: onWebcamToggle },
    { id: "file_upload", icon: FileUp, label: "File", action: onFileUpload },
    { id: "web_search", icon: Search, label: "Search", action: () => onQuickAction("web_search") },
    { id: "browser", icon: Globe, label: "Browser", action: () => onQuickAction("browser_open_tab") },
    { id: "correlate", icon: BrainCircuit, label: "Correlate", action: () => onQuickAction("correlate_sources") },
  ];

  const groupedActions = categories.reduce((acc, cat) => {
    acc[cat] = actions.filter((a) => a.category === cat);
    return acc;
  }, {});

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5">
      <div className="flex items-center gap-1">
        {quickActions.map((qa) => {
          const Icon = qa.icon;
          return (
            <button
              key={qa.id}
              onClick={qa.action}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[9px] text-[#9FB0C0] hover:text-[#66E6FF] hover:bg-white/3 transition-colors"
              title={qa.label}
            >
              <Icon size={12} />
              <span className="hidden sm:inline">{qa.label}</span>
            </button>
          );
        })}
      </div>

      <div className="w-px h-3 bg-white/10 mx-1" />

      <div className="relative">
        <button
          onClick={() => setShowDropdown(showDropdown === "actions" ? null : "actions")}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[9px] text-[#9FB0C0] hover:text-[#66E6FF] hover:bg-white/3 transition-colors"
        >
          <Sparkles size={12} />
          <span className="hidden sm:inline">Actions</span>
          <ChevronDown size={10} />
        </button>

        {showDropdown === "actions" && (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setShowDropdown(null)}
            />
            <div className="absolute bottom-full left-0 mb-1 z-[61] min-w-[220px] max-h-[300px] overflow-y-auto"
              style={{
                background: "#0B0C0E",
                border: "1px solid rgba(0,212,255,0.25)",
                borderRadius: 8,
                boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
              }}
            >
              {Object.entries(groupedActions).map(([cat, catActions]) => (
                catActions.length > 0 && (
                  <div key={cat}>
                    <div className="px-2 py-1 text-[9px] font-semibold tracking-wider uppercase text-[#66E6FF] border-b border-white/5">
                      {cat}
                    </div>
                    {catActions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          onQuickAction(a.id);
                          setShowDropdown(null);
                        }}
                        className="w-full text-left px-2 py-1.5 text-[10px] text-[#EAF2F7] hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <Zap size={10} className="text-[#00D4FF]" />
                          {a.name}
                        </div>
                        <div className="text-[9px] text-[#6F8193] ml-4">{a.description}</div>
                      </button>
                    ))}
                  </div>
                )
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
