import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/*
 * Build settings stay private (2026-10-04).
 *
 * Vercel hands every build its own deployment details as VITE_VERCEL_*
 * variables: the commit message, its author, the repository, the deployment
 * id and more. Vite pastes all of its VITE_* settings into the public
 * JavaScript wherever code reads import.meta.env as one object, so anyone
 * could read the latest commit message on hireflownow.com. Drop the Vercel
 * details before Vite loads its settings (it loads them after this file
 * runs). Only the commit SHA is kept: crash reports tag their release with
 * it (src/lib/crashReporter.ts). Code reads each setting by name.
 *
 * Guarded by scripts/guards/build-settings-stay-private.mjs.
 */
const KEEP_VERCEL_SETTINGS = new Set(["VITE_VERCEL_GIT_COMMIT_SHA"]);
for (const key of Object.keys(process.env)) {
  if (key.startsWith("VITE_VERCEL_") && !KEEP_VERCEL_SETTINGS.has(key)) delete process.env[key];
}

// https://vitejs.dev/config/
const VENDOR_CHUNKS: Record<string, string[]> = {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-ui': [
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'lucide-react',
      'cmdk',
      'vaul',
      'sonner',
      'framer-motion',
    ],
    'vendor-supabase': ['@supabase/supabase-js', '@tanstack/react-query'],
    'vendor-pdf': ['jspdf', 'pdf-lib', '@react-pdf/renderer', 'react-pdf'],
    'vendor-stripe': ['@stripe/stripe-js', '@stripe/react-stripe-js'],
    'vendor-editor': [
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
    'vendor-charts': ['recharts'],
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Function form, not the object form: given the object, rollup packed
        // Vite's own on-demand page loader (vite/preload-helper) into
        // vendor-pdf, because react-pdf loads its worker on demand. Every page
        // then fetched 479 KB of PDF code just to get that 1 KB helper,
        // applicants on the careers page included (2026-10-09). Rollup's
        // commonjsHelpers (React itself needs them) went the same way into
        // vendor-charts, so both are pinned to vendor-react, which every
        // page loads anyway.
        manualChunks(id) {
          if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) return "vendor-react";
          const pkg = id.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
          if (!pkg) return undefined;
          for (const [chunk, pkgs] of Object.entries(VENDOR_CHUNKS)) if (pkgs.includes(pkg)) return chunk;
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
