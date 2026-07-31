import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export function ImageProjection({ payload }: { payload: ProjectionPayload }) {
  if (!payload.mediaUrl) {
    return (
      <div className="h-full flex items-center justify-center text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
        No image data
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <img
          src={payload.mediaUrl}
          alt={payload.title}
          className="max-w-full max-h-full object-contain rounded-lg"
          style={{ boxShadow: '0 0 40px rgba(34,211,238,0.15)' }}
        />
      </div>
    </div>
  );
}
