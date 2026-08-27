/**
 * OrbLoader — the standard full-screen loading state (route/lazy fallbacks).
 * Kept under its old name because every lazy route imports it; the orb it was
 * named for is retired. The visual lives in BrandLoader.
 */
import BrandLoader from "@/components/BrandLoader";

export function OrbLoader({ message }: { message?: string }) {
  return <BrandLoader message={message} />;
}

export default OrbLoader;
