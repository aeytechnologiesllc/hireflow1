import { useState, useEffect } from "react";

/**
 * Hook to detect virtual keyboard visibility on mobile devices.
 * Uses the Visual Viewport API to detect when the keyboard opens.
 */
export function useVirtualKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Only run on mobile devices with Visual Viewport API support
    if (typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;
    
    const handleResize = () => {
      // Keyboard is likely open if viewport height is significantly less than window height
      const heightDiff = window.innerHeight - viewport.height;
      const isOpen = heightDiff > 150; // Threshold for keyboard detection
      
      setIsKeyboardOpen(isOpen);
      setKeyboardHeight(isOpen ? heightDiff : 0);
    };

    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleResize);

    // Initial check
    handleResize();

    return () => {
      viewport.removeEventListener("resize", handleResize);
      viewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  return { isKeyboardOpen, keyboardHeight };
}
