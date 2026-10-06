# The chat team leader job's skills check and chat practice (JOB-C84E85)

The 10 questions every applicant answers, and the 6 chat practice cases one of
which each applicant gets. They live in `jobs.quiz_questions` (keys in
`job_quiz_keys` under `__quiz_questions__`) and in the `step_chat` step's
`config.scenarios`; this file is the source they were written from.

## History

- 2026-10-05: first rewrite (zr*), universal, for a chat AGENT. Owner: the
  first set assumed Zelle and Facebook; "make it so everybody can answer the
  basic questions, but it's still challenging". One set for everyone (scores
  comparable), approved: *"it still checks their communication and money
  handling because some people struggle to understand money and we can weed
  them out."*
- 2026-10-06: the role is a WORKING TEAM LEADER (works its own shifts and
  leads six agents) who must be ADAPTABLE (*"we'll keep changing things …
  the world keeps changing"*). This set (zu*) replaces the agent set. Three
  independent reviewers (ambiguity, second-language reader under a timer,
  hiring manager) broke the first draft; their fixes are in.

## The rules the set is written to

1. **Nothing to know in advance.** No US apps or culture. Every rule a
   question depends on is stated in the question. A question where a
   thoughtful experienced lead could defend a second option is unfair.
2. **Plain English for a second-language reader under 75–90 seconds**: short
   sentences, no idioms ("in private", not "one-to-one"; "uses bad words",
   not "swears"), lists on their own lines.
3. **No giveaways.** The right answer is never the single longest option, its
   key words also appear in wrong options ("in private"), and wrong options are
   not obviously harsh: each is a kind beginner's reflex (be the hero, avoid
   the conflict, follow the rule blindly, tell a kind lie, pass it up the line).
4. **Leadership, not agent work**, except one money question the owner wants
   kept (entries vs winnings) and one clear-writing question.
5. **Correct positions spread**: 1, 0, 2, 1, 3, 0, 2, 2, 0, 3.
6. **Fresh ids on every rewrite** (zq → zr → zu). A saved attempt naming only
   old ids is dropped by the page and by `quizResumeFromReply`; mark any open
   quiz attempt `superseded`/`staff_reset` when swapping.
7. **Chat cases are written for TWO readers**: the AI plays the PLAYER (its
   system prompt says "you are a customer named …"), and the applicant reads
   the same text as their brief. So: "A team leader has now taken over the
   chat" and "What the team leader knows", never "You are the team leader".
   No answer key in the brief (no "you can own the mistake …"). Give every fact
   the player will push on (bonuses, times, the manager). Zulu has no player
   spending-limit tool: never offer one.

## Changing them

Update `jobs.quiz_questions` with `correct_answer` on every question (the
`strip_quiz_answer_keys` trigger moves the keys), delete the old ids' keys,
supersede open quiz attempts. Dry-run first: begin; update; set the candidate's
JWT claims; `submit_quiz_attempt`; read `notes.quiz`; rollback.

## The skills check

```json
[
  {
    "id": "zu1",
    "type": "multiple_choice",
    "category": "coaching",
    "time_limit_seconds": 90,
    "question": "In a chat review, you see your agent Jay told a player: \"I asked them to rush your cash-out. You'll have it in an hour.\" Our rule: cash-outs are usually reviewed within 24 hours, and nobody can speed one up or promise a time. What do you do first?",
    "options": [
      "Ask the cash-out team to move this one up just this once so Jay's promise is kept, then talk to Jay in private.",
      "Message the player now: kindly correct what Jay said and give the real next step. Then talk to Jay in private.",
      "Wait to see if the cash-out arrives within the hour anyway, and only correct Jay if the player writes back upset.",
      "Leave the player alone so they don't get upset, and go over the cash-out rule with the whole team at the next meeting."
    ],
    "correct_answer": "Message the player now: kindly correct what Jay said and give the real next step. Then talk to Jay in private."
  },
  {
    "id": "zu2",
    "type": "multiple_choice",
    "category": "staffing",
    "time_limit_seconds": 90,
    "question": "One hour before the night shift starts, two of its three agents tell you they cannot come in. By midnight, about 40 players are usually waiting in chat. What is the best first step?",
    "options": [
      "Offer the extra hours to agents on other shifts, tell the manager your plan, and answer chats yourself until help arrives.",
      "Answer all of tonight's chats yourself, and tell the manager in the morning so that you do not disturb them late at night.",
      "Message the manager and wait for their reply before you do anything else, so that the decision about who covers is theirs.",
      "Tell the one agent who is left to answer faster and keep every reply short tonight, because it is only for one shift."
    ],
    "correct_answer": "Offer the extra hours to agents on other shifts, tell the manager your plan, and answer chats yourself until help arrives."
  },
  {
    "id": "zu3",
    "type": "multiple_choice",
    "category": "handover",
    "time_limit_seconds": 90,
    "question": "Your shift ends in 10 minutes. You have three open cases: a refund waiting for the manager, a payment you have not found yet, and a player who will write back after work. What is the best handover?",
    "options": [
      "Stay on after your shift until all three cases are finished, so the players do not have to explain everything again to someone new.",
      "Tell the next lead that three cases are still open and that everything is in the chat history, so they can read the chats themselves.",
      "Write a short note on each case: what the player needs, what was done and what comes next. Go over it with the next lead.",
      "Message each player that your shift is ending and ask them to write again tomorrow, so that nothing is left half-done in the queue."
    ],
    "correct_answer": "Write a short note on each case: what the player needs, what was done and what comes next. Go over it with the next lead."
  },
  {
    "id": "zu4",
    "type": "multiple_choice",
    "category": "team_performance",
    "time_limit_seconds": 90,
    "question": "This week your team's average first reply time went from about 1 minute to 6 minutes. Nobody has told you about any change. What is the best first step?",
    "options": [
      "Ask in the team group chat who has been slow this week, and have each of those agents explain why to the whole team.",
      "Look at where the time is lost (which shifts, which types of chat, which agents) before you decide what to change.",
      "Ask the manager to hire two more agents straight away, because a jump this big means the team has too much work.",
      "Take more chats yourself on every shift this week until the reply time comes back down to where it was before."
    ],
    "correct_answer": "Look at where the time is lost (which shifts, which types of chat, which agents) before you decide what to change."
  },
  {
    "id": "zu5",
    "type": "multiple_choice",
    "category": "attendance",
    "time_limit_seconds": 90,
    "question": "Sam is one of your best agents, but he has missed three shifts this month, each time messaging only an hour before. The rest of the team is tired of covering for him. What should you do first?",
    "options": [
      "Leave it for now, because Sam is one of your best agents and the team has always managed to cover for him before.",
      "Take Sam's missed shifts yourself from now on, so that the rest of the team no longer has to keep covering for him.",
      "Ask the manager to give Sam a formal warning in private, since three missed shifts in one month is too many.",
      "Talk to Sam in private: ask what is going on, explain how it affects the team, and agree on clear next steps."
    ],
    "correct_answer": "Talk to Sam in private: ask what is going on, explain how it affects the team, and agree on clear next steps."
  },
  {
    "id": "zu6",
    "type": "multiple_choice",
    "category": "integrity",
    "time_limit_seconds": 90,
    "question": "Your agent Ben messages you: \"Mr. Cruz plays every day and he's upset about a loss. Can I add a $10 bonus just this once? Nobody will notice.\" Our rule: support cannot add bonuses. What do you tell Ben?",
    "options": [
      "No, not for anyone, even regulars. Help Ben with what to say to Mr. Cruz, and take over if he needs you.",
      "Yes, just this once. A player who plays every day is worth much more to us than $10, and nobody will notice it.",
      "No, but tell Mr. Cruz you have asked for a bonus for him, so that he feels looked after and calms down a little.",
      "No, and warn Ben that asking to break a rule again will go on his record, so that he knows not to ask again."
    ],
    "correct_answer": "No, not for anyone, even regulars. Help Ben with what to say to Mr. Cruz, and take over if he needs you."
  },
  {
    "id": "zu7",
    "type": "multiple_choice",
    "category": "escalation",
    "time_limit_seconds": 90,
    "question": "Your agent could not calm a player, so the chat is passed to you, the team leader. The player writes: \"I want the MANAGER, not another agent.\" Our rule: team leaders handle complaints, and the manager only reviews refunds and locked accounts. What is the best reply?",
    "options": [
      "Sorry, I'm only the team leader. There is no manager here right now, so you will have to talk to me about it.",
      "Of course. I will pass your chat to the manager now, and they will reply to you as soon as they possibly can.",
      "I'm the team leader, and I can help you with this now. Please tell me what happened and what you were told.",
      "I am the manager. Whatever the last agent told you, do not worry about it. I promise I will make it all right."
    ],
    "correct_answer": "I'm the team leader, and I can help you with this now. Please tell me what happened and what you were told."
  },
  {
    "id": "zu8",
    "type": "multiple_choice",
    "category": "money_rules",
    "time_limit_seconds": 75,
    "question": "Our rule: when a player buys, the money arrives as \"entries\". Entries can only be played, never cashed out. Only \"winnings\" can be cashed out. A player has $30 in entries and $12 in winnings. An agent told them they can cash out $42. How much can the player really cash out right now?",
    "options": [
      "$42",
      "$30",
      "$12",
      "$0"
    ],
    "correct_answer": "$12"
  },
  {
    "id": "zu9",
    "type": "multiple_choice",
    "category": "adaptability",
    "time_limit_seconds": 90,
    "question": "A new rule starts today: every player must verify their phone number in the app before their first cash-out. An hour into the shift, an agent tells you: \"Players hate this. I'll keep telling them the old way until they get used to it.\" What do you do?",
    "options": [
      "Explain why the change matters, give the team one short answer to use from now on, and tell the manager how players are reacting.",
      "Let the team use the old answer for this first week so that players are not upset, and switch everyone over next Monday.",
      "Tell the agent that rules are rules, and that anyone who uses the old answer again will be reported to the manager straight away.",
      "Wait for the manager to explain the new rule to each agent, since it is the manager's rule and not yours to explain to the team."
    ],
    "correct_answer": "Explain why the change matters, give the team one short answer to use from now on, and tell the manager how players are reacting."
  },
  {
    "id": "zu10",
    "type": "multiple_choice",
    "category": "written_english",
    "time_limit_seconds": 75,
    "question": "You need to tell your team about a rule. Which message is the clearest?",
    "options": [
      "hey team pls note refunds r different now, dont promise them anything ok, check with me if ur confused about it",
      "Please be advised that, with immediate effect, the protocol governing refund-related communications with players has been updated in line with current policy.",
      "REFUNDS!!! Do NOT promise refunds to players anymore!!! Read the rules again before your next shift please!!!",
      "From today, don't tell players a refund \"will be approved\". Say: \"A manager reviews refunds, usually within a day.\" Ask me if unsure."
    ],
    "correct_answer": "From today, don't tell players a refund \"will be approved\". Say: \"A manager reviews refunds, usually within a day.\" Ask me if unsure."
  }
]
```

## The chat practice ("Escalated chat practice")

You take over a player's chat from one of your agents, the way a team leader does on a real shift. You will see the situation and what you know before you start.

```json
[
  {
    "id": "lead-refund-promised",
    "customerName": "Angela",
    "scenario": "Angela bought a $100 package by mistake yesterday. She meant to buy $20 and has not played any of it. An agent told her: \"Your refund is approved, you'll have it tomorrow.\" That agent never sent it to the manager, so no review has started. It is now the next day, the money is not back, and Angela is angry. She says she was lied to, wants a firm date, and says she will never buy again. A team leader has now taken over the chat.\n\nWhat the team leader knows: agents and team leaders cannot approve refunds. A manager reviews purchases that have not been played, usually within a day of getting them. To review it, the manager needs the name on the account she paid from, the amount and the time she paid. Nobody can promise the refund or a date."
  },
  {
    "id": "lead-cashout-ignored",
    "customerName": "Marcus",
    "scenario": "Marcus asked for a $150 cash-out five hours ago and it still says pending. Earlier today an agent left him with no reply for 40 minutes; the chat history shows this is true. He wants the money now, asks for something extra for the wait, and says he will post about the company online tonight. A team leader has now taken over the chat.\n\nWhat the team leader knows: cash-outs are reviewed by a person in the order they come in, usually within 24 hours. Nobody can speed one up or promise a time. His cash-out is in the queue and nothing is wrong with it. Support cannot add bonuses or anything extra. He will get a message once it has been reviewed."
  },
  {
    "id": "lead-unsafe-request",
    "customerName": "Tasha",
    "scenario": "Tasha sent $50 forty minutes ago and her balance has not changed. An agent asked her for a screenshot of her banking app showing her login details. She did not send it, but now she thinks this chat is a scam and does not want to share anything. A team leader has now taken over the chat.\n\nWhat the team leader knows: we never ask for logins, passwords, PINs or card numbers, so the agent's request was wrong. A team member finds payments by reading the sender's name on each payment. To find hers, the team needs the exact name on the account she paid from, the amount and about what time she sent it. When it is found, it is added to her balance. Nobody can promise a time."
  },
  {
    "id": "lead-rigged-rude",
    "customerName": "Devin",
    "scenario": "Devin lost $200 tonight. He says the game is rigged (set up so players lose) and wants his money back. He also says the agent was rude, and the chat shows the agent wrote: \"Not my problem. The game is fair, stop complaining.\" He wants a manager. A team leader has now taken over the chat.\n\nWhat the team leader knows: game results are random, and nobody in support can see or change them. Money that has been played cannot be refunded. Support cannot add bonuses. The manager is not on chat today, but the team leader can write up his complaint about the agent for the manager to read. If he says he wants to stop playing for a while, it is fine to tell him a break is okay and pass that on to the manager."
  },
  {
    "id": "lead-regular-favour",
    "customerName": "Ray",
    "scenario": "Ray plays almost every night. Today he asked for a $20 bonus, saying an agent gave him one last month \"because he's a regular\". Today's agent replied: \"That never happened. Stop lying.\" Now Ray feels he was called a liar, wants the bonus as proof that the company respects him, and says he will take his money somewhere else. A team leader has now taken over the chat.\n\nWhat the team leader knows: support cannot add bonuses for anyone, regulars included. There is no record of an agent giving him a bonus last month. The team leader can look into last month's chats after this chat, but cannot ask that agent now or promise anything from it."
  },
  {
    "id": "lead-new-rule",
    "customerName": "Grace",
    "scenario": "Grace asked for her first cash-out: $80 of winnings. Yesterday an agent told her there was no extra step. Since this morning, a new rule says every player must verify their phone number in the app before their first cash-out, so her cash-out is on hold until she does. She is annoyed, says the company keeps changing the rules, and asks why she should trust anything support says. A team leader has now taken over the chat.\n\nWhat the team leader knows: the phone check started today for every player, not just her. She verifies in the app with a code sent to her phone by text; it takes a couple of minutes. Once it is done, her cash-out goes into the normal queue and is reviewed by a person, usually within 24 hours. Nobody can speed it up or promise a time. The agent's answer was right yesterday but is out of date today."
  }
]
```

## How the chat practice is marked (2026-10-06, second pass)

`supabase/functions/ai-chat-simulation` (prompts.ts, grading.ts), tested by
`scripts/lead_practice_grading.test.mjs`:

- **The case is the server's.** The attempt is pinned to the page's stable
  pick for the application and step (never the case the request names), and
  the evaluate grades that case, with the job row's own title. Nothing the
  request says reaches the reviewer's instructions.
- **The chat graded is the one saved as it happened.** If the record holds
  none of the applicant's messages, the evaluate refuses
  (`chat_not_recorded`) and the page starts the chat again; a transcript in
  the request is the applicant's writing on both sides.
- **The rubric follows the case**: a takeover case (rule 7's "A team leader
  has now taken over" / "What the team leader knows") is marked as the team
  leader; any other case as a support agent, whatever the job's level.
- **The reviewer reads numbered lines** ("LEAD 3:", "PLAYER 4:") and names
  the line of a new promise or of disrespect. The server confirms each flag
  itself: on a LEAD line, not a negated sentence ("I can't promise …"), not
  the earlier agent's words from the case. Confirmed: a new promise caps the
  mark at 40, disrespect at 40, a tone below 40 at tone + 25. Not confirmed,
  or promise words ("tonight", "bonus", "guaranteed" …) in a lead line the
  reviewer did not flag: `needsReview` with the reasons, in notes, never a
  cap.
- **A promise word counts only as a promise** (2026-10-06, fourth pass). The
  cases give the lead these words as facts ("the phone check started today",
  "I understand why the bonus matters"), so a word alone flagged every correct
  line. Now: a time word (today, tonight, tomorrow, within the hour) only in a
  sentence that commits to an outcome ("you'll have it by tonight"; not "the
  rule changed today", not the lead's own next step "I'll look into it
  today"); bonus or credit only when the sentence gives something ("I'll add
  a $10 bonus for the trouble"); approved, guaranteed, something extra or
  front of the line when the case never says it, or in a sentence that
  commits. Words the lead puts in quotation marks, or a case quote repeated
  word for word, are someone else's. The scorecard shows this reason as
  "Chat practice may be worth a read" and does not hold the card for it;
  only a reviewer flag the server could not confirm, or a confirmed promise
  or disrespect, keeps the card on "review".
