import { StaggeredBarsLoader } from './animations/StaggeredBarsLoader';

const LoadingFallback = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
      <StaggeredBarsLoader size="lg" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
};

export default LoadingFallback;
