import { configureStore } from '@reduxjs/toolkit';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api/client', () => ({ default: api }));

import {
  isPreviewableImage,
  useAttachmentPreview,
} from './useAttachmentPreview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const makeStore = (token: string | null = 'tok') =>
  configureStore({
    reducer: { preference: (state = { token }) => state },
  });

describe('useAttachmentPreview', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let seen: string | undefined;

  const objectUrls = new Map<string, string>();
  const realCreateObjectURL = URL.createObjectURL.bind(URL);

  function Probe({ id }: { id: string | undefined }) {
    seen = useAttachmentPreview(id);
    return null;
  }

  const render = async (
    id: string | undefined,
    token: string | null = 'tok',
  ) => {
    const store = makeStore(token);
    if (!root) root = createRoot(container);
    await act(async () => {
      root!.render(
        <Provider store={store}>
          <Probe id={id} />
        </Provider>,
      );
    });
    await act(async () => {});
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    seen = undefined;
    api.get.mockReset();
    objectUrls.clear();
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:preview-${objectUrls.size}`;
      objectUrls.set(url, blob.type);
      return url;
    }) as unknown as typeof URL.createObjectURL;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
      root = null;
    }
    container.remove();
    vi.useRealTimers();
    URL.createObjectURL = realCreateObjectURL;
  });

  it('fetches authenticated bytes once and returns an object URL', async () => {
    api.get.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['bytes'], { type: 'image/png' })),
    });

    await render('att-1');
    expect(seen).toBe('blob:preview-0');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/attachment/att-1/preview',
      'tok',
    );
  });

  it('reuses the cached URL without refetching', async () => {
    api.get.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['bytes'], { type: 'image/png' })),
    });

    await render('att-2');
    const first = seen;
    await render('att-2');
    expect(seen).toBe(first);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('stays undefined when the preview endpoint refuses', async () => {
    api.get.mockResolvedValue({ ok: false });
    await render('att-9');
    expect(seen).toBeUndefined();
  });

  it('does not fetch without an attachment id', async () => {
    await render(undefined);
    expect(seen).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('isPreviewableImage', () => {
  it.each([
    ['image/png', true],
    ['image/jpeg', true],
    ['image/gif', true],
    ['image/webp', true],
    ['image/bmp', true],
    ['image/tiff', true],
    ['image/jpeg; charset=binary', true],
    ['image/svg+xml', false],
    ['application/pdf', false],
    [undefined, false],
  ])('classifies %s as %s', (mime, expected) => {
    expect(isPreviewableImage(mime)).toBe(expected);
  });
});
