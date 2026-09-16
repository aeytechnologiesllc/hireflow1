import type { AvaExpression } from "./AvaAvatar";

/**
 * Determine expression from voice hook state. Split out of AvaAvatar.tsx
 * (react-refresh/only-export-components: that file should export only the
 * AvaAvatar component) — this has no dependency on it beyond the type.
 */
export function useAvaExpression({
  isSpeaking,
  isListening,
  isProcessing,
  isConnected,
  justFinishedSpeaking,
}: {
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isConnected: boolean;
  justFinishedSpeaking?: boolean;
}): AvaExpression {
  // Encouraging expression briefly after user finishes speaking
  if (justFinishedSpeaking && isProcessing) {
    return "encouraging";
  }

  if (isSpeaking) {
    return "speaking";
  }

  if (isProcessing) {
    return "thinking";
  }

  if (isListening && isConnected) {
    return "listening";
  }

  return "neutral";
}
