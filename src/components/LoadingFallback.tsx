import { LiquidBlobLoader } from './animations/LiquidBlobLoader';

const LoadingFallback = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
      <LiquidBlobLoader size={100} />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
};

export default LoadingFallback;
