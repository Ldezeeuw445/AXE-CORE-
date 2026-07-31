/**
 * toolBridge — map tool / agent outputs → sphere projections.
 * Application only; emits axe:sphere-project for the stage to render.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { parseProjectMarker, projectionFromResolved } from '@/application/sphere/sphereDirector';
import { resolveChartFromSeries } from '@/application/sphere/projectionResolvers/chartResolver';
import { resolveMapFromCoords } from '@/application/sphere/projectionResolvers/mapResolver';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

export type ToolBridgeInput = {
  tool?: string;
  text?: string;
  /** Pre-shaped series from DB tools */
  series?: { label: string; value: number }[];
  lat?: number;
  lng?: number;
  label?: string;
  title?: string;
};

/**
 * Try to derive a projection from tool output.
 * Returns null when nothing visualizable.
 */
export function projectionFromToolResult(input: ToolBridgeInput): ProjectionPayload | null {
  if (input.text) {
    const marked = parseProjectMarker(input.text);
    if (marked) return marked;
  }

  if (input.series && input.series.length) {
    return resolveChartFromSeries(input.series, {
      title: input.title || input.tool || 'Chart',
      text: input.text,
    });
  }

  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    return resolveMapFromCoords(input.lat, input.lng, input.label || input.title);
  }

  // CREW / FETCH long text → document surface
  const tool = (input.tool || '').toUpperCase();
  if ((tool === 'CREW' || tool === 'FETCH' || tool === 'SEARCH') && input.text && input.text.length > 80) {
    return projectionFromResolved({
      mode: 'document',
      title: input.title || tool || 'Result',
      subtitle: 'Tool output',
      text: input.text.slice(0, 24_000),
      source: 'tool',
    });
  }

  return null;
}

/** Emit to stage (Presentation listens). */
export function presentToolResult(input: ToolBridgeInput): boolean {
  const payload = projectionFromToolResult(input);
  if (!payload) return false;
  emitAxeEvent('axe:sphere-project', payload);
  return true;
}
