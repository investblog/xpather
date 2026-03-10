interface StoreInfo {
  url: string;
  icon: string;
  label: string;
}

const STORES: Record<string, StoreInfo | null> = {
  chrome: {
    url: '', // TBD after store submission
    icon: 'icons/chrome.svg',
    label: 'Chrome Web Store',
  },
  firefox: {
    url: '', // TBD after store submission
    icon: 'icons/mozilla.svg',
    label: 'Firefox Add-ons',
  },
  edge: {
    url: '', // TBD after store submission
    icon: 'icons/edge.svg',
    label: 'Edge Add-ons',
  },
  opera: null,
};

export function getStoreInfo(): StoreInfo | null {
  const browser = import.meta.env.BROWSER ?? 'chrome';
  const info = STORES[browser] ?? null;
  if (info && !info.url) return null;
  return info;
}
