import type { ClipType, Props } from '@cutroom/core';
import { session, useEditor } from '../lib/store.ts';

export interface LibItem { type: ClipType; mediaId?: string; component?: string; props?: Props; name?: string }
export const DND_TYPE = 'application/x-cutroom-item';

export function addToTimeline(item: LibItem, start?: number, trackId?: string) {
  const st = useEditor.getState();
  const r = session().edit([{ op: 'addClip', ...item, start: Math.max(0, start ?? st.time), trackId }]);
  if (r?.[0]?.id) st.set({ selection: [r[0].id] });
  return r?.[0]?.id;
}
