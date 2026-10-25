import type { Variants, Transition } from "framer-motion";

// Shared animation variants for consistent page transitions

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } 
  }
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } 
  }
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.08,
      delayChildren: 0.1
    } 
  }
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
  }
};

// Motion-safe variants that respect reduced motion preference
export const noMotion: Variants = {
  hidden: {},
  visible: {}
};

export const getSafeStaggerContainer = (prefersReduced: boolean): Variants =>
  prefersReduced ? noMotion : staggerContainer;

export const getSafeStaggerItem = (prefersReduced: boolean): Variants =>
  prefersReduced ? noMotion : staggerItem;

export const getSafeFadeInUp = (prefersReduced: boolean): Variants =>
  prefersReduced ? noMotion : fadeInUp;

export const getSafeFadeIn = (prefersReduced: boolean): Variants =>
  prefersReduced ? noMotion : fadeIn;

