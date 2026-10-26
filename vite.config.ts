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
/*
 * UI packages left to the screens that use them (the performance check,
 * 2026-10-11). They all sat in one 'vendor-ui' chunk that every page
 * downloaded first: 417 KB, mostly animation, every icon in the app, and
 * pickers, sliders and dialogs no first screen draws. Rollup now places each
 * with the screens that import it.
 */
const LEFT_TO_THEIR_SCREENS = new Set([
  'framer-motion', 'motion-dom', 'motion-utils',
  'lucide-react', 'cmdk', 'vaul',
  '@radix-ui/react-accordion', '@radix-ui/react-alert-dialog', '@radix-ui/react-aspect-ratio',
  '@radix-ui/react-avatar', '@radix-ui/react-checkbox', '@radix-ui/react-collapsible',
  '@radix-ui/react-context-menu', '@radix-ui/react-dialog', '@radix-ui/react-hover-card',
  '@radix-ui/react-label', '@radix-ui/react-menubar', '@radix-ui/react-navigation-menu',
  '@radix-ui/react-popover', '@radix-ui/react-progress', '@radix-ui/react-radio-group',
  '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-separator',
  '@radix-ui/react-slider', '@radix-ui/react-switch', '@radix-ui/react-tabs',
  '@radix-ui/react-toggle', '@radix-ui/react-toggle-group',
]);

const VENDOR_CHUNKS: Record<string, string[]> = {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    // What every screen's frame uses (the shell, toasts, tooltips, menus),
    // and the small shared pieces Radix and others are built on. Pinned here
    // so they never get pulled into a heavy chunk (see manualChunks below).
    'vendor-ui': [
      '@radix-ui/react-tooltip',
      '@radix-ui/react-toast',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'sonner',
      'tslib',
      'use-sync-external-store',
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
  // The dev server's dependency scan reads the app's one page, not every HTML
  // file in the repo: design/preview's mock-ups import packages the app does
  // not install ("three"), so the scan failed and every dependency was found
  // one page load at a time, which made a cold dev server too slow for the
  // dev-preview smoke test on a busy machine (2026-10-26). Dev only; the build
  // is unchanged.
  optimizeDeps: {
    entries: ["index.html"],
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Fold chunks under ~10 KB into a neighbour that loads with them: the
        // owner's dashboard was 89 files, many of them a few hundred bytes,
        // each one more round trip on a phone (the performance check,
        // 2026-10-11).
        experimentalMinChunkSize: 10_000,
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
          // The PDF worker setup imports react-pdf: in a small chunk of its own,
          // the size rule folded it with an icon the sign-up pages share, and
          // both sign-ups then fetched the whole PDF and charts code before
          // showing the form (the Phase 7 growth audit, 2026-10-25).
          if (id.includes("/src/lib/pdfWorker")) return "vendor-pdf";
          // The scenario packs carry every skills-check answer and grading
          // note. Left to the size rule they shared a chunk with the dialog
          // component, so the public job page downloaded them on every visit
          // (the Phase 7 product audit). Their own chunk loads only where the
          // builder, the interview guide or Ava's engine needs them.
          if (id.includes("/src/content/scenarioPacks/")) return "scenario-packs";
          const pkg = id.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
          if (!pkg) return undefined;
          for (const [chunk, pkgs] of Object.entries(VENDOR_CHUNKS)) if (pkgs.includes(pkg)) return chunk;
          if (LEFT_TO_THEIR_SCREENS.has(pkg)) return undefined;
          // Every other Radix piece, and what Radix and the rest are built on,
          // stays with the frame's UI so no heavy chunk (PDF, charts, editor)
          // claims it and drags itself into every first download.
          if (
            pkg.startsWith('@radix-ui/') ||
            pkg.startsWith('@floating-ui/') ||
            ['react-remove-scroll', 'react-remove-scroll-bar', 'react-style-singleton', 'use-callback-ref', 'use-sidecar', 'aria-hidden', 'detect-node-es', 'get-nonce'].includes(pkg)
          ) return 'vendor-ui';
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
