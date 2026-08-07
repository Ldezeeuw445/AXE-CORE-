/**
 * NeuralMemorySystem — Terrain volumetric memory map (Home → Terrain).
 * Matches AXON Memory reference: denser mesh, AXE Core as tallest center peak,
 * real hub icons + counts, zoom into peak with sub-hub mountains around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, QuadraticBezierLine } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  Search, Send, Move, MousePointerClick, Mouse, ZoomIn, Crosshair, CornerUpLeft,
  RotateCw, Sparkles, Database, Link2, Clock, ShieldCheck, Lock, X,
  MessageSquare, Settings2, Zap, Lightbulb, BookOpen, FileText, Users, Brain,
  Activity, Layers,
} from 'lucide-react';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { loadGlobalMemories } from '@/infrastructure/persistence/globalMemoryService';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { axeBus, subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import './NeuralMemorySystem.css';

const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
const BG = '#000000';

/* Colors tuned to AXON reference: cyan/blue family + gold family */
const GLOBAL_CATS = {
  user_preference: { color: '#67E8F9', label: 'Preferences', Icon: Settings2 },
  conversation_context: { color: '#5CE1FF', label: 'Conversations', Icon: MessageSquare },
  system_event: { color: '#F0C14A', label: 'Events', Icon: Zap },
  agent_performance: { color: '#7DD3FC', label: 'Insights', Icon: Lightbulb },
  provider_performance: { color: '#E8C547', label: 'Resources', Icon: Database },
  specialist_match: { color: '#FBBF24', label: 'Specialists', Icon: Users },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

const RAG_COLOR = '#38BDF8';
const OBSIDIAN_COLOR = '#22D3EE';
const CORE_COLOR = '#5CE1FF';

export interface BrainLeaf {
  id: string;
  label: string;
  detail: string;
  href?: string;
}

export interface BrainHub {
  id: string;
  label: string;
  color: string;
  layer: 'global' | 'rag' | 'obsidian' | 'core';
  href?: string;
  leaves: BrainLeaf[];
  pos: [number, number, number];
  /** Real memory count driving peak height */
  memoryCount: number;
  iconKey: string;
}

interface MemEntry {
  id?: string;
  category: string;
  key: string;
  value: string;
}

interface StreamItem {
  id: string;
  ts: number;
  color: string;
  title: string;
  subtitle: string;
}

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── terrain geometry ───────────────────────────────────────────────────── */
