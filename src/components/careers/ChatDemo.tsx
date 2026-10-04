import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

/**
 * The careers hero's live demo: one player chat, played out the way the job
 * plays out. A player writes in, your reply types itself while the speed
 * meter climbs past the 45 wpm the role asks for, the player thanks you, and
 * the chat is marked resolved. Then it rests and plays again.
 *
 * Runs only while on screen; under prefers-reduced-motion it shows the
 * finished conversation and never animates.
 */

const FIRST = "my cash-out says pending for 3 hours. rent is due!!";
const REPLY =
  "I hear you, Marcus. It's in the review queue and your number is verified, so nothing is missing on your side. You'll get a message the second it's paid.";
const THANKS = "ok that helps. thank you!";

const TARGET_WPM = 62;
const METER_MAX = 80;
const REQUIRED_WPM = 45;
const CHARS_PER_SECOND = 42;

/** 0 empty · 1 first message · 2 typing the reply · 3 reply sent · 4 thanks · 5 resolved */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const EASE_OUT: [number, number, number, number] = [0.2, 0.7, 0.3, 1];

const bubbleMotion = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

export function ChatDemo() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(reduce ? 5 : 0);
  const [typed, setTyped] = useState(reduce ? REPLY.length : 0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (reduce) {
      setStage(5);
      setTyped(REPLY.length);
      return;
    }
    if (!inView) return;

    const timers: number[] = [];
    const after = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const typingMs = (REPLY.length / CHARS_PER_SECOND) * 1000;
    const typeFrom = 1900;

    setStage(0);
    setTyped(0);
    after(450, () => setStage(1));
    after(typeFrom, () => {
      setStage(2);
      let i = 0;
      const id = window.setInterval(() => {
        i += 1;
        setTyped(i);
        if (i >= REPLY.length) {
          window.clearInterval(id);
          setStage(3);
        }
      }, 1000 / CHARS_PER_SECOND);
      timers.push(id);
    });
    after(typeFrom + typingMs + 900, () => setStage(4));
    after(typeFrom + typingMs + 1800, () => setStage(5));
    after(typeFrom + typingMs + 9000, () => setRound((r) => r + 1));

    return () => {
      for (const t of timers) {
        window.clearTimeout(t);
        window.clearInterval(t);
      }
    };
  }, [inView, reduce, round]);

  const progress = REPLY.length ? typed / REPLY.length : 0;
  const wpm = stage >= 3 ? TARGET_WPM : Math.round(TARGET_WPM * progress);
  const meterWidth = `${Math.min(100, (wpm / METER_MAX) * 100)}%`;

  return (
    <div className="cr-demo" ref={rootRef}>
      <div className="cr-demo__halo" aria-hidden="true" />
      <figure className="cr-card" aria-label="An example of the job: a player chat, answered in writing" style={{ margin: 0 }}>
        <div className="cr-card__head">
          <span className="cr-avatar" aria-hidden="true">M</span>
          <span className="cr-card__who">
            <span className="cr-card__name">Marcus</span>
            <span className="cr-card__meta">Zulu Royal player</span>
          </span>
          <span className="cr-live">
            <span className="cr-dot" aria-hidden="true" />
            {/* one text item, so the chip's gap sits only between dot and words */}
            <span>
              Live<span className="cr-live__word">{" "}chat</span>
            </span>
          </span>
        </div>

        <div className="cr-card__body">
          <AnimatePresence>
            {stage >= 1 && (
              <motion.div key={`first-${round}`} className="cr-msg cr-msg--them" {...bubbleMotion}>
                <span className="cr-msg__who">Marcus</span>
                <p className="cr-bubble">{FIRST}</p>
              </motion.div>
            )}
            {stage >= 2 && (
              <motion.div key={`reply-${round}`} className="cr-msg cr-msg--you" {...bubbleMotion}>
                <span className="cr-msg__who">{stage === 2 ? "You · typing" : "You"}</span>
                <p className="cr-bubble">
                  {REPLY.slice(0, typed)}
                  {stage === 2 && <span className="cr-caret" aria-hidden="true" />}
                </p>
              </motion.div>
            )}
            {stage >= 4 && (
              <motion.div key={`thanks-${round}`} className="cr-msg cr-msg--them" {...bubbleMotion}>
                <span className="cr-msg__who">Marcus</span>
                <p className="cr-bubble">{THANKS}</p>
              </motion.div>
            )}
            {stage >= 5 && (
              <motion.span
                key={`resolved-${round}`}
                className="cr-resolved"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 420, damping: 22 } }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
              >
                <CheckCircle2 aria-hidden="true" />
                Resolved in 1m 48s
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="cr-meter" aria-hidden="true">
          <div className="cr-meter__row">
            <span>Your typing speed</span>
            <span className="cr-meter__val">
              {wpm}
              <small>wpm</small>
            </span>
          </div>
          <div className="cr-meter__bar">
            <div className="cr-meter__fill" style={{ width: meterWidth }} />
            <div className="cr-meter__mark" style={{ left: `${(REQUIRED_WPM / METER_MAX) * 100}%` }}>
              <span>{REQUIRED_WPM} needed</span>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}

export default ChatDemo;
