import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import apiClient from '@/api/client';
import endpoints from '@/api/endpoints';
import { selectToken } from '@/preferences/preferenceSlice';
import type { RootState } from '@/store';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Raster types the preview route serves; SVG is deliberately not one. */
const PREVIEWABLE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

export function useAttachmentPreview(
  attachmentId: string | undefined,
): string | undefined {
  const token = useSelector((state: RootState) => selectToken(state));
  const [url, setUrl] = useState<string | undefined>(() =>
    attachmentId ? cache.get(attachmentId) : undefined,
  );

  useEffect(() => {
    if (!attachmentId) {
      setUrl(undefined);
      return;
    }
    const cached = cache.get(attachmentId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    setUrl(undefined);

    let request = pending.get(attachmentId);
    if (!request) {
      request = apiClient
        .get(endpoints.USER.ATTACHMENT_PREVIEW(attachmentId), token)
        .then(async (response: Response) => {
          if (!response.ok) return null;
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          cache.set(attachmentId, objectUrl);
          return objectUrl;
        })
        .catch(() => null)
        .finally(() => {
          pending.delete(attachmentId);
        });
      pending.set(attachmentId, request);
    }

    request.then((objectUrl) => {
      if (!cancelled && objectUrl) setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentId, token]);

  return url;
}

export function isPreviewableImage(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return PREVIEWABLE_MIME_TYPES.has(normalized);
}
