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

// Pulsing green underglow animation for premium buttons
export const pulsingGlow = {
  animate: {
    boxShadow: [
      "0 0 20px -5px hsla(160, 60%, 40%, 0.6)",
      "0 0 35px -5px hsla(160, 60%, 50%, 0.8)",
      "0 0 20px -5px hsla(160, 60%, 40%, 0.6)"
    ]
  },
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: [0.4, 0, 0.2, 1]
  } as Transition
};
