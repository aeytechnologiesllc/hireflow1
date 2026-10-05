# The chat agent job's skills check (JOB-C84E85)

The 10 questions every applicant answers, same set, same order. They live in
`jobs.quiz_questions` (the row for the live job), with the answer keys in
`job_quiz_keys` under `__quiz_questions__`; this file is the source they were
written from, so the next rewrite starts here and not from a database dump.

Rewritten 2026-10-05 after the owner saw the first set: *"you just created all
your skill question based on Zelle and people that live in the Philippines may
not know about this. You need to make it so everybody who can answer the basic
questions, but it's still being challenging."* He chose one universal set over
AI-drafted questions per applicant (one set keeps every score comparable), and
approved this one: *"it still checks their communication and money handling
because some people struggle to understand money and we can weed them out."*

## The rules the set is written to

1. **Nothing to know in advance.** No Zelle, Venmo, Facebook or any US app, no
   Zulu product names. Every question carries the rule it tests ("cash-outs are
   reviewed in order, usually within 24 hours") and asks what you do with it. It
   measures whether they can apply a rule they were just told, which is the job.
2. **The right answer is never the longest option.** In the first set it was,
   in 8 of 10. `node -e` the lengths before shipping a change.
3. **Every wrong option is tempting.** Each is what a kind but untrained person
   says: promising a time, a refund, an unlock or a bonus we cannot give; or
   arguing with the player.
4. **Correct positions are spread** (3, 2, 1, 3, 0, 1, 3, 2, 1, 2): no position wins.
5. **Ids are fresh on every rewrite** (`zq*` became `zr*`). A saved attempt
   that names ids the quiz no longer has is dropped by the page and by
   `quizResumeFromReply`, so nobody resumes at "question 4" of a different test.

## Changing them

Update `jobs.quiz_questions` with `correct_answer` on every question; the
`strip_quiz_answer_keys` trigger moves the keys into `job_quiz_keys` and strips
them from the row. Delete the old ids' keys. Any applicant mid-quiz keeps their
old `assessment_sessions` row: mark it `superseded` / `staff_reset` so their
next visit opens attempt 2 on the new set.

## The set

```json
[
  {
    "id": "zr1",
    "type": "multiple_choice",
    "category": "payments",
    "time_limit_seconds": 75,
    "question": "A player writes: \"I paid $50 twenty minutes ago and my balance still shows $0!!!\" Here, a team member finds each payment by the name on the account it was sent from. What is the best first reply?",
    "options": [
      "So sorry about that! Payments sometimes take a while to show up here. Give it another hour or so and it should appear on its own.",
      "I'm sorry for the worry. To find it fast, please send me a screenshot of your banking app showing your login details.",
      "Thanks for letting me know. It looks like that payment didn't go through, so please send the $50 again.",
      "I'm sorry for the worry, I'll look for it now. What name is on the account you paid from, and the exact amount you sent?"
    ],
    "correct_answer": "I'm sorry for the worry, I'll look for it now. What name is on the account you paid from, and the exact amount you sent?"
  },
  {
    "id": "zr2",
    "type": "multiple_choice",
    "category": "money_rules",
    "time_limit_seconds": 60,
    "question": "Our rule: money a player buys arrives as \"entries\". Entries must be played first, and only \"winnings\" can be cashed out. A player has $30 in entries and $12 in winnings. How much can they cash out right now?",
    "options": [
      "$42",
      "$30",
      "$12",
      "$0"
    ],
    "correct_answer": "$12"
  },
  {
    "id": "zr3",
    "type": "multiple_choice",
    "category": "cash_outs",
    "time_limit_seconds": 75,
    "question": "A player's cash-out has been pending for 3 hours and they threaten to post about us online. Cash-outs are reviewed in order, usually within 24 hours, and you cannot speed one up. What is the best reply?",
    "options": [
      "I'm sorry for the wait, I completely understand. I've marked your cash-out as urgent, so it should be paid within the next hour.",
      "I understand the wait is frustrating. Yours is in the queue and reviewed in order, usually within 24 hours. I'll update you here as soon as it moves.",
      "I understand you're upset, but posting about us won't make it any faster. Please be patient and wait for the review to finish.",
      "Sorry for the wait, that sounds frustrating! It's probably a delay in our system. Cancel the cash-out and request it again, and it should be reviewed much sooner."
    ],
    "correct_answer": "I understand the wait is frustrating. Yours is in the queue and reviewed in order, usually within 24 hours. I'll update you here as soon as it moves."
  },
  {
    "id": "zr4",
    "type": "multiple_choice",
    "category": "money_rules",
    "time_limit_seconds": 75,
    "question": "A player bought a $100 package by mistake and has not played any of it. You cannot approve refunds yourself; a manager reviews unplayed purchases, usually within a day. What is the best reply?",
    "options": [
      "No problem at all, these things happen. I'll refund the $100 to you right now, it should show up in a few minutes.",
      "Sorry about that. All purchases are final once they're made, so there's nothing I can do, but you can still play the entries.",
      "I'm sorry about that, mistakes like this happen. I've sent it to a manager, who will approve your refund within a day, so you'll have your $100 back by tomorrow at the latest.",
      "I'm sorry about that. I can't approve refunds, but a manager reviews unplayed purchases, usually within a day. What was the amount, the time, and how did you pay?"
    ],
    "correct_answer": "I'm sorry about that. I can't approve refunds, but a manager reviews unplayed purchases, usually within a day. What was the amount, the time, and how did you pay?"
  },
  {
    "id": "zr5",
    "type": "multiple_choice",
    "category": "de_escalation",
    "time_limit_seconds": 75,
    "question": "A player writes: \"The game is rigged. I lost $200 tonight, give me my money back.\" Game results are random, support cannot change them, and money that has been played cannot be refunded. Which reply is right?",
    "options": [
      "I'm sorry tonight went badly. Results are random and nobody here can change them, and played money can't be refunded. I can show you how to set a spending limit if that helps.",
      "I understand, and I'm really sorry tonight went badly. I'll ask a manager about refunding part of it as a one-time favour, since it was a big loss.",
      "I hear you, but our games are tested and fair, so you didn't lose because of us. Money that has been played can't be refunded, sorry.",
      "I'm sorry tonight went badly, that's a lot to lose. Results are random, but I'll check your game history now, and if anything looks unusual I'll refund those losses to you today."
    ],
    "correct_answer": "I'm sorry tonight went badly. Results are random and nobody here can change them, and played money can't be refunded. I can show you how to set a spending limit if that helps."
  },
  {
    "id": "zr6",
    "type": "multiple_choice",
    "category": "accounts",
    "time_limit_seconds": 75,
    "question": "A player made a second account because they forgot their password, and now both accounts are locked. The rule is one account per person; locked accounts are reviewed by a manager, and you cannot unlock them. What do you do?",
    "options": [
      "Unlock the older account yourself, since forgetting a password is an honest mistake, and ask them to stop using the second one.",
      "Stay polite, explain it's one account per person, take the email or phone on both accounts, and pass it to a manager without promising an unlock.",
      "Explain the rule politely, and tell them both accounts are now closed for good, so they will need to make a new account with a new email.",
      "Stay polite, take the email or phone number on both accounts, pass it to a manager, and let them know the first account will be unlocked tonight."
    ],
    "correct_answer": "Stay polite, explain it's one account per person, take the email or phone on both accounts, and pass it to a manager without promising an unlock."
  },
  {
    "id": "zr7",
    "type": "multiple_choice",
    "category": "written_english",
    "time_limit_seconds": 60,
    "question": "Which message is the clearest and most professional?",
    "options": [
      "ok so ur cashout is pending which means its waiting, it will get reviewed soon dont worry",
      "Kindly be informed that your cash-out request is presently pending and shall be actioned in due course. We thank you for your patience and understanding.",
      "Your cash-out is pending. Pending means it is waiting for review. Please wait for the review to finish.",
      "Your cash-out is in the queue. Cash-outs are reviewed in order, usually within 24 hours, and I'll message you here as soon as yours is done."
    ],
    "correct_answer": "Your cash-out is in the queue. Cash-outs are reviewed in order, usually within 24 hours, and I'll message you here as soon as yours is done."
  },
  {
    "id": "zr8",
    "type": "multiple_choice",
    "category": "security",
    "time_limit_seconds": 60,
    "question": "A player says: \"To prove the payment is mine, I'll send you my online banking password.\" What do you do?",
    "options": [
      "Accept it just this once so you can check the payment quickly, then remind them to change their password straight afterwards.",
      "Ask them to send a screenshot of their banking login page instead, with the password covered up, so you can see the account name and check the payment.",
      "Tell them never to share a password, even with support, and ask instead for the name on the account they paid from, the amount and the time.",
      "Thank them for being careful, but ask for their card PIN instead, since a PIN is safer to share than a password."
    ],
    "correct_answer": "Tell them never to share a password, even with support, and ask instead for the name on the account they paid from, the amount and the time."
  },
  {
    "id": "zr9",
    "type": "multiple_choice",
    "category": "judgment",
    "time_limit_seconds": 60,
    "question": "You realise an answer you gave a player ten minutes ago was wrong. What is the best thing to do?",
    "options": [
      "Wait to see if the player brings it up, because correcting it now might confuse them.",
      "Correct it right away, briefly own the mistake, and give the right next step.",
      "Send the right answer, and explain that the mistake came from the system, not from you.",
      "Correct it right away with a long apology explaining in detail how the mistake happened."
    ],
    "correct_answer": "Correct it right away, briefly own the mistake, and give the right next step."
  },
  {
    "id": "zr10",
    "type": "multiple_choice",
    "category": "bonuses",
    "time_limit_seconds": 60,
    "question": "A player asks for a bonus \"because I'm a loyal customer.\" There is no promotion you can give them. What is the best reply?",
    "options": [
      "Sure, and thank you for sticking with us! I'll add a small bonus to your account this time as a thank-you.",
      "I'm sorry, but bonuses are only for new players, so I can't add one for you. Thank you for being with us though!",
      "I can't add a bonus myself, but here's what is running now, and I'll pass your feedback about loyalty rewards to the team.",
      "I can't add one for you today, but I really appreciate your loyalty. Message me again tomorrow and I'll see what I can do for you."
    ],
    "correct_answer": "I can't add a bonus myself, but here's what is running now, and I'll pass your feedback about loyalty rewards to the team."
  }
]
```
