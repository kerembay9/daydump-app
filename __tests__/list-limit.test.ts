
let get: jest.Mock;
let GalleryService: typeof import('../src/services/galleryService').GalleryService;
const PAGES = 100; // a 100k library
const asset = (i: number) => ({ id: `a${i}`, uri: `file:///storage/emulated/0/DCIM/Camera/${i}.jpg`, filename: `${i}.jpg`, width: 4000, height: 3000, creationTime: 2e12 - i * 3_600_000, modificationTime: 0, duration: 0, mediaType: 'photo' });

beforeEach(() => {
  get = jest.fn(async ({ after }: { after?: string }) => {
    const p = after ? Number(after) : 0;
    return { assets: Array.from({ length: 1000 }, (_, i) => asset(p * 1000 + i)), hasNextPage: p + 1 < PAGES, endCursor: String(p + 1), totalCount: PAGES * 1000 };
  });
  jest.isolateModules(() => {
    jest.doMock('expo-media-library/legacy', () => ({ MediaType: { photo: 'photo' }, SortBy: { creationTime: 'creationTime' }, getAssetsAsync: get, getAlbumAsync: async () => null }));
    GalleryService = require('../src/services/galleryService').GalleryService;
  });
});

test('a limit stops listing once that many camera photos are in', async () => {
  const photos = await GalleryService.listLibraryPhotos(1280);
  expect(get).toHaveBeenCalledTimes(2);
  expect(photos.length).toBe(2000);
  expect(photos[0].id).toBe('a0'); // newest first
});

test('no limit lists the whole library', async () => {
  const photos = await GalleryService.listLibraryPhotos();
  expect(get).toHaveBeenCalledTimes(PAGES);
  expect(photos.length).toBe(PAGES * 1000);
});
