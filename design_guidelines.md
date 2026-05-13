{
  "brand": {
    "name": "AXE Intelligence Terminal",
    "attributes": [
      "CRUCIX-grade",
      "operator-first",
      "Bloomberg-dense",
      "black-on-black glass",
      "cyan-led hierarchy",
      "high-trust / low-noise",
      "fast scanning",
      "premium motion (restrained)"
    ],
    "anti_attributes": [
      "spacious marketing layout",
      "centered hero landing patterns",
      "neon cyberpunk overload",
      "purple/pink gradients across UI",
      "transparent cards",
      "emoji iconography"
    ]
  },

  "design_tokens": {
    "font": {
      "family": {
        "sans": "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
        "mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      },
      "numeric": {
        "rule": "All numeric-heavy cells MUST use tabular numbers.",
        "css": "font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'ss01' 1;"
      },
      "scale": {
        "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.02em]",
        "h2": "text-base md:text-lg font-medium tracking-[-0.01em]",
        "panel_title": "text-[12px] font-semibold tracking-[0.08em] uppercase",
        "section_label": "text-[11px] font-medium tracking-[0.06em] uppercase",
        "body": "text-[12px] leading-[1.35] font-normal",
        "table": "text-[11px] leading-[1.25] font-normal",
        "micro": "text-[10px] leading-[1.2] font-medium",
        "ticker": "text-[11px] leading-[1.1] font-medium"
      },
      "weights": {
        "default": 400,
        "medium": 500,
        "semibold": 600,
        "bold": 700
      }
    },

    "color": {
      "rule": "NO transparent backgrounds for panels. Use deep blacks with subtle alpha only for overlays/glow layers.",
      "palette_hex": {
        "black_0": "#000000",
        "black_1": "#050505",
        "black_2": "#0A0A0A",
        "black_3": "#0F1012",
        "black_panel": "#0B0C0E",
        "black_panel_2": "#0E1013",

        "ink_0": "#EAF2F7",
        "ink_1": "#C9D6E2",
        "ink_2": "#9FB0C0",
        "ink_3": "#6F8193",

        "cyan_0": "#BFF4FF",
        "cyan_1": "#66E6FF",
        "cyan_2": "#00D4FF",
        "cyan_3": "#00A9CC",
        "cyan_dim": "#0B3A46",

        "status_ok": "#2EF2C2",
        "status_stale": "#FFCC66",
        "status_error": "#FF4D6D",
        "status_info": "#66E6FF",

        "risk_low": "#66E6FF",
        "risk_med": "#FFCC66",
        "risk_high": "#FF7A45",
        "risk_extreme": "#FF2E63",

        "map_arc": "#00D4FF",
        "map_marker": "#66E6FF",
        "map_hot": "#FF4D6D",

        "focus_ring": "#00D4FF"
      },
      "hsl_css_vars_shadcn": {
        "instruction": "Replace /app/frontend/src/index.css :root and .dark tokens with these HSL values. Keep Tailwind + shadcn usage.",
        "vars": {
          "--background": "0 0% 0%",
          "--foreground": "205 35% 95%",
          "--card": "220 18% 5%",
          "--card-foreground": "205 35% 95%",
          "--popover": "220 18% 5%",
          "--popover-foreground": "205 35% 95%",
          "--primary": "191 100% 50%",
          "--primary-foreground": "0 0% 0%",
          "--secondary": "220 14% 9%",
          "--secondary-foreground": "205 35% 95%",
          "--muted": "220 14% 9%",
          "--muted-foreground": "210 18% 70%",
          "--accent": "220 14% 9%",
          "--accent-foreground": "191 100% 50%",
          "--destructive": "350 100% 65%",
          "--destructive-foreground": "0 0% 0%",
          "--border": "220 14% 12%",
          "--input": "220 14% 12%",
          "--ring": "191 100% 50%",
          "--radius": "0.75rem"
        }
      },
      "gradients": {
        "rule": "Gradients are allowed ONLY for small identity marks (triangle icon) and very limited hero/header accents (<20% viewport).",
        "triangle_identity": "linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)",
        "header_sheen": "linear-gradient(90deg, rgba(0,212,255,0.14) 0%, rgba(0,212,255,0.00) 55%)",
        "under_glow": "radial-gradient(60% 60% at 50% 0%, rgba(0,212,255,0.18) 0%, rgba(0,0,0,0) 70%)"
      }
    },

    "spacing": {
      "density_rule": "Bloomberg-grade compactness: default gaps 8–12px, internal padding 10–14px, table row height 24–28px.",
      "tokens_px": {
        "s1": 4,
        "s2": 8,
        "s3": 12,
        "s4": 16,
        "s5": 20,
        "s6": 24
      }
    },

    "radius": {
      "panel": "rounded-xl",
      "chip": "rounded-full",
      "input": "rounded-md",
      "badge": "rounded-md"
    },

    "shadow_and_glow": {
      "panel_shadow": "0 10px 30px rgba(0,0,0,0.55)",
      "panel_inner": "inset 0 1px 0 rgba(255,255,255,0.04)",
      "cyan_underglow": "0 0 0 1px rgba(0,212,255,0.18), 0 0 24px rgba(0,212,255,0.10)",
      "focus": "0 0 0 2px rgba(0,212,255,0.35)"
    },

    "motion": {
      "timings_ms": {
        "instant": 90,
        "fast": 140,
        "base": 200,
        "slow": 320,
        "panel_enter": 220,
        "ticker_scroll": 18000
      },
      "easing": {
        "standard": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in": "cubic-bezier(0.7, 0, 0.84, 0)"
      },
      "rules": [
        "No garish bounces. Use subtle opacity + translateY(4px) entrances.",
        "Hover states: small luminance shift + border brighten; avoid scaling whole panels.",
        "Drag interactions: cursor changes + shadow intensifies while dragging.",
        "Respect prefers-reduced-motion: disable ticker animation + globe auto-rotate."
      ]
    }
  },

  "layout": {
    "global": {
      "rule": "Single dense screen. No multi-page nav. Use a top bar + 3-column grid with a central map canvas.",
      "grid": {
        "desktop": "grid grid-cols-[320px_minmax(640px,1fr)_360px] gap-3",
        "xl": "grid-cols-[340px_minmax(760px,1fr)_380px]",
        "mobile_companion": "stack panels; map first; chat pill fixed bottom"
      },
      "top_bar": {
        "height": "h-12",
        "structure": "TITLE | RISK HEADLINE BADGE | VISUALS toggle | SWEEP TIMER | DATE | SOURCES X/Y | WHAT SIGNALS MEAN | HIGH ALERT badge",
        "classes": "sticky top-0 z-40 bg-[#050505] border-b border-white/5",
        "accent": "add a 1px cyan hairline under the active mode segment"
      }
    },

    "panel_system": {
      "panel_base_classes": "bg-[#0B0C0E] border border-white/6 shadow-[0_10px_30px_rgba(0,0,0,0.55)] rounded-xl",
      "panel_header_classes": "flex items-center justify-between px-3 py-2 border-b border-white/5",
      "panel_title_classes": "text-[11px] font-semibold tracking-[0.08em] uppercase text-[#66E6FF]",
      "panel_body_classes": "p-3",
      "panel_under_glow": "before:absolute before:inset-0 before:rounded-xl before:pointer-events-none before:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(0,212,255,0.14)_0%,rgba(0,0,0,0)_70%)] before:opacity-70",
      "glass_morphism_spec": {
        "rule": "Smoked glass look WITHOUT transparency: use deep black fills + subtle blur only on overlays (dialogs, hovercards).",
        "overlay": "bg-black/55 backdrop-blur-xl border border-white/10",
        "do_not": [
          "Do not set panel backgrounds to rgba(0,0,0,0.2)",
          "Do not rely on backdrop blur for readability"
        ]
      }
    }
  },

  "components": {
    "component_path": {
      "button": "/app/frontend/src/components/ui/button.jsx",
      "badge": "/app/frontend/src/components/ui/badge.jsx",
      "card": "/app/frontend/src/components/ui/card.jsx",
      "tabs": "/app/frontend/src/components/ui/tabs.jsx",
      "table": "/app/frontend/src/components/ui/table.jsx",
      "scroll_area": "/app/frontend/src/components/ui/scroll-area.jsx",
      "separator": "/app/frontend/src/components/ui/separator.jsx",
      "tooltip": "/app/frontend/src/components/ui/tooltip.jsx",
      "hover_card": "/app/frontend/src/components/ui/hover-card.jsx",
      "dialog": "/app/frontend/src/components/ui/dialog.jsx",
      "sheet": "/app/frontend/src/components/ui/sheet.jsx",
      "resizable": "/app/frontend/src/components/ui/resizable.jsx",
      "switch": "/app/frontend/src/components/ui/switch.jsx",
      "sonner_toast": "/app/frontend/src/components/ui/sonner.jsx",
      "skeleton": "/app/frontend/src/components/ui/skeleton.jsx",
      "progress": "/app/frontend/src/components/ui/progress.jsx"
    },

    "buttons": {
      "variants": {
        "primary": {
          "use": "Primary actions (Sweep Now, Correlate, Acknowledge Alert)",
          "classes": "bg-[#00D4FF] text-black hover:bg-[#66E6FF] focus-visible:ring-2 focus-visible:ring-[#00D4FF]/40",
          "shape": "rounded-md",
          "motion": "transition-colors duration-140"
        },
        "secondary": {
          "use": "Mode toggles, less critical actions",
          "classes": "bg-[#0E1013] text-[#EAF2F7] border border-white/10 hover:border-[#00D4FF]/35 hover:text-[#66E6FF]",
          "motion": "transition-colors duration-140"
        },
        "ghost": {
          "use": "Icon buttons in headers",
          "classes": "bg-transparent hover:bg-white/5 text-[#C9D6E2] hover:text-[#EAF2F7]",
          "motion": "transition-colors duration-140"
        }
      },
      "icon_button": {
        "size": "h-8 w-8",
        "icon": "lucide-react size-4",
        "hit_target": "min 40x40 on touch surfaces (mobile companion)"
      }
    },

    "badges": {
      "status": {
        "ok": "bg-[rgba(46,242,194,0.12)] text-[#2EF2C2] border border-[rgba(46,242,194,0.25)]",
        "stale": "bg-[rgba(255,204,102,0.12)] text-[#FFCC66] border border-[rgba(255,204,102,0.25)]",
        "error": "bg-[rgba(255,77,109,0.12)] text-[#FF4D6D] border border-[rgba(255,77,109,0.25)]"
      },
      "risk_headline": {
        "wartime_stagflation": {
          "classes": "bg-[#0B0C0E] text-[#FFCC66] border border-[#FFCC66]/25 shadow-[0_0_0_1px_rgba(255,204,102,0.12)]",
          "left_rule": "Add a 2px left border in amber for headline badges"
        },
        "high_alert": {
          "classes": "bg-[rgba(255,46,99,0.10)] text-[#FF2E63] border border-[rgba(255,46,99,0.28)]",
          "motion": "subtle pulse via opacity (not scale)"
        }
      }
    },

    "tables_and_metrics": {
      "table_rules": [
        "Use shadcn Table; keep row height 26px; zebra via bg-white/2 on even rows.",
        "Numbers right-aligned; labels left-aligned.",
        "Use tabular nums + muted separators.",
        "Hover row: bg-white/4 + left cyan hairline."
      ],
      "hot_metric_chip": {
        "classes": "px-2 py-1 rounded-md bg-white/3 border border-white/8",
        "value": "text-[#EAF2F7] font-semibold",
        "label": "text-[#9FB0C0] text-[10px] uppercase tracking-[0.08em]"
      }
    },

    "ticker": {
      "placement": "Top bar or just under top bar; single-line; scrolls left.",
      "style": "bg-[#050505] border-y border-white/5 text-[#C9D6E2]",
      "items": {
        "symbol": "text-[#EAF2F7]",
        "delta_pos": "text-[#2EF2C2]",
        "delta_neg": "text-[#FF4D6D]",
        "tag_translation": "Badge variant: outline, text-[#66E6FF], border-white/10"
      },
      "motion": "CSS keyframes marquee; pause on hover; disable on prefers-reduced-motion"
    },

    "spinners": {
      "aesthetic": {
        "rule": "Terminal-grade spinners: ASCII/Braille/dots/arrows. Avoid generic circular spinners.",
        "font": "Use mono font for spinner glyphs.",
        "color": "Default cyan_2 (#00D4FF); error uses status_error; stale uses status_stale."
      },
      "contextual_usage": [
        "Per-adapter sweep rows: tiny inline spinner (text-[10px])",
        "Map loading: center overlay with larger spinner + label",
        "Correlation engine: premium spinner + progress bar"
      ],
      "implementation_hint_js": {
        "frames_examples": {
          "dots": "['⠁','⠂','⠄','⡀','⢀','⠠','⠐','⠈']",
          "arrows": "['←','↖','↑','↗','→','↘','↓','↙']",
          "ascii": "['.  ','.. ','...',' ..','  .','   ']"
        },
        "timing": "setInterval 80–110ms; stop interval on unmount"
      }
    },

    "icons": {
      "library": "lucide-react",
      "rules": [
        "No emojis anywhere.",
        "Default icon size 14–16px in dense headers; 18px for primary actions.",
        "Icon color inherits text; active state uses cyan_2.",
        "Use consistent strokeWidth=1.75 for premium crispness."
      ]
    }
  },

  "map_and_globe": {
    "2d_map_leaflet": {
      "tiles": {
        "preferred": [
          {
            "name": "CartoDB Dark Matter",
            "url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            "attribution": "© OpenStreetMap © CARTO"
          },
          {
            "name": "Esri World Dark Gray Canvas",
            "url": "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
            "attribution": "Tiles © Esri"
          }
        ],
        "rule": "Use dark vector-like tiles; avoid satellite imagery for v1 (too noisy)."
      },
      "marker_rules": {
        "default": "cyan marker with subtle outer glow",
        "severity": {
          "low": "#66E6FF",
          "med": "#FFCC66",
          "high": "#FF7A45",
          "extreme": "#FF2E63"
        },
        "glow": "drop-shadow(0 0 10px rgba(0,212,255,0.35))",
        "cluster": "Use compact cluster badges; show count; border cyan"
      },
      "route_arcs": {
        "stroke": "#00D4FF",
        "strokeWidth": 2,
        "opacity": 0.75,
        "dash": "4 6 for inferred routes; solid for confirmed",
        "animation": "slow moving dash offset (only if motion allowed)"
      },
      "map_overlays": {
        "region_tabs": "shadcn Tabs; compact; placed top-left of map panel",
        "legend": "bottom-left; micro text; uses status colors"
      }
    },

    "3d_globe_react_globe_gl": {
      "style": {
        "globeColor": "#050505",
        "atmosphereColor": "#00D4FF",
        "atmosphereAltitude": 0.18,
        "arcColor": "#00D4FF",
        "pointColor": "#66E6FF"
      },
      "motion": {
        "autoRotate": "ON by default at very low speed; OFF when user interacts; OFF on prefers-reduced-motion"
      }
    }
  },

  "axe_chat_widget": {
    "behavior": {
      "draggable": true,
      "minimizable": true,
      "minimized_state": "intelligence pill",
      "default_position": "bottom-right with 16px inset",
      "z_index": 60
    },
    "visual": {
      "container": "bg-[#0B0C0E] border border-white/10 rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,0.65)]",
      "handle": "top drag handle strip with cyan hairline + grip icon",
      "header": "triangle identity at left + 'AXE Intelligence' label + status dot",
      "minimized_pill": "rounded-full bg-[#0B0C0E] border border-[#00D4FF]/25 shadow-[0_0_24px_rgba(0,212,255,0.10)]",
      "triangle_icon": {
        "rule": "Only place where cyan→purple gradient is allowed.",
        "gradient": "linear-gradient(135deg, #00D4FF 0%, #7C3AED 100%)"
      }
    },
    "message_styles": {
      "operator": "bg-white/4 border border-white/8 text-[#EAF2F7]",
      "axe": "bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)] text-[#EAF2F7]",
      "citations": "micro text; muted ink_2; clickable rows highlight cyan"
    },
    "inputs": {
      "input": "shadcn Input; bg-[#050505] border-white/10 focus:ring-[#00D4FF]/40",
      "send_button": "primary button with lucide Send icon"
    },
    "testing": {
      "required_testids": [
        "axe-chat-widget",
        "axe-chat-minimize-button",
        "axe-chat-send-button",
        "axe-chat-input",
        "axe-chat-pill"
      ]
    }
  },

  "pages": {
    "login": {
      "layout": "Split: left identity panel (triangle + tagline), right login card.",
      "background": "#000 with subtle noise + faint cyan sheen in top-left (<15% viewport)",
      "card": "bg-[#0B0C0E] border border-white/10 rounded-2xl shadow deep",
      "fields": [
        "Email",
        "Password"
      ],
      "cta": "Sign In (primary cyan)",
      "microcopy": "No auth for OSINT adapters is a product note; keep micro text muted",
      "required_testids": [
        "login-email-input",
        "login-password-input",
        "login-submit-button"
      ]
    },

    "terminal": {
      "rule": "Everything visible at once. Use ScrollArea inside panels, not page scroll where possible.",
      "left_column": [
        "Sensor Grid sidebar (counts)",
        "Risk Gauges",
        "Source Health + Sweep Delta"
      ],
      "center": [
        "World Map panel (2D/3D toggle)",
        "Macro + Markets panel",
        "Leverageable Ideas panel"
      ],
      "right_column": [
        "Cross-Source Signals (AI correlation)",
        "OSINT Stream (urgent)",
        "Signal Core hot metrics",
        "Nuclear Watch + Space Watch blocks"
      ],
      "required_testids_examples": [
        "topbar-visuals-toggle",
        "topbar-sweep-timer",
        "topbar-sources-count",
        "map-2d-container",
        "map-3d-container",
        "news-ticker",
        "risk-gauge-vix",
        "osint-stream-list",
        "cross-source-signals-panel"
      ]
    }
  },

  "accessibility": {
    "contrast": "All text must meet WCAG AA against deep blacks; avoid low-contrast gray-on-black.",
    "focus": "Use visible cyan focus ring; never remove outline without replacement.",
    "keyboard": "Terminal operators use keyboard: ensure tab order, shortcuts later.",
    "reduced_motion": "Disable marquee, arc dash animation, globe autorotate when prefers-reduced-motion is set."
  },

  "micro_interactions": {
    "hover": [
      "Panel header icons: hover bg white/5; icon turns cyan_1",
      "Rows: left cyan hairline appears + bg white/4",
      "Badges: tooltip on hover with explanation"
    ],
    "active": [
      "Buttons: press scale 0.98 (only button, not container)",
      "Toggles: cyan underline slides"
    ],
    "loading": [
      "Use skeletons for tables; use ASCII spinner for adapter sweeps",
      "Show Sweep Delta indicator as micro badge"
    ]
  },

  "image_urls": {
    "rule": "Prefer vector tiles + generated UI; avoid stock photos. No imagery needed for terminal UI.",
    "categories": [
      {
        "category": "noise_texture",
        "description": "Subtle grain overlay (CSS) instead of images.",
        "urls": []
      }
    ]
  },

  "libraries": {
    "required": [
      {
        "name": "lucide-react",
        "use": "All icons",
        "install": "npm i lucide-react"
      },
      {
        "name": "framer-motion",
        "use": "Panel entrances, subtle pulses, chat minimize animation",
        "install": "npm i framer-motion"
      },
      {
        "name": "react-leaflet + leaflet",
        "use": "2D map",
        "install": "npm i leaflet react-leaflet"
      },
      {
        "name": "react-globe.gl + three",
        "use": "3D globe toggle",
        "install": "npm i react-globe.gl three"
      }
    ],
    "optional": [
      {
        "name": "react-use-measure",
        "use": "Measure panel sizes for dense layouts",
        "install": "npm i react-use-measure"
      }
    ]
  },

  "instructions_to_main_agent": [
    "Update /app/frontend/src/index.css tokens to the provided HSL vars; default to dark theme (apply .dark on html/body).",
    "Remove any centered layout defaults from App.css; do not use .App { text-align:center }.",
    "Implement a reusable <Panel> wrapper that applies the panel_base_classes + header/body slots; keep dense padding.",
    "Use shadcn ScrollArea inside sidebars to keep the page from becoming a long scroll.",
    "All interactive + key informational elements MUST include stable data-testid attributes (kebab-case).",
    "Use lucide-react icons only; no emojis.",
    "Spinner components should be mono ASCII/Braille frames; do not use circular SVG spinners.",
    "Map: use CartoDB Dark Matter tiles; arcs/markers follow severity colors; keep glow subtle.",
    "Chat widget: draggable + minimizable; minimized pill persists; triangle gradient only in icon.",
    "Avoid gradients except identity triangle and small header sheen (<20% viewport)."
  ],

  "General UI UX Design Guidelines": [
    "- You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms",
    "- You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text",
    "- NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json",
    "",
    " **GRADIENT RESTRICTION RULE**",
    "NEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc",
    "NEVER use dark gradients for logo, testimonial, footer etc",
    "NEVER let gradients cover more than 20% of the viewport.",
    "NEVER apply gradients to text-heavy content or reading areas.",
    "NEVER use gradients on small UI elements (<100px width).",
    "NEVER stack multiple gradient layers in the same viewport.",
    "",
    "**ENFORCEMENT RULE:**",
    "    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors",
    "",
    "**How and where to use:**",
    "   • Section backgrounds (not content backgrounds)",
    "   • Hero section header content. Eg: dark to light to dark color",
    "   • Decorative overlays and accent elements only",
    "   • Hero section with 2-3 mild color",
    "   • Gradients creation can be done for any angle say horizontal, vertical or diagonal",
    "",
    "- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**",
    "",
    "</Font Guidelines>",
    "",
    "- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead.",
    "   ",
    "- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.",
    "",
    "- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.",
    "   ",
    "- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly",
    "    Eg: - if it implies playful/energetic, choose a colorful scheme",
    "           - if it implies monochrome/minimal, choose a black–white/neutral scheme",
    "",
    "**Component Reuse:**",
    "\t- Prioritize using pre-existing components from src/components/ui when applicable",
    "\t- Create new components that match the style and conventions of existing components when needed",
    "\t- Examine existing components to understand the project's component patterns before creating new ones",
    "",
    "**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component",
    "",
    "**Best Practices:**",
    "\t- Use Shadcn/UI as the primary component library for consistency and accessibility",
    "\t- Import path: ./components/[component-name]",
    "",
    "**Export Conventions:**",
    "\t- Components MUST use named exports (export const ComponentName = ...)",
    "\t- Pages MUST use default exports (export default function PageName() {...})",
    "",
    "**Toasts:**",
    "  - Use `sonner` for toasts\"",
    "  - Sonner component are located in `/app/src/components/ui/sonner.tsx`",
    "",
    "Use 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals."
  ]
}
