import { createContext, useContext } from "react";

/**
 * How a step page hands over to "Continue on your computer" when the server
 * refuses one of its calls with `computer_required`
 * (docs/COMPUTER-ONLY-TESTS.md). CandidateStepGate provides it: the call
 * swaps the whole step page out for the screen, so every hook the page
 * started (the record's heartbeat, the integrity listeners, a timer) stops
 * with it. Answers false outside the gate, and the page shows its own error.
 */
export type ShowContinueOnComputer = (deviceKind?: "phone" | "tablet" | null) => boolean;

export const ContinueOnComputerContext = createContext<ShowContinueOnComputer | null>(null);

const outsideTheGate: ShowContinueOnComputer = () => false;

export function useShowContinueOnComputer(): ShowContinueOnComputer {
  return useContext(ContinueOnComputerContext) ?? outsideTheGate;
}

/**
 * Set by CandidateStepGate the moment it swaps the step page out for "Continue
 * on your computer" (the server refused a call), BEFORE the page unmounts.
 * useTestIntegrity reads it in its cleanup: a step page the server took away
 * was not left by the person, so no "left the test page" is recorded. Null
 * outside the gate.
 */
export const ComputerHandoverContext = createContext<{ readonly current: boolean } | null>(null);

export function useComputerHandover(): { readonly current: boolean } | null {
  return useContext(ComputerHandoverContext);
}
