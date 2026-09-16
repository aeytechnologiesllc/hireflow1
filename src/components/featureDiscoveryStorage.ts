/**
 * Split out of FeatureDiscoveryTooltip.tsx (react-refresh/only-export-
 * components: that file should export only the FeatureDiscoveryTooltip
 * component). FeatureDiscoveryTooltip.tsx imports STORAGE_KEY_PREFIX back
 * for its own use, so the key stays defined in exactly one place.
 */
export const STORAGE_KEY_PREFIX = "feature_discovery_";

export function resetFeatureDiscovery(featureId: string) {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${featureId}`);
}

export function resetAllFeatureDiscoveries() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}
