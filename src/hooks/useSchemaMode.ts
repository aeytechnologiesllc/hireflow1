import { useQuery } from "@tanstack/react-query";
import { detectSchemaMode } from "@/cockpit/data/showcaseSource";

export function useSchemaMode() {
  return useQuery({
    queryKey: ["cockpit-schema-mode"],
    queryFn: detectSchemaMode,
    staleTime: Infinity,
  });
}
