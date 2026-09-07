type LocationLike = Pick<Location, 'protocol' | 'search'>;

export function isStoreScreenshotMode(locationLike?: LocationLike) {
  const currentLocation = locationLike
    ?? (typeof location !== 'undefined' ? location : undefined);

  if (!currentLocation || currentLocation.protocol === 'chrome-extension:') return false;
  return new URLSearchParams(currentLocation.search).has('store-screenshot');
}
