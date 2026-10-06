/**
 * deviceGate.ts — the computer-only rule on the applicant's screen
 * (docs/COMPUTER-ONLY-TESTS.md): the start of an application works on a
 * phone, the tests that matter are taken on the computer the applicant
 * will work from.
 *
 * Two decisions, each made here once:
 *
 *   - WHICH STEPS: stepNeedsComputer. The job's first `equipment_check`
 *     step and every step after it; a job with no connection check gates
 *     its first typing test, chat practice, sales practice, written or
 *     voice interview, and every step after that. The application form and
 *     the skills check never. The same rule, in the same words, as the
 *     server's (`stepNeedsComputer` in supabase/functions/_shared/deviceKind.ts).
 *   - WHICH DEVICES: thisDeviceNeedsComputer. A phone or a tablet, by the
 *     connection check's own reading (`readDevice` / `deviceKindOf` in
 *     connectionTest.ts). Nothing here re-reads the user agent.
 *
 * CandidateStepGate asks both before a step page mounts, so on a phone no
 * hook of a gated step ever runs (no attempt opened, no integrity event, no
 * timer). The server refuses a gated call from a phone or tablet with a 400
 * `computer_required` (the backstop: iPadOS Safari reads as a Mac to the
 * server); isComputerRequired reads that refusal for the pages.
 *
 * Every gated call also carries the page's own reading in its body
 * (`deviceKind`, withDeviceKind): only the page sees the touch screen and
 * its size, so only the body catches a phone asking for the desktop site.
 *
 * Imports only connectionTest.ts (itself import-free), so plain Node loads
 * it for scripts/computer_only_client.test.mjs.
 */
import { readDevice, type DeviceKind, type DeviceReading, type DeviceSources } from "./connectionTest.ts";

// ============================================================================
// Which steps
// ============================================================================

/** The step that puts the rest of a job on a computer. */
export const CONNECTION_CHECK_TYPE = "equipment_check";

/** With no connection check, the first of these puts the rest on a computer. */
export const TESTS_THAT_MATTER: readonly string[] = Object.freeze([
  "typing_test",
  "chat_simulation",
  "sales_simulation",
  "chat_interview",
  "voice_interview",
]);

/** Never on a computer only, wherever a job puts them. */
const OPEN_ON_ANY_DEVICE: ReadonlySet<string> = new Set(["application", "quiz"]);

interface StepLike {
  id?: unknown;
  type?: unknown;
}

function stepsOf(journeySteps: readonly (StepLike | null | undefined)[] | null | undefined): Array<{ id: string; type: string }> {
  return (Array.isArray(journeySteps) ? journeySteps : []).filter(
    (s): s is { id: string; type: string } =>
      !!s && typeof s.id === "string" && s.id !== "" && typeof s.type === "string" && s.type !== "",
  );
}

/** Pure: the index of the step where the computer-only part begins, or -1 when the job has none. */
export function computerPartStartsAt(journeySteps: readonly (StepLike | null | undefined)[] | null | undefined): number {
  const steps = stepsOf(journeySteps);
  const check = steps.findIndex((s) => s.type === CONNECTION_CHECK_TYPE);
  if (check !== -1) return check;
  return steps.findIndex((s) => TESTS_THAT_MATTER.includes(s.type));
}

/**
 * Pure: whether the rule puts this step on a computer. `journeySteps` is the
 * job's journey in order (buildCandidateJourney); a step that is not in it
 * answers false, because CandidateStepGate has already refused a step id
 * the journey does not have before it asks.
 */
export function stepNeedsComputer(
  journeySteps: readonly (StepLike | null | undefined)[] | null | undefined,
  stepId: string | null | undefined,
): boolean {
  if (!stepId) return false;
  const steps = stepsOf(journeySteps);
  const at = steps.findIndex((s) => s.id === stepId);
  if (at === -1 || OPEN_ON_ANY_DEVICE.has(steps[at].type)) return false;
  const start = computerPartStartsAt(steps);
  return start !== -1 && at >= start;
}

// ============================================================================
// Which devices
// ============================================================================

/** Pure: a phone or a tablet takes the computer-only part on a computer. */
export function kindNeedsComputer(kind: string | null | undefined): kind is "phone" | "tablet" {
  return kind === "phone" || kind === "tablet";
}

// The reading, once per page load: the device does not change under a tab.
let readingPromise: Promise<DeviceReading> | null = null;
let knownKind: DeviceKind | null = null;

/** What a failed read falls back to: a computer, as the connection check does (the server is the backstop). */
function computerFallback(): DeviceReading {
  return {
    device: {
      os: null, osVersion: null, browser: null, browserVersion: null, screen: null, dpr: null, cores: null,
      memoryGb: null, touch: null, language: null, timezone: null, connectionType: null, model: null,
    },
    kind: "computer",
    network: null,
  };
}

/**
 * This device, read by the connection check's own reader. With no
 * `sources` it reads the browser once and every later call shares that
 * reading; a test hands in its own sources and nothing is kept.
 */
export function readThisDevice(sources?: DeviceSources): Promise<DeviceReading> {
  if (sources) return readDevice(sources).catch(computerFallback);
  if (!readingPromise) {
    readingPromise = readDevice()
      .catch(computerFallback)
      .then((reading) => {
        knownKind = reading.kind;
        return reading;
      });
  }
  return readingPromise;
}

/** Phone, tablet or computer: this device, per the one rule. */
export async function thisDeviceKind(sources?: DeviceSources): Promise<DeviceKind> {
  return (await readThisDevice(sources)).kind;
}

/** Is this device a phone or a tablet, which takes the computer-only part on a computer? */
export async function thisDeviceNeedsComputer(sources?: DeviceSources): Promise<boolean> {
  return kindNeedsComputer(await thisDeviceKind(sources));
}

/** This device's kind when it has been read already (CandidateStepGate reads it before a step page mounts), else null. */
export function knownDeviceKind(): DeviceKind | null {
  return knownKind;
}

/**
 * A request body with the page's own reading added as `deviceKind`, which
 * every gated function reads (the contract: either the headers or the body
 * saying phone or tablet decides). Unread yet: the body as it was, and the
 * server judges by the request's headers alone.
 */
export function withDeviceKind<T extends object>(body: T, kind: DeviceKind | null = knownKind): T & { deviceKind?: DeviceKind } {
  return kind ? { ...body, deviceKind: kind } : { ...body };
}

// ============================================================================
// The server's refusal
// ============================================================================

/** The code every gated function answers a phone or tablet with (HTTP 400). */
export const COMPUTER_REQUIRED_CODE = "computer_required";

/** Pure: is this reply the server saying "this part needs the computer"? */
export function isComputerRequired(status: number | null | undefined, body: unknown): boolean {
  if (status !== 400 || !body || typeof body !== "object" || Array.isArray(body)) return false;
  return (body as { code?: unknown }).code === COMPUTER_REQUIRED_CODE;
}

/** Pure: the device the refusal names (`deviceKind`), when it names a phone or a tablet. */
export function refusedDeviceKind(body: unknown): "phone" | "tablet" | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const kind = (body as { deviceKind?: unknown }).deviceKind;
  return kind === "phone" || kind === "tablet" ? kind : null;
}

/** Thrown by a page's request when the server answered `computer_required`, so its catch shows the screen instead of an error. */
export class ComputerRequiredError extends Error {
  deviceKind: "phone" | "tablet" | null;
  constructor(deviceKind: "phone" | "tablet" | null) {
    super("This part needs the computer you will work on.");
    this.name = "ComputerRequiredError";
    this.deviceKind = deviceKind;
  }
}

/** Throws ComputerRequiredError when `status` and `body` are that refusal; otherwise does nothing. */
export function throwIfComputerRequired(status: number | null | undefined, body: unknown): void {
  if (isComputerRequired(status, body)) throw new ComputerRequiredError(refusedDeviceKind(body));
}
