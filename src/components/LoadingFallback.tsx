import { StaggeredBarsLoader } from './animations/StaggeredBarsLoader';

const LoadingFallback = () => {
  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center bg-[hsl(220,18%,10%)] text-white gap-6">
      <StaggeredBarsLoader size="lg" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
};

export default LoadingFallback;
