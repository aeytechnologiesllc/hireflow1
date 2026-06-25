/** Role-family question banks for the deterministic template fallback. */
import type { Family } from "./playbook";
import type { LegacyQuizItem } from "./types";

export interface QuestionBank {
  application: string[];
  quiz: LegacyQuizItem[];
  interview: string[];
  simulation: { title: string; prompt: string }[];
  shortlistWeights: string[];
}

const BANKS: Record<Family, QuestionBank> = {
  cash: {
    application: [
      "Which days and shifts can you work?",
      "Have you led a team or handled a till before?",
      "When could you start, and how will you get to work reliably?",
      "Why does this role interest you?",
    ],
    quiz: [
      { scenario: "The till is $15 short at close and two staff want to leave. What do you do?", good: "Reports honestly, finishes the close, and doesn't rush accountability." },
      { scenario: "A regular is upset their usual order was wrong during a rush. How do you handle it?", good: "Stays calm, apologizes, and fixes it without arguing." },
      { scenario: "Two staff call out before a busy Saturday. What's your first move?", good: "Assesses coverage, communicates with the team, and protects service." },
      { scenario: "You notice a coworker skipping hand-washing between tasks. What do you do?", good: "Speaks up kindly about standards without shaming." },
      { scenario: "A delivery is late right before the lunch rush. How do you adjust?", good: "Reprioritizes, communicates, and keeps the floor calm." },
      { scenario: "A customer asks for a discount you aren't sure you're allowed to give.", good: "Checks policy or asks a lead rather than guessing." },
      { scenario: "You're training someone new and the line is building.", good: "Balances coaching with keeping service moving." },
      { scenario: "End of shift: floors are done but the safe count isn't finished. Your ride is outside.", good: "Finishes the count properly — ownership over convenience." },
      { scenario: "You spot suspicious activity near the register during a quiet period.", good: "Stays alert and involves a manager appropriately." },
      { scenario: "A team member is consistently late and it's affecting morale.", good: "Addresses it directly and fairly, escalates if needed." },
      { scenario: "The espresso machine breaks mid-rush and backup options are limited.", good: "Communicates delays, offers alternatives, keeps customers informed." },
      { scenario: "You're asked to cut labor hours but maintain the same service level.", good: "Plans staffing realistically and flags what's not achievable." },
    ],
    interview: [
      "Tell me about a time you led a team through a tough shift.",
      "Walk me through how you handle cash responsibly.",
      "Describe a customer situation that required real patience.",
      "Tell me about a mistake you owned and fixed quickly.",
      "What does a great opening or close look like to you?",
      "How do you keep standards high when you're tired?",
      "Tell me about a time you had to give hard feedback.",
      "Why this place, and why now?",
    ],
    simulation: [
      { title: "Upset regular", prompt: "A regular is upset about a wrong order and a long wait. Calm them and fix it." },
      { title: "Till reconciliation", prompt: "Walk through how you'd reconcile the till when numbers don't match." },
    ],
    shortlistWeights: ["Reliability & attendance", "Cash-handling integrity", "Leadership under pressure", "Customer de-escalation", "Team communication"],
  },
  cleaner: {
    application: [
      "What days and hours can you work?",
      "Do you have reliable transport to every job site?",
      "What cleaning experience do you have?",
      "Can you provide references?",
    ],
    quiz: [
      { scenario: "You're running 20 minutes late to a client's home. What do you do?", good: "Contacts the client early and is honest about the delay." },
      { scenario: "You arrive and something valuable looks broken — you're not sure if it was you.", good: "Reports it immediately and documents what you found." },
      { scenario: "A client changes the scope mid-visit. How do you respond?", good: "Clarifies expectations and confirms before continuing." },
      { scenario: "You find a wallet in a couch cushion while cleaning.", good: "Secures it and reports it — trust and honesty." },
      { scenario: "You're working alone and feel unwell halfway through.", good: "Prioritizes safety and communicates with the owner." },
      { scenario: "A client asks you to use their personal cleaning products you're unfamiliar with.", good: "Asks for instructions and tests safely." },
    ],
    interview: [
      "Tell me about working unsupervised and staying reliable.",
      "How do you handle a client who's picky about details?",
      "Describe your standard for 'done right' in a private space.",
      "Tell me about a time you had to earn someone's trust.",
      "What would you do if you couldn't finish on time?",
    ],
    simulation: [{ title: "Deep-clean walkthrough", prompt: "Walk through how you'd deep-clean a space and what you'd flag to the owner." }],
    shortlistWeights: ["Reliability & punctuality", "Trust & honesty", "Attention to detail", "Communication", "Independent judgment"],
  },
  admin: {
    application: [
      "Which office tools are you comfortable with?",
      "Describe your scheduling or calendar experience.",
      "Are you comfortable handling confidential information?",
      "When could you start?",
    ],
    quiz: [
      { scenario: "Two executives are double-booked for the same slot. What do you do?", good: "Prioritizes, communicates quickly, and reschedules cleanly." },
      { scenario: "An urgent email arrives while you're on a deadline for another task.", good: "Triages without dropping quality on either." },
      { scenario: "You spot a document with the wrong person's name before it goes out.", good: "Catches the error and fixes it before sending." },
      { scenario: "A client calls upset about a missed appointment.", good: "Stays calm, apologizes, and offers a concrete fix." },
      { scenario: "You're asked to share a file but aren't sure who should see it.", good: "Checks confidentiality rules before sharing." },
      { scenario: "Your inbox has 40 unread messages after a day off.", good: "Prioritizes urgent items and works systematically." },
      { scenario: "A spreadsheet formula breaks right before a report is due.", good: "Troubleshoots or escalates early — doesn't hide it." },
      { scenario: "Someone asks you to 'just this once' skip a process.", good: "Follows procedure or escalates appropriately." },
    ],
    interview: [
      "Tell me how you juggle competing priorities.",
      "Describe handling sensitive information correctly.",
      "Walk me through fixing a scheduling mess.",
      "Tell me about a time you caught an error others missed.",
      "How do you communicate when you're underwater?",
      "Why office administration, and why here?",
    ],
    simulation: [{ title: "Double-booked client", prompt: "Draft a calm reply to a double-booked client and reschedule cleanly." }],
    shortlistWeights: ["Organization", "Discretion & confidentiality", "Written communication", "Judgment under pressure", "Tool proficiency"],
  },
  developer: {
    application: [
      "What's your core stack and years of experience?",
      "Link to a project you're proud of.",
      "What's your preferred work setup (on-site / hybrid / remote)?",
      "When could you start?",
    ],
    quiz: [
      { scenario: "A production bug only happens for one customer. How do you start debugging?", good: "Gathers evidence, reproduces, and isolates before guessing." },
      { scenario: "You're asked to ship a feature by Friday but see a security concern.", good: "Raises the risk and proposes a safe path." },
      { scenario: "A teammate's PR blocks yours and both are urgent.", good: "Communicates, coordinates merge order, unblocks the team." },
      { scenario: "You inherit messy code with no tests. What's your approach?", good: "Adds safety nets incrementally rather than big-bang rewrites." },
      { scenario: "Product wants a shortcut that will create tech debt.", good: "Explains tradeoffs and documents the decision." },
      { scenario: "An API you depend on is intermittently failing.", good: "Adds resilience, monitors, and communicates impact." },
      { scenario: "You disagree with a technical decision in a design doc.", good: "Raises concerns constructively with evidence." },
      { scenario: "A user reports data loss after your deploy.", good: "Stops the bleeding, rolls back or hotfixes, then postmortems." },
    ],
    interview: [
      "Walk me through a project and a hard technical call you made.",
      "Tell me about debugging something that stumped you.",
      "How do you communicate tradeoffs to non-technical stakeholders?",
      "Describe code review feedback you disagreed with.",
      "What does good teamwork look like on a dev team?",
      "Where do you want to grow technically in the next year?",
    ],
    simulation: [],
    shortlistWeights: ["Practical coding skill", "Debugging & judgment", "Communication", "Ownership", "Collaboration"],
  },
  general: {
    application: [
      "Which days and shifts can you work?",
      "What relevant experience do you have?",
      "When could you start?",
      "Why this role?",
    ],
    quiz: [
      { scenario: "You're behind on tasks and a customer needs help now. What do you do?", good: "Prioritizes the customer without abandoning standards." },
      { scenario: "A coworker is struggling during a busy period. How do you help?", good: "Jumps in appropriately without taking over harshly." },
      { scenario: "You make a mistake that affects a customer. What's your move?", good: "Owns it, fixes it, and tells the right person." },
      { scenario: "You're asked to do something you've never done before.", good: "Asks questions and learns rather than bluffing." },
      { scenario: "Two tasks are both marked urgent. How do you choose?", good: "Clarifies impact and communicates tradeoffs." },
      { scenario: "A customer is frustrated but it's not your fault.", good: "Stays professional and focuses on resolution." },
      { scenario: "You're tired at the end of a long shift but standards still matter.", good: "Maintains quality and finishes responsibilities." },
      { scenario: "You notice a safety or policy issue others are ignoring.", good: "Speaks up through the right channel." },
    ],
    interview: [
      "Tell me about your experience and what you're good at.",
      "Describe a tough day at work and how you handled it.",
      "Tell me about a time you went above expectations.",
      "How do you handle feedback?",
      "What does reliability mean to you?",
      "Why this job?",
    ],
    simulation: [{ title: "Tricky moment", prompt: "Walk through a common tricky situation for this role and how you'd handle it." }],
    shortlistWeights: ["Reliability", "Judgment under pressure", "Customer focus", "Teamwork", "Coachability"],
  },
};

export function bankForFamily(family: Family): QuestionBank {
  return BANKS[family];
}

export function bankForTitle(title: string): QuestionBank {
  const s = title.toLowerCase();
  if (/clean|janitor|housekeep/.test(s)) return BANKS.cleaner;
  if (/develop|engineer|programmer|software/.test(s)) return BANKS.developer;
  if (/admin|secretar|reception|office/.test(s)) return BANKS.admin;
  if (/barista|cashier|manager|server|retail|caf/.test(s)) return BANKS.cash;
  return BANKS.general;
}
