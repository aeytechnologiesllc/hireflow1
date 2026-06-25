import { useQuery } from "@tanstack/react-query";
import { detectSchemaMode } from "@/cockpit/data/showcaseSource";

/** Cached per session — showcase vs hireflow1 (`jobs` table). */
export function useSchemaMode() {
  return useQuery({
    queryKey: ["cockpit-schema-mode"],
    queryFn: detectSchemaMode,
    staleTime: Infinity,
  });
}
