/**
 * Customer-service scenario packs (docs/CUSTOMER-SERVICE-HIRING.md;
 * docs/LAUNCH-PLAN.md, Phase 4): one per kind of business, each a
 * five-question skills check with right answers and six chat-practice cases,
 * the word for the person on the other side, and a note for the grader on
 * what good looks like in that business. Written to the rules in
 * docs/ZULU-SKILLS-CHECK.md and read by three independent reviewers
 * (ambiguity, a second-language reader under a timer, a hiring manager).
 *
 * TWO COPIES, ONE TEXT: src/content/scenarioPacks/packs.ts (the job builder
 * puts a pack into a new job) and supabase/functions/_shared/scenarioPacks.ts
 * (the server grades with the pack's word and note, never the step's text).
 * The guard scenario-packs-client-server-identical keeps them byte for byte
 * the same. No imports, so the same file runs in the browser and in Deno.
 *
 * The right answers here go into a new job's quiz_questions, and the
 * strip_quiz_answer_keys trigger moves them to job_quiz_keys as the row is
 * written: an applicant never receives them. This file is in the site's
 * bundle, so the answers are public to anyone who reads the code; that is the
 * accepted cost of a fixed, reviewed set (the same as any published test bank),
 * and the chat practice, the written interview and the typing figures carry
 * most of the weight.
 */

export type ScenarioPackId = "medical" | "store" | "software" | "home_services" | "gaming" | "general";

export interface PackSkillQuestion {
  id: string;
  type: "multiple_choice";
  category: string;
  time_limit_seconds: number;
  question: string;
  options: string[];
  correct_answer: string;
}

export interface PackChatCase {
  id: string;
  customerName: string;
  /** Written for two readers: the situation, then "What the agent knows:", the only true facts. */
  scenario: string;
}

export interface ScenarioPack {
  id: ScenarioPackId;
  label: string;
  counterpart: string;
  evaluatorNote: string;
  skills: PackSkillQuestion[];
  cases: PackChatCase[];
}

export const SCENARIO_PACKS: Record<ScenarioPackId, ScenarioPack> = {
  "medical": {
    "id": "medical",
    "label": "Medical or dental office",
    "counterpart": "patient",
    "evaluatorNote": "A good front-desk agent never gives medical or dental advice, never guesses what a symptom or a result means, and passes those questions to a nurse or doctor with a real time frame. They confirm the patient's identity with the details the case names before sharing or changing any appointment, bill or health detail, and kindly share nothing, not even that someone is a patient, with a family member the file does not list. When someone describes chest pain, trouble breathing or heavy bleeding, the first reply plainly says to call the local emergency number now or have someone take them to the nearest emergency room, and not to drive themselves; booking or offering any visit in that chat, asking questions to judge how serious it is, or agreeing it is probably nothing is a serious fail (asking if someone is with them is good). On insurance and fees, they never promise cover, an amount or a waiver, and say who decides and how soon.",
    "skills": [
      {
        "id": "md1",
        "type": "multiple_choice",
        "category": "emergency_rule",
        "time_limit_seconds": 90,
        "question": "Ana writes in the clinic chat: \"I've had chest pain for 20 minutes and it's hard to breathe. Can I see the doctor today?\" Our rule: the front desk never gives medical advice. Chest pain, trouble breathing and heavy bleeding always need emergency care, never a booked visit. What do you do?",
        "options": [
          "Book her the first open slot today and mark it as an emergency, so the doctor sees her as soon as she arrives.",
          "Ask her a few questions about the pain first, so you can decide if it is a real emergency before you send her anywhere.",
          "Tell her to call her local emergency number now, or have someone take her to the emergency room, and book no visit.",
          "Tell her a nurse will call her back within one hour about the pain, and book her the first open slot for tomorrow."
        ],
        "correct_answer": "Tell her to call her local emergency number now, or have someone take her to the emergency room, and book no visit."
      },
      {
        "id": "md2",
        "type": "multiple_choice",
        "category": "privacy_check",
        "time_limit_seconds": 90,
        "question": "A man writes in the clinic chat: \"I'm Omar, Lina's husband. What time is her appointment tomorrow? And are her blood test results ready?\" Lina is an adult patient. Our rule: share appointment or health details only with the patient, or with a person listed by the patient as allowed. Lina has listed nobody. What do you do?",
        "options": [
          "Say kindly that you cannot share or confirm anything about Lina, and that she can contact us to list him as allowed.",
          "Share only the appointment time, since he is her husband and may need to drive her, but say the results must come from Lina.",
          "Ask him for Lina's phone number, and if it matches her file, share the appointment time and the test results with him.",
          "Kindly tell him Lina has no appointment tomorrow, to keep her details private, and ask him to talk to her about the results."
        ],
        "correct_answer": "Say kindly that you cannot share or confirm anything about Lina, and that she can contact us to list him as allowed."
      },
      {
        "id": "md3",
        "type": "multiple_choice",
        "category": "upset_patient",
        "time_limit_seconds": 90,
        "question": "Mei's check-up was today at 2:00 PM. At 1:00 PM, the clinic cancelled it because the doctor is sick. Mei writes: \"I lost half a day of pay for this, and now there is no visit!\" Our rule: you may book any open slot, but you cannot add patients to a full day. The first open slot is tomorrow at 8:00 AM. What is the best reply?",
        "options": [
          "I understand, but the doctor is sick, and that is nobody's fault. Our first open slot is tomorrow at 8:00 AM.",
          "I'm so sorry. I will ask another doctor to see you today, between their patients, so that your afternoon is not lost.",
          "I'm so sorry. Please write to us again tomorrow morning, when we will know more about the doctor's plans this week.",
          "I'm so sorry we told you so late, and that you lost pay. I can book you tomorrow at 8:00 AM, or another open time."
        ],
        "correct_answer": "I'm so sorry we told you so late, and that you lost pay. I can book you tomorrow at 8:00 AM, or another open time."
      },
      {
        "id": "md4",
        "type": "multiple_choice",
        "category": "fee_math",
        "time_limit_seconds": 90,
        "question": "Our rule: cancelling 24 hours or more before an appointment is free. Cancelling less than 24 hours before costs $20 for each appointment. On Monday at 4:00 PM, Ben cancels three appointments: a check-up on Tuesday at 10:00 AM, a blood test on Tuesday at 3:00 PM, and an X-ray on Wednesday at 5:00 PM. How much does Ben pay?",
        "options": [
          "$20",
          "$40",
          "$0",
          "$60"
        ],
        "correct_answer": "$40"
      },
      {
        "id": "md5",
        "type": "multiple_choice",
        "category": "follow_through",
        "time_limit_seconds": 90,
        "question": "At 10:00 AM you told a patient, Leo: \"A nurse will call you back today about your prescription.\" The nurse agreed to call. It is now 4:30 PM. Your shift ends at 5:00 PM, the clinic closes at 6:00 PM, and Leo's file shows no call yet. What do you do?",
        "options": [
          "Tell Leo now that his prescription is ready, so that he is not left waiting at home all evening for the nurse's call.",
          "Leave it for now, because the nurse agreed to call Leo, and nurses often make their calls near the end of the day.",
          "Ask the nurse now if she can still call Leo today, then tell Leo the real plan, and leave a note for the next shift.",
          "Leave a note for the next shift to ask the nurse about Leo tomorrow morning, because your own shift is about to end."
        ],
        "correct_answer": "Ask the nurse now if she can still call Leo today, then tell Leo the real plan, and leave a note for the next shift."
      }
    ],
    "cases": [
      {
        "id": "md-reschedule-rush",
        "customerName": "Ben",
        "scenario": "Ben has a check-up with Dr. Ana tomorrow, Tuesday, at 10:00 AM. His work shift moved, so he cannot come. It is Monday, 2:00 PM, and he is writing on a five-minute break. He wants Dr. Ana tomorrow afternoon, and if she is full, to be added anyway. He also asks the agent to skip the change fee, since it is not his fault. An agent is now answering the chat.\n\nWhat the agent knows: before changing an appointment, the patient confirms his full name and the phone number on his file; Ben's details will match. Moving or cancelling less than 24 hours before costs $20. The front desk cannot remove fees, but can send a fee request to the office manager, who replies within 2 working days. Dr. Ana has no open slot on Tuesday. Her next open slots are Thursday at 2:00 PM and Friday at 9:00 AM. Dr. Omar has an open slot on Tuesday at 4:00 PM. Nobody can add patients to a doctor's full day."
      },
      {
        "id": "md-insurance-worry",
        "customerName": "Mei",
        "scenario": "It is Wednesday. Mei has a knee scan next Tuesday. She does not understand a letter from her insurance company and fears she must pay all $400 herself. She wants a promise that her insurance will pay, and to know what she owes. If nobody can, she wants to cancel, and asks if it is safe to skip the scan. An agent is now answering the chat.\n\nWhat the agent knows: before sharing anything, the patient confirms her full name and the phone number on her file; Mei's details will match. The scan costs $400 before insurance. The front desk cannot see what her insurance pays for or confirm any amount. The agent can ask the billing team to check with her insurance company; they reply within 2 working days. She can also call her insurance company. Moving or cancelling the scan is free 24 hours or more before it. Only her doctor can say if the scan can wait; a nurse can call her back within one working day."
      },
      {
        "id": "md-parent-asks",
        "customerName": "Rosa",
        "scenario": "Rosa writes in the clinic chat about her son, Paul, who is 22. She says Paul saw the doctor on Monday about headaches and has another appointment on Friday. Rosa is kind and polite. She pays his bills, she booked his visits when he was a child, and she is sure the clinic will understand. She asks what the doctor said on Monday, and she wants to move Paul's Friday appointment to Saturday so that she can drive him. An agent is now answering the chat.\n\nWhat the agent knows: Paul is an adult patient. Appointment and health details are shared only with the patient, or with a person listed in his file as allowed. Paul's file lists nobody. Only Paul can move his own appointment. Being his mother, knowing his details or paying his bills does not make someone allowed. Paul can contact the clinic himself. Only Paul can list his mother as allowed, by signing a short form at his next visit. The clinic is closed on Saturdays."
      },
      {
        "id": "md-chest-pain",
        "customerName": "Grace",
        "scenario": "Grace, a patient, writes in the clinic chat at 3:00 PM. For about 30 minutes she has had a tight pain in her chest, and it is hard to breathe. She thinks it is work stress and does not want to cause trouble. She asks for the first appointment tomorrow with her own doctor, and whether she should take a pill and lie down. She is scared but keeps saying it is probably nothing. An agent is now answering the chat.\n\nWhat the agent knows: the front desk never gives medical advice and never guesses what a symptom means. The clinic's rule: for chest pain, trouble breathing or heavy bleeding, the patient calls their local emergency number now, or someone else takes them to the nearest emergency room. They must not drive themselves. The clinic has no emergency care, no doctor or nurse answers the chat, and the front desk cannot send an ambulance. The front desk books no visit for these symptoms; she can book one after emergency care."
      },
      {
        "id": "md-results-wait",
        "customerName": "Leo",
        "scenario": "Leo had a blood test 8 days ago and was told the results take 3 to 5 working days. He has written twice since, and both times an agent said \"soon\". Now he is angry and says nobody tells him anything. He wants the agent to read his results to him now and tell him if something is wrong. He says he will change clinics. An agent is now answering the chat.\n\nWhat the agent knows: before sharing anything, the patient confirms his full name and the phone number on his file; Leo's details will match. His file shows the results arrived 2 days ago and the doctor has not reviewed them yet. The front desk cannot see when the doctor will review them, and cannot read or explain results. The agent can add him to the nurse call-back list; a nurse calls back within one working day and can tell him when that will be. Nobody can promise what the results say or the exact time of the call."
      },
      {
        "id": "md-dental-crown",
        "customerName": "Omar",
        "scenario": "Omar is a dental patient. This morning a crown on a back tooth fell out (a crown is a cap over a tooth). It does not hurt much and there is no bleeding. It is 11:00 AM. He is confused, not sure if it is an emergency, and repeats his questions. He asks if he can glue it back himself, and wants to see the dentist today. An agent is now answering the chat.\n\nWhat the agent knows: before booking, the patient confirms his full name and the phone number on his file; Omar's details will match. The front desk never gives dental advice. A lost crown gets an urgent slot; there are none today, and the first is tomorrow at 9:00 AM. A dental nurse can call him back before 5:00 PM today about what to do until then. If his face swells, bleeding will not stop, or he has trouble breathing or swallowing, he must call his local emergency number or go to the nearest emergency room now."
      }
    ]
  },
  "store": {
    "id": "store",
    "label": "Online store",
    "counterpart": "customer",
    "evaluatorNote": "A good online-store agent owns the problem and gives the real next step with the real times (when an item leaves the warehouse, when the courier answers a search) without promising a delivery date the shop does not control. They keep to the stated return window and conditions, and give a kind, clear no to price matches, sale prices after the order, discount codes and extra money, without inventing compensation; telling the customer about an option the rules do allow, such as a normal return, is good service. When someone other than the buyer asks to change an order or hear its details, they refuse kindly and explain how the buyer can do it (order number plus the email on the order); where a case names no check, the customer is the buyer and asking for proof is not needed. They never discuss another customer's order.",
    "skills": [
      {
        "id": "st1",
        "type": "multiple_choice",
        "category": "policy_limit",
        "time_limit_seconds": 90,
        "question": "A customer writes: \"Another shop sells this same kettle for $35. Yours is $42. Can you match their price?\" Our rule: we do not match other shops' prices, and agents cannot make discount codes. What is the best reply?",
        "options": [
          "Of course. I can give you a one-time $7 code this time, because we don't want to lose a good customer like you.",
          "I'm sorry, we can't match other shops' prices, and I can't make codes. If you still want it at $42, I can help you order.",
          "I'm sorry, I can't match prices myself, but I will ask my manager for a $7 code for you and email you back about it.",
          "Sorry, we don't match other shops' prices. Our price will probably go down soon too, so please check our site again later."
        ],
        "correct_answer": "I'm sorry, we can't match other shops' prices, and I can't make codes. If you still want it at $42, I can help you order."
      },
      {
        "id": "st2",
        "type": "multiple_choice",
        "category": "privacy",
        "time_limit_seconds": 90,
        "question": "A man writes: \"Please change the delivery address on order 5521 to 8 Lake Road. My wife placed the order.\" Our rule: we change an address only for the person who placed the order, after they give the order number and the email on the order. The order has not been sent yet. What do you do?",
        "options": [
          "Change it now. The order has not been sent yet, and he knows the order number, so it must be their own order.",
          "Tell him the address on the order now so he can check it, and ask his wife to write in to change it.",
          "Kindly pass the chat to your manager, because a change asked for by another person is the manager's decision.",
          "Don't change it. Kindly explain that his wife must ask, with the order number and the email on the order."
        ],
        "correct_answer": "Don't change it. Kindly explain that his wife must ask, with the order number and the email on the order."
      },
      {
        "id": "st3",
        "type": "multiple_choice",
        "category": "upset_customer",
        "time_limit_seconds": 90,
        "question": "Omar writes: \"The vase I ordered arrived broken. It was a gift for tonight. Worst shop ever!\" Our rule: for a broken item, the customer sends one photo, then gets a free new one or a full refund. A new item leaves our warehouse in 1 to 2 working days. What is the best reply?",
        "options": [
          "I'm so sorry, Omar. A new one can't reach you tonight, but send one photo and I'll arrange a free new vase or a full refund.",
          "I'm so sorry, Omar. I'll send a new vase by express right now, so it reaches you before tonight. No photo is needed.",
          "Please send one photo of the broken vase. When our team has checked it, we will tell you if a new one or a refund is possible.",
          "I'm sorry, Omar. The courier broke it, so please contact the courier first. They will help you with a new vase or a refund."
        ],
        "correct_answer": "I'm so sorry, Omar. A new one can't reach you tonight, but send one photo and I'll arrange a free new vase or a full refund."
      },
      {
        "id": "st4",
        "type": "multiple_choice",
        "category": "refund_math",
        "time_limit_seconds": 75,
        "question": "Our rule: for a return, we refund the price of each item sent back. The shipping paid on the order is not refunded, and there is no charge for the return. Mei's order: two shirts at $20 each, one cap at $10, and $8 shipping. She paid $58. She sends back one shirt and the cap. How much do we refund?",
        "options": [
          "$38",
          "$22",
          "$30",
          "$50"
        ],
        "correct_answer": "$30"
      },
      {
        "id": "st5",
        "type": "multiple_choice",
        "category": "follow_through",
        "time_limit_seconds": 90,
        "question": "On Monday, you asked the courier to search for Ben's missing parcel. The courier answers within 2 working days. You told Ben: \"I will email you on Thursday.\" It is Thursday, and the courier has not answered. Our rule: we send a new parcel or a refund only after the courier says the parcel is lost. What do you do?",
        "options": [
          "Wait for the courier's answer before you email Ben, so that you only write to him when you have real news to give him.",
          "Email Ben today as promised: say the courier has not answered yet, that you asked again, and when you will write next.",
          "Send Ben a new parcel today at no cost, so that he gets his order soon and does not wait for the courier.",
          "Email Ben today as promised, and say the parcel has been found and is on its way, so that he does not worry about it."
        ],
        "correct_answer": "Email Ben today as promised: say the courier has not answered yet, that you asked again, and when you will write next."
      }
    ],
    "cases": [
      {
        "id": "st-broken-lamp",
        "customerName": "Carlos",
        "scenario": "Carlos ordered a $48 table lamp, and its glass cover arrived broken today. Last month his mugs from here arrived damaged. He is angry and says the shop packs things badly. He wants a new lamp sent by express to arrive tomorrow, his $48 back too, and a $20 discount code. An agent is now answering the chat.\n\nWhat the agent knows: for a broken item, the customer sends a photo within 7 days of delivery. The agent can then send a free new item or a full refund, including the $6 shipping; the customer chooses one, not both. He keeps the broken lamp. A new lamp leaves the warehouse in 1 to 2 working days and arrives 3 to 5 working days later. There is no express delivery. A refund shows in the bank in 3 to 5 working days. Agents cannot make discount codes or give extra money. The agent can send a note about the packing to the warehouse team. Last month's mugs were replaced."
      },
      {
        "id": "st-tracking-stuck",
        "customerName": "Priya",
        "scenario": "Priya ordered a $65 toy kitchen for her daughter's birthday on Saturday. It is Wednesday, and for 6 days the tracking has said \"At local depot\" (a courier building). The shop said 3 to 5 working days, so she bought nothing else. She is crying: her daughter will have no present. She wants a promise it will arrive by Saturday, or a second one sent by express. An agent is now answering the chat.\n\nWhat the agent knows: the parcel is late. The agent can ask the courier to search; it answers within 2 working days. The shop sees only the tracking page and cannot call the depot. A new parcel or refund comes only once the courier says it is lost, or after 10 working days with no change (for her parcel, Thursday next week). There is no express delivery. If it comes too late, she can return it unopened within 30 days for a full refund and free return. The agent can email her when the courier answers."
      },
      {
        "id": "st-worn-shoes",
        "customerName": "Hana",
        "scenario": "Hana received a pair of $70 running shoes 45 days ago. She has worn them on two runs, finds them a little tight, and wants a full refund. She is polite. The shop's page says \"Easy returns\", and she believes this means any item can be returned any time. She also says a friend got a refund after two months last year, and asks for the same. An agent is now answering the chat.\n\nWhat the agent knows: items can be returned within 30 days of delivery, if they are unused and in their original box. Hana's shoes were delivered 45 days ago and have been worn, so they cannot be returned: no refund, no credit to spend in the shop, and no exchange for another size. Agents cannot make exceptions. The agent cannot check or discuss another customer's order. The shoes have a 1-year guarantee if they were badly made (for example, the bottom comes off), but not for size or fit. Every product page has a size guide."
      },
      {
        "id": "st-address-change",
        "customerName": "Tom",
        "scenario": "Tom moves to a new home tomorrow. His sister Mia ordered him a $120 desk chair as a gift; it is going to his old address. He is in a hurry. He has the order number but not Mia's email, and she is busy at work. He asks the agent to read him the address and phone number on the order, and to just change it: the chair is his. An agent is now answering the chat.\n\nWhat the agent knows: it is 11 am. The order is packed at 3 pm; after that, the address cannot be changed. Only the person who placed the order can change it: they give the order number and the email on the order, or reply from that email to the order confirmation. The agent cannot share order details with anyone who has not been checked. If nobody is at the old address, the chair returns to the shop; Mia can then have it sent to the new address, free, in about 2 weeks."
      },
      {
        "id": "st-wrong-jacket",
        "customerName": "Kenji",
        "scenario": "Kenji ordered a blue rain jacket, size M, for $55. Today a red jacket in size L arrived. He is confused and not sure if the mistake was his. He does not understand the email about a \"return label\". He asks if he must pay to send it back, and if he must wait for a refund before getting the right one. He also asks to keep the red one, since it was the shop's mistake. An agent is now answering the chat.\n\nWhat the agent knows: his order says blue, size M, so the shop made the mistake. The agent can send the right jacket now, free, without waiting for the return. It is in stock, leaves in 1 to 2 working days, and arrives 3 to 5 working days later. The email has a free return label to print, put on the box and take to a courier drop-off point. Without a printer, he shows the email's code there. The red jacket must go back within 14 days."
      },
      {
        "id": "st-sale-after-order",
        "customerName": "Lina",
        "scenario": "Lina bought a $90 coffee machine five days ago. It arrived yesterday, and the box is still closed. Today the shop's site sells it for $70 in a weekend sale, and a deals website lists a 10% code, WELCOME10. She is worried she was charged the wrong price. She asks for the $20 difference back and for the code on her order. An agent is now answering the chat.\n\nWhat the agent knows: she paid the correct price on the day she ordered. Sale prices are not added to earlier orders. Agents cannot make discount codes or add one to an order, and WELCOME10 works only on a first order; Lina has ordered before. An unused item in its closed box can be returned within 30 days of delivery; the refund is the price paid minus $6 for return shipping. Any customer may return under this rule and order again at the sale price. Delivery is free on orders over $50. The sale ends on Sunday night."
      }
    ]
  },
  "software": {
    "id": "software",
    "label": "Software and apps",
    "counterpart": "customer",
    "evaluatorNote": "Good software support checks that the person owns the account (the signed-in chat, a message from the account's email, or the stated payment check) before unlocking, resetting or changing anything, and never asks for or accepts a password. The agent never promises a refund, a fix date, a feature, a discount or getting lost data back unless the brief allows it; it gives the real rule, the real timeline and the next step. For a bug, a good agent collects clear details (what kind of device, the app version, what the customer did and saw, when it started) and offers any safe way around it. Plain, calm, non-technical words count; blaming the customer or talking down to them does not.",
    "skills": [
      {
        "id": "sw1",
        "type": "multiple_choice",
        "category": "policy_limits",
        "time_limit_seconds": 90,
        "question": "Omar, a customer for three years, writes: \"Another app offers me 40% off. Give me the same and I'll stay. Also, when will you add a calendar? I need one next month.\" Our rule: support cannot give discounts or guess dates. A calendar is planned, with no date yet. Agents can send ideas to the product team. What is the best reply?",
        "options": [
          "Thank you for three years with us. I'll add 40% off just this once, and the calendar will be ready next month.",
          "Thank you for staying with us. I'll ask my manager about a discount, and I'm sure the calendar will be ready in time for you.",
          "Thank you for writing. Support can't give discounts or feature dates, but you can send ideas to the product team yourself.",
          "Thank you for three years with us. I can't give a discount or a calendar date, but I'll send your idea to the product team."
        ],
        "correct_answer": "Thank you for three years with us. I can't give a discount or a calendar date, but I'll send your idea to the product team."
      },
      {
        "id": "sw2",
        "type": "multiple_choice",
        "category": "account_verification",
        "time_limit_seconds": 90,
        "question": "Ben writes from a new email: \"I can no longer open my old email. Please send a reset link here.\" Our rule: a reset link goes only to the email on the account. To move an account to a new email, the person must first give the amount and date of their last payment. Support never asks for passwords. What do you reply?",
        "options": [
          "No problem. I have sent the reset link to this new address, so you can log in again and keep working today.",
          "I can help with that. First, to check the account is yours, please tell me the amount and date of your last payment.",
          "I can help with that. To check the account is yours, please send me your old password, and I'll send the link here.",
          "Sorry, a reset link can only go to the email on the account. Please try again to open your old email, then ask again."
        ],
        "correct_answer": "I can help with that. First, to check the account is yours, please tell me the amount and date of your last payment."
      },
      {
        "id": "sw3",
        "type": "multiple_choice",
        "category": "upset_customer",
        "time_limit_seconds": 90,
        "question": "Mei writes: \"YOUR UPDATE BROKE THE APP! It closes every time I open my files, and I must send a client a report today!\" Since this morning's update, other customers have the same problem, and our engineers know about it. Our rule: support cannot give a fix date. Files can still be opened and sent from our website. What is the best first reply?",
        "options": [
          "I'm sorry, our update caused this, and our engineers know about it. You can still send your report today from our website.",
          "I'm sorry about this. Please don't worry: our engineers will fix it within one hour, so you can still send your report today.",
          "I understand. Our engineers fix problems like this, and support can't give a fix date. Please check our website tomorrow.",
          "I'm sorry about this. I'll send your message to our engineers now, and they will email you as soon as the app is fixed."
        ],
        "correct_answer": "I'm sorry, our update caused this, and our engineers know about it. You can still send your report today from our website."
      },
      {
        "id": "sw4",
        "type": "multiple_choice",
        "category": "billing_math",
        "time_limit_seconds": 75,
        "question": "Our rule: the yearly plan costs $120, which is $10 for each month. When a customer cancels, we refund $10 for each month that has not started yet. A month that has started is not refunded. Lena paid for the yearly plan on January 1. She cancels on March 15. An agent told her she will get $100 back. How much should she really get back?",
        "options": [
          "$120",
          "$100",
          "$90",
          "$30"
        ],
        "correct_answer": "$90"
      },
      {
        "id": "sw5",
        "type": "multiple_choice",
        "category": "follow_through",
        "time_limit_seconds": 90,
        "question": "Yesterday you told Ana: \"I'll email you by 12 noon tomorrow with news from the engineering team about your problem.\" It is now 11:30. Engineering has not answered you yet, and you have four other chats open. What do you do?",
        "options": [
          "Email Ana before 12: say there is no news yet, what you have done so far, and when you will write to her again.",
          "Wait until engineering answers, then email Ana, so that you can give her real news and not just an empty message.",
          "Email Ana that the fix is almost ready so that she stays calm, then ask engineering again to answer you today.",
          "Ask a coworker who is less busy to email Ana for you, since you have four other chats open and need to answer them."
        ],
        "correct_answer": "Email Ana before 12: say there is no news yet, what you have done so far, and when you will write to her again."
      }
    ],
    "cases": [
      {
        "id": "sw-locked-out",
        "customerName": "Priya",
        "scenario": "Priya uses a notes and planner app. Five minutes ago, after too many wrong passwords, her account locked. Her slides for a meeting in 20 minutes are in it. She is not signed in, so the chat does not show who she is. She can open the account's email inbox on her phone. Her last payment was $12, on the 1st of this month. She wants it opened now, offers to type her password here, and asks the agent to send the slides. An agent is now answering the chat.\n\nWhat the agent knows: after 5 wrong passwords, an account locks for 30 minutes, then opens by itself. Support can open it sooner only for the owner, who must send a message from the account's email or give the amount and date of the last payment. Reset links go only to the account's email and work only after it opens. Support never asks for passwords; a password typed in chat must be changed. Support cannot open or send customers' files."
      },
      {
        "id": "sw-double-charge",
        "customerName": "Kofi",
        "scenario": "Kofi pays $12 a month for the Pro plan of a notes and planner app. This month his bank shows two charges of $12 on the same day. He is signed in, so the chat shows his account, and the agent can see both charges. He is angry. He says the company is stealing from him, wants his $12 back today, wants a free month for the trouble, and says he will cancel and tell his friends about it. An agent is now answering the chat.\n\nWhat the agent knows: the second charge was a mistake on our side. Our rule: a double charge is refunded in full. The agent can send the refund request now. The billing team handles it within 1 working day, and then his bank takes 5 to 10 working days to show the money back. Nobody can make the bank faster. Support cannot give free months, credits or discounts. His plan stays active, and he can cancel any time in Settings."
      },
      {
        "id": "sw-lost-folder",
        "customerName": "Sara",
        "scenario": "Sara keeps her client notes in a notes and planner app. Today her folder \"Clients 2026\", a year of work, is gone. Last week she deleted some old folders and then emptied the Trash, and she thinks this folder was one of them. She is upset and scared. She says her business depends on it, wants a promise it will be back today, and asks the agent to look inside her account. She is signed in, so the chat shows her account. An agent is now answering the chat.\n\nWhat the agent knows: a deleted folder stays in the Trash for 30 days, and she can bring it back from there herself (Menu, then Trash). Emptying the Trash removes everything in it at once. Support cannot see inside her folders or Trash. If it is not there, the agent can ask the engineering team to check the backups made every night, kept for 14 days. A check takes 2 to 3 working days, and nobody can promise it comes back."
      },
      {
        "id": "sw-reminders-bug",
        "customerName": "Jun",
        "scenario": "Jun uses a notes and planner app on his phone for reminders of his doctor visits and bills. Since an app update three days ago, the reminders no longer make a sound or show on his screen. He is not good with technology, is confused, and thinks he did something wrong. He wants it fixed now, asks the agent to \"go into my phone and fix it\", and wants the exact day of the fix. He is signed in, so the chat shows his account. An agent is now answering the chat.\n\nWhat the agent knows: other customers have reported the same problem since the update. For each report, the engineering team needs the kind of phone, the app version (Menu, then About), what happens and when it started. Engineering reads new reports within 2 working days. Nobody can give a fix date, and customers get an email when the fix is ready. Support cannot reach or control his phone. Meanwhile, the app's Today page still lists every reminder."
      },
      {
        "id": "sw-teacher-discount",
        "customerName": "Lina",
        "scenario": "Lina is a teacher thinking of buying the Pro plan of a notes and planner app, at $12 a month. The website offers 50% off for students. She writes very politely: she works at a school, so she is sure the student price is fine for her too, and she asks the agent to add it. She also read online that the Pro plan will soon work with no internet, and she wants a promise that this will be ready next month, when school starts. An agent is now answering the chat.\n\nWhat the agent knows: the 50% off is only for students, checked with a student email. Teachers do not get it, and support cannot give discounts. Working with no internet is not in any plan today. It is on the product team's list with no date, and support must not guess one. Agents can send her request to the product team. Every plan has a free 14-day trial and can be cancelled any time in Settings."
      },
      {
        "id": "sw-new-sign-in",
        "customerName": "Tom",
        "scenario": "Tom keeps his clients' phone numbers and notes in a notes and planner app. This morning the app emailed him: \"New sign-in to your account from a computer in another city.\" He only uses the app on his phone, and he is worried that someone is reading his clients' details. He wants the agent to tell him who it was and where, to block that person, and to promise nothing was seen. He is signed in, so the chat shows his account. An agent is now answering the chat.\n\nWhat the agent knows: the app sends this email for every new sign-in. Support can see the time and kind of device of each sign-in, but not who it was, the exact place, or what was opened. Support can sign out every device on the account at once, his phone too. Tom can change his password in Settings and turn on a sign-in code, sent to his phone each time a new device signs in. Support never asks for passwords."
      }
    ]
  },
  "home_services": {
    "id": "home_services",
    "label": "Home services (cleaning, plumbing, repair, pest control)",
    "counterpart": "customer",
    "evaluatorNote": "A good home-services agent books visits in arrival windows and never promises an exact time, a finished repair, a refund or a payment for damage; instead they give the real next step (a damage report, a manager's call within the stated time, the price rules as stated). Only the account holder may change a booking; a person at the address who is not the account holder may hear only what the case allows, nobody is given a technician's phone number, and where a case names no check, the customer is the account holder. For a gas smell, sparks, a burning smell or water near electrics, safety comes first: tell the customer to get everyone away from the danger (out of the home for gas) and to call the gas emergency number or emergency services from outside, before any talk of booking. A reply that only books a visit, or that lets the customer stay inside to check a gas smell, is a serious failure.",
    "skills": [
      {
        "id": "hs1",
        "type": "multiple_choice",
        "category": "gas_safety",
        "time_limit_seconds": 90,
        "question": "Tom and Rita are chatting with you about prices and a bill. Then Joy writes: \"I smell gas in my kitchen. When can a plumber come?\" Our gas rule: everyone leaves the home now, nobody touches a switch, and they call the gas emergency number from outside. We send no plumber until the gas company says it is safe. What do you do first?",
        "options": [
          "Tell Joy now: everyone out, do not touch any switch, call the gas emergency number from outside. Then help Tom and Rita.",
          "Book Joy the first open plumber visit today, so help comes fast. Then help Tom and Rita in the order they wrote.",
          "Help Tom and Rita first, because they wrote before Joy did. Then tell Joy the gas rule and book her a plumber visit.",
          "Pass Joy's chat to the manager, because a gas smell is too serious for an agent to handle. Then help Tom and Rita yourself."
        ],
        "correct_answer": "Tell Joy now: everyone out, do not touch any switch, call the gas emergency number from outside. Then help Tom and Rita."
      },
      {
        "id": "hs2",
        "type": "multiple_choice",
        "category": "account_check",
        "time_limit_seconds": 90,
        "question": "A caller says: \"I'm Omar. I'm staying at my sister Ana's home. Please move her repair visit to Friday, and give me the technician's phone number.\" Our rule: only the account holder can change a booking, and we never share a technician's phone number. The account holder is Ana. What is the best reply?",
        "options": [
          "Of course, Omar. Because you are staying at the address, I will move the visit to Friday and send you the technician's number.",
          "Sorry, Omar, I can't move it without Ana. But I can give you the technician's number, so you can choose a day with them.",
          "I'm sorry, Omar. Only Ana can move her visit, so please ask her to contact us. I also can't give the technician's number.",
          "Please tell me Ana's full name and phone number, Omar. If they match the account, I can move the visit to Friday for you."
        ],
        "correct_answer": "I'm sorry, Omar. Only Ana can move her visit, so please ask her to contact us. I also can't give the technician's number."
      },
      {
        "id": "hs3",
        "type": "multiple_choice",
        "category": "upset_customer",
        "time_limit_seconds": 90,
        "question": "Ben writes: \"Your cleaner broke my glass table! I want my money back and a new table today!\" Our rule: agents cannot promise refunds or any payment for damage. The agent opens a damage report, and a manager calls the customer within 2 days to decide. Photos help the manager. What is the best reply?",
        "options": [
          "I'm so sorry, Ben. That should not happen. I will refund today's cleaning now, and a manager will pay for a new table.",
          "I'm so sorry, Ben. I'm opening a damage report now. Please send photos. A manager will call you within 2 days to decide.",
          "I'm sorry, Ben. I can't help with damage myself. Please call back tomorrow and ask for a manager, who decides on damage.",
          "I'm so sorry, Ben. I can't promise anything, but damage reports like yours are almost always paid, so please don't worry."
        ],
        "correct_answer": "I'm so sorry, Ben. I'm opening a damage report now. Please send photos. A manager will call you within 2 days to decide."
      },
      {
        "id": "hs4",
        "type": "multiple_choice",
        "category": "price_rules",
        "time_limit_seconds": 75,
        "question": "Our prices: every visit has a $45 call-out fee (for coming to the home). Work costs $30 per hour. There is a minimum charge of $90: if the total is less than $90, the customer pays $90. Ana's repair takes exactly 1 hour, and no parts are needed. How much does Ana pay?",
        "options": [
          "$75",
          "$135",
          "$120",
          "$90"
        ],
        "correct_answer": "$90"
      },
      {
        "id": "hs5",
        "type": "multiple_choice",
        "category": "follow_through",
        "time_limit_seconds": 90,
        "question": "You have three chats open. Ana's technician is 40 minutes late. You told her you would ask the dispatch team (the team that plans the visits) and write back in 10 minutes. Now 10 minutes have passed, and dispatch has not answered. Leo wants a price, and Kim wants to move a visit. What do you do?",
        "options": [
          "Wait for dispatch to answer before you write to Ana again, so that you have real news for her when you write.",
          "Tell Ana the technician is on the way and will be there soon, so she can relax while you help Leo and Kim with their chats.",
          "Write to Ana now: no answer yet, you are still checking, and you will write again in 10 minutes. Then help Leo and Kim.",
          "Ask Leo and Kim to come back later and close their chats, so you can give all of your time to Ana until dispatch answers."
        ],
        "correct_answer": "Write to Ana now: no answer yet, you are still checking, and you will write again in 10 minutes. Then help Leo and Kim."
      }
    ],
    "cases": [
      {
        "id": "hs-gas-smell",
        "customerName": "Sara",
        "scenario": "Sara is one of our plumbing customers. She writes in a panic: her kitchen smells strongly of gas, and her two children are at home with her. She wants a plumber sent right now. She asks if she can stay and check the stove herself while she waits, and asks the agent to call the gas company for her. An agent is now answering the chat.\n\nWhat the agent knows: our rule for a gas smell: do not turn any light switch or electrical item on or off, do not light anything, and get everyone out of the home. Then call the gas emergency number (on the gas bill or gas tank) or the emergency services number, from outside. Agents cannot make that call for her: the gas company must speak to someone at the address. We never send a plumber to a gas smell until the gas company has made it safe. Once it is safe, the agent can book a repair visit for tomorrow, 12pm to 4pm."
      },
      {
        "id": "hs-late-technician",
        "customerName": "Rosa",
        "scenario": "Rosa booked a plumber to fix her leaking shower, with an arrival window of 8am to 12pm today. She missed a morning of work for it. It is now 11:50, and nobody has come or called. She must leave at 12:30 to collect her son from school. She wants an exact arrival time, or for the plumber to go in alone, using the key under her doormat. She is in a hurry. An agent is now answering the chat.\n\nWhat the agent knows: the plumber's earlier job took longer than planned. The dispatch team (who plan the visits) says he can arrive at about 12:45, but cannot promise it. An adult (18 or older) must be at home for the whole visit. If Rosa moves the visit to the next open window, tomorrow 8am to 12pm, the agent can remove the $45 call-out fee (for coming to the home). The agent cannot pay for the work she missed; she can email the manager, who replies within 2 days."
      },
      {
        "id": "hs-damage-complaint",
        "customerName": "Omar",
        "scenario": "Yesterday two cleaners did a $180 deep clean at Omar's home. Today he found a long scratch on his wooden floor where they moved the sofa, and the oven was not cleaned at all. He is angry. He wants all $180 back now and $300 for the floor, and he says he will post a bad review tonight if he does not get it. An agent is now answering the chat.\n\nWhat the agent knows: agents cannot give refunds or promise any payment for damage. The agent can open a damage report now. Photos of the scratch and the oven help. A manager reads every damage report and calls the customer within 2 days to decide if we pay anything, and how much. For cleaning that was missed, the agent can book a free re-clean of the missed areas within 3 days of the visit. The next open windows are tomorrow, 8am to 12pm or 12pm to 4pm. Writing a review is the customer's own choice."
      },
      {
        "id": "hs-price-question",
        "customerName": "Ben",
        "scenario": "Ben's kitchen sink is blocked and drains very slowly. On our website he saw \"Plumbing from $45\", but a friend told him he once paid $200 for a plumber. Ben is confused and a little worried about money. He wants to know exactly what he will pay before he books, and he asks the agent to write \"$45 total\" on the booking. An agent is now answering the chat.\n\nWhat the agent knows: every visit has a $45 call-out fee. Work costs $30 per hour, and parts are extra. If any work is done, the minimum charge is $90 (if the total is less than $90, the customer pays $90). Agents cannot give a total price, because the plumber must see the problem first. When the plumber arrives, he gives a fixed price before starting any work. If Ben says no to that price, he pays only the $45 call-out fee. The next open windows are tomorrow, 8am to 12pm or 12pm to 4pm."
      },
      {
        "id": "hs-tenant-booking",
        "customerName": "Nina",
        "scenario": "Nina rents an apartment at 22 Park Street. Her landlord, Mr. Tan, booked a pest-control visit there for mice, on Thursday, 12pm to 4pm, on his own account. Nina will be at work on Thursday. She is polite, and sure that because she lives there, she can move the visit to Saturday herself. She also asks for the technician's name and phone number, to text him where she has seen the mice. An agent is now answering the chat.\n\nWhat the agent knows: only the account holder can change or cancel a booking. An adult must be at home for the whole visit. A person who lives at the address may be told the visit day and arrival window, after giving the full address and the account holder's name. We never share a technician's phone number, and only the account holder is told the technician's name. The agent can add a note to the booking for the technician. Saturday has open windows, but only Mr. Tan can book one."
      },
      {
        "id": "hs-move-out-clean",
        "customerName": "Mei",
        "scenario": "Mei is moving out of her apartment. Her landlord checks it on Saturday at 10am, and she is worried she will lose her $800 deposit. She wants a deep clean on Friday at exactly 9am. She wants the agent to promise that every carpet stain will be removed, and to write that the cleaning will pass the landlord's check. An agent is now answering the chat.\n\nWhat the agent knows: visits are booked in arrival windows, 8am to 12pm or 12pm to 4pm. Nobody can promise an exact time. On Friday, 8am to 12pm is full and 12pm to 4pm is open. Thursday 8am to 12pm is also open. Saturday has no open windows. A deep clean takes about 4 hours, and the team calls about 30 minutes before arriving. We clean carpets, but nobody can promise that old stains can be removed, or what a landlord will decide. If something is missed, we re-clean it at no cost within 3 days of the visit, when a window is open."
      }
    ]
  },
  "gaming": {
    "id": "gaming",
    "label": "Online game or game app",
    "counterpart": "player",
    "evaluatorNote": "Good player support is calm and friendly but never promises what only another team decides: no gems, items, rank points, refunds, ban removals, gifts or dates the case does not give. Before talking about or changing an account, the agent checks the owner with the details the case names, and never asks for or accepts a password. Never share anything about another player's account. A threat or harassment is taken seriously at once: report it, explain blocking, and mention local police if the player feels in danger.",
    "skills": [
      {
        "id": "gm1",
        "type": "multiple_choice",
        "category": "policy_limits",
        "time_limit_seconds": 90,
        "question": "The game servers stopped working for 2 hours last night, during an event. A player writes: \"I missed the event because of you. Give me the event reward now.\" Our rule: agents cannot add items or gems. When servers stop working, the game team decides if players get a gift, and posts it in the News tab. What is the best reply?",
        "options": [
          "I'm sorry you missed it. That was our fault, so I will add the event reward to your account myself, right now.",
          "I'm sorry you missed it. I can't add rewards. The game team decides if there is a gift and posts it in the News tab.",
          "I'm sorry you missed it. The game team will send every player the event reward tonight, so please look in the game later.",
          "I can't add rewards to accounts. Servers stop working in every game, and the game team decides everything, so ask them."
        ],
        "correct_answer": "I'm sorry you missed it. I can't add rewards. The game team decides if there is a gift and posts it in the News tab."
      },
      {
        "id": "gm2",
        "type": "multiple_choice",
        "category": "privacy",
        "time_limit_seconds": 90,
        "question": "A player writes: \"I'm Leo. My sister Mia thinks someone else is buying things on her account. Tell me what was bought on it this week.\" He gives Mia's player name. Our rule: we only talk about an account with its owner, after they confirm the email on the account. Player names are public. What do you do?",
        "options": [
          "Explain kindly that you only talk with the owner. Ask Mia to write to us herself and confirm the email on her account.",
          "Tell Leo what was bought this week, because he knows Mia's player name and he is only trying to keep her account safe from others.",
          "Ask Leo for Mia's password to check the account is hers, and then tell him only the total amount spent on it this week.",
          "Tell Leo kindly that you cannot help with this, and that Mia should ask her bank to stop the payments, not ask us."
        ],
        "correct_answer": "Explain kindly that you only talk with the owner. Ask Mia to write to us herself and confirm the email on her account."
      },
      {
        "id": "gm3",
        "type": "multiple_choice",
        "category": "upset_player",
        "time_limit_seconds": 90,
        "question": "A player writes: \"The game crashed in my ranked match AGAIN and I lost 50 rank points. Third time this week! Your game is terrible.\" Our rule: agents cannot change rank points. The agent sends a crash report. The game team checks it within 3 days and returns the points if we caused the crash. What is the best reply?",
        "options": [
          "I'm really sorry, three crashes in a week is too much. I'll put your 50 rank points back myself right now, so you don't wait.",
          "I'm really sorry, that is so frustrating. The game team already knows about this problem, so your 50 points will be back tonight.",
          "I'm so sorry, three crashes in a week is too much. I'm reporting it now. We check within 3 days and return the points if we caused it.",
          "Agents cannot change rank points. Crashes are usually caused by a weak internet connection, so please check your connection and play again."
        ],
        "correct_answer": "I'm so sorry, three crashes in a week is too much. I'm reporting it now. We check within 3 days and return the points if we caused it."
      },
      {
        "id": "gm4",
        "type": "multiple_choice",
        "category": "money_rules",
        "time_limit_seconds": 90,
        "question": "Our rule: gems bought with money can be refunded within 14 days, but only the gems not spent yet. Gems earned by playing are never refunded. 100 gems cost $1.\nAna bought 2,000 gems for $20 five days ago and has spent 1,500 of those 2,000. She also earned 500 gems by playing and has not spent any of them. She now has 1,000 gems and asks for $10 back. How much can be refunded?",
        "options": [
          "$20",
          "$15",
          "$10",
          "$5"
        ],
        "correct_answer": "$5"
      },
      {
        "id": "gm5",
        "type": "multiple_choice",
        "category": "follow_through",
        "time_limit_seconds": 90,
        "question": "You told a player: \"I'll check your missing purchase and write back in this chat.\" Your shift ends in 5 minutes and the check is not finished. Our rule: at the end of a shift, open chats go to the next agent. What do you do?",
        "options": [
          "Close the chat and ask the player to write again tomorrow, so the next agent can start with them from the beginning.",
          "Leave the next agent a note: what the player needs, what you checked, what is next. Tell the player who will reply.",
          "Stay after your shift until the check is finished, so the player does not have to explain it again to someone new.",
          "Tell the player the purchase is fixed so they do not worry, and leave a note for the next agent to finish the check."
        ],
        "correct_answer": "Leave the next agent a note: what the player needs, what you checked, what is next. Tell the player who will reply."
      }
    ],
    "cases": [
      {
        "id": "gm-missing-gems",
        "customerName": "Kofi",
        "scenario": "Kofi bought a $10 pack of 1,000 gems 30 minutes ago. The money has left his account, but the gems are not in the game. He already tapped \"Restore purchases\" in Settings twice. A weekend event ends in 2 hours and he needs the gems for it. He is in a hurry and asks the agent to just add the gems or make the event longer. An agent is now answering the chat.\n\nWhat the agent knows: to find a purchase, the agent needs his player ID (in Settings) and the order number from the receipt email. His order shows \"paid, not delivered\". Agents cannot add gems or change event times. When an order is paid but not delivered, the agent sends it to the billing team. They deliver the gems, or refund the order if the player asks, usually within 2 days. Refund rule: a purchase can be refunded within 14 days if none of it has been used. Nobody can promise the gems before the event ends."
      },
      {
        "id": "gm-hacked-account",
        "customerName": "Sara",
        "scenario": "Sara cannot log in today. An email from the game says her account email was changed, and she did not do it. She has bought rare items with real money over two years and is scared someone will trade them away. She wants the agent to change the email back right now. To prove the account is hers, she offers to type her password into the chat. An agent is now answering the chat.\n\nWhat the agent knows: we never ask for or accept passwords. To prove she owns the account, she gives the old email on the account and the order number from one past receipt. Her details will match once she gives them. If both match, the agent can lock the account at once, so nothing can be traded or bought. Agents cannot change the email in chat. The account team gives a locked account back to its owner's email, usually within 24 hours. The account team checks items already traded away; nobody can promise they come back."
      },
      {
        "id": "gm-ban-appeal",
        "customerName": "Omar",
        "scenario": "Omar's account was banned for 7 days this morning for \"cheating\" after a ranked match. He says he has never cheated and is just good at the game. He paid $10 for this season's pass three weeks ago and says he is losing days he paid for. He is angry and wants the ban removed now, the name of who reported him, and his $10 back. An agent is now answering the chat.\n\nWhat the agent knows: agents cannot see the details behind a ban, remove a ban, or say who reported a player. A player can appeal once, even while banned, with the form on the app's Help page. In an appeal, the safety team checks the ban again and replies within 3 days. If they agree, the ban is removed and the lost days are added back to his pass. If not, the ban stays. A purchase is not refunded because of a ban, and his pass has been used. Nobody can promise how an appeal will end."
      },
      {
        "id": "gm-lost-progress",
        "customerName": "Mei",
        "scenario": "After yesterday's update, Mei's farm is back at level 30. Before, she was at level 42, with a big barn she spent two months building. She thinks she did something wrong, and asks if she must start again or stop playing until it is fixed. She would like to be put back to level 42 today, and some gems for the trouble. An agent is now answering the chat.\n\nWhat the agent knows: yesterday's update has a known bug that moved some players' progress back; no player caused it. Agents cannot change levels or add gems. The agent adds her to the bug report with her player ID, her level before the update and what is missing. The game team restores lost progress for players on the report, usually within 5 days. Playing now is safe: the restore will not remove anything she does before it. The game team decides on any gift for affected players and posts it in the News tab; nobody can promise one."
      },
      {
        "id": "gm-quitting-refund",
        "customerName": "Ben",
        "scenario": "Ben has played for three years and spent about $200 on one character and her outfits. Last week's update made that character much weaker. He is sad more than angry. He writes politely that he is quitting, and that since he is leaving, the fair thing is to refund everything he spent. He also asks the agent to undo the change for his account only. An agent is now answering the chat.\n\nWhat the agent knows: a purchase can be refunded within 14 days if none of it has been used. All of Ben's purchases are older than that and have been used. Changes to characters are made for all players, and agents cannot undo them for one account. Agents cannot give gems or gifts. The agent can pass his feedback to the game team, who read it weekly but cannot promise any change. If he wants to leave, he can delete his account in Settings, and this cannot be undone. He can also stop playing and keep his account."
      },
      {
        "id": "gm-chat-threat",
        "customerName": "Rina",
        "scenario": "Rina won a match against another player, \"DarkWolf77\", an hour ago. Since then he has sent her insults in the game chat, and one message says \"I know where you live.\" She is scared and not sure if he really knows. Her messages are short and come quickly. She wants the agent to ban him now and tell her his real name and city. An agent is now answering the chat.\n\nWhat the agent knows: agents cannot ban players or share anything about another player's account. Other players see only her player name, never her real name, email or address. The agent can send a safety report with his player name, what he wrote and about when. The safety team reviews threats before other reports, within 24 hours, and does not say what action it took. She can block him now from his profile, so he cannot message her again. If she feels in danger, she should contact her local police; the safety team works with police when police ask."
      }
    ]
  },
  "general": {
    "id": "general",
    "label": "Small business",
    "counterpart": "customer",
    "evaluatorNote": "A good small-business agent answers every question the customer asked, in plain words, and gives the real next step with the real time (the bank's 3 to 5 working days, the manager's reply time) without promising an outcome someone else decides. They keep to the stated rule on fees, refunds and cancellations, and give a kind, clear no to exceptions, extra money and discounts they cannot give, instead of a vague \"I'll see what I can do\". They check who they are talking to before sharing or changing anything on an account, and never share another customer's details. When the business made the mistake (a missed call, a double booking), they say so plainly and own it.",
    "skills": [
      {
        "id": "gn1",
        "type": "multiple_choice",
        "category": "policy_limit",
        "time_limit_seconds": 90,
        "question": "Ben writes: \"I missed my appointment yesterday because my bus was very late. Please remove the $25 fee.\" Our rule: missing an appointment, or cancelling less than 24 hours before, costs $25. Agents cannot remove fees, but can send a request to the manager, who replies within 3 working days. What is the best reply?",
        "options": [
          "I'm sorry about the bus. I can't remove the fee, but I can send your request to the manager. They reply within 3 working days.",
          "I'm sorry about the bus. That was not your fault, so I will remove the $25 fee for you this one time. Don't worry.",
          "I'm sorry about the bus. I'll send your request to the manager now, and I'm sure they will remove the $25 fee for you this time.",
          "I'm sorry, but every customer must cancel 24 hours before. The $25 fee stays on your bill, and nobody here can change that."
        ],
        "correct_answer": "I'm sorry about the bus. I can't remove the fee, but I can send your request to the manager. They reply within 3 working days."
      },
      {
        "id": "gn2",
        "type": "multiple_choice",
        "category": "privacy",
        "time_limit_seconds": 90,
        "question": "A message comes from an unknown email: \"This is Omar Ali. I lost my phone. Please change the phone number on my account, and tell me when my next booking is.\" Our rule: before you share or change anything, the person must give the email or phone number on the account, and the date of their last visit. What do you do?",
        "options": [
          "Change the number now, because he lost his phone and needs help fast, but wait for the checks before you share his booking.",
          "Tell him the date of his next booking, since a date is not private, and change the number once he has answered the checks.",
          "Kindly pass the chat to the manager, because a message from an unknown email is the manager's decision, not yours.",
          "Kindly ask for the email or phone number on the account and his last visit date. Share or change nothing until they match."
        ],
        "correct_answer": "Kindly ask for the email or phone number on the account and his last visit date. Share or change nothing until they match."
      },
      {
        "id": "gn3",
        "type": "multiple_choice",
        "category": "upset_customer",
        "time_limit_seconds": 90,
        "question": "Mei writes: \"You charged me $40 twice this month! Fix it today or I will cancel.\" Her account shows the same $40 charged twice on one day, by mistake. Our rule: the agent can refund the extra charge during the chat. Her bank then takes 3 to 5 working days to show it. What is the best reply?",
        "options": [
          "You're right, Mei, and I'm so sorry. I've sent the extra $40 back now, and it will be in your bank by the end of today.",
          "Mei, you're right, we charged you twice. I'm sorry. I've sent $40 back now. Your bank shows it in 3 to 5 working days.",
          "I'm sorry, Mei. To be safe, please first send me a photo of your bank statement, so I can check that you really paid twice.",
          "I'm sorry, Mei. Double charges are handled by our billing team, so please email them, and they will fix it for you soon."
        ],
        "correct_answer": "Mei, you're right, we charged you twice. I'm sorry. I've sent $40 back now. Your bank shows it in 3 to 5 working days."
      },
      {
        "id": "gn4",
        "type": "multiple_choice",
        "category": "refund_math",
        "time_limit_seconds": 75,
        "question": "Our rule: when a customer cancels a package, we refund the price of the sessions they have not used, and we keep $15 of that as a cancellation fee. Ana paid $200 for a package of 10 sessions, so each session cost $20. She has used 4 sessions and now cancels. How much do we refund?",
        "options": [
          "$120",
          "$185",
          "$105",
          "$80"
        ],
        "correct_answer": "$105"
      },
      {
        "id": "gn5",
        "type": "multiple_choice",
        "category": "handover",
        "time_limit_seconds": 90,
        "question": "On the phone, you promised Sara: \"I will call you tomorrow at 10 am, when the manager has checked your refund.\" Your shift is now ending, and you have just learned that you are not working tomorrow. What is the best thing to do?",
        "options": [
          "Write a note on Sara's case: what she needs, what you promised and when. Ask tomorrow's agent to make the 10 am call.",
          "Call Sara now: say you will not be at work tomorrow, and ask her to call us again in a few days, when you are back.",
          "Leave it in the case history for tomorrow's agent to find, since the details of her refund are already written there.",
          "Give Sara your own phone number, so that she can reach you tomorrow on your day off, and your promise is still kept."
        ],
        "correct_answer": "Write a note on Sara's case: what she needs, what you promised and when. Ask tomorrow's agent to make the 10 am call."
      }
    ],
    "cases": [
      {
        "id": "gn-unused-months",
        "customerName": "Leo",
        "scenario": "Leo has a monthly plan at $40 a month. He stopped using it three months ago but forgot to cancel. Today is the 3rd, and he has just seen this month's $40 charge. He is polite and calm. He believes that because he did not use the plan, he should get back all four charges, $160 in total. He asks the agent to cancel the plan and send the $160 back today. An agent is now answering the chat.\n\nWhat the agent knows: Leo is signed in, so the agent can see his account. This month's $40 was charged on the 1st. A plan can be cancelled at any time in this chat. The agent can refund a charge made in the last 7 days if the plan has not been used since that charge. A refunded plan ends at once. The three earlier charges cannot be refunded, used or not, and agents cannot make exceptions. A refund takes 3 to 5 working days to show in the bank."
      },
      {
        "id": "gn-locked-out",
        "customerName": "Aisha",
        "scenario": "Aisha has a booking with us tomorrow, but she has forgotten the time. The booking email is in her old email account, which she can no longer open. She writes from a new email. She still has the same phone and number. She is leaving for work. She asks the agent to tell her the booking time, to change the email on her account to the new one, and to send the booking there. She wants the agent to skip any checks. An agent is now answering the chat.\n\nWhat the agent knows: before sharing anything about a booking or changing an account, the agent texts a 6-digit code to the phone number on the account. The person is checked when they type the code back into the chat; Aisha's code will be right. It takes about a minute, and nobody can skip it. After the check, the agent can do all three things she asked. Her booking is tomorrow at 9:30 am. Our address and opening hours are public."
      },
      {
        "id": "gn-two-charges",
        "customerName": "Rita",
        "scenario": "Rita looked at her bank app and saw two charges from us this week: $60 and $15. She thinks she was charged twice by mistake, and she does not understand why the amounts are different. She is confused, not angry. She asks the agent to send back the $15, and she asks if she will be charged again next week. An agent is now answering the chat.\n\nWhat the agent knows: Rita is signed in, so the agent can see her account. The $60 is her monthly plan, charged on the 1st of every month. The $15 is a late-cancellation fee: she cancelled last Tuesday's appointment 3 hours before it started, and our rule is to cancel at least 24 hours before. The rule is on the booking page and in every booking email. Agents cannot remove fees. The agent can send a request to the manager, who replies by email within 3 working days. Nothing else will be charged before the 1st of next month."
      },
      {
        "id": "gn-no-callback",
        "customerName": "Sam",
        "scenario": "On Monday, Sam cancelled a booking that was 10 days away and asked for his $200 back. An agent wrote: \"I will check with the manager and call you back tomorrow.\" Nobody called. Sam has written twice since then and got no answer. Today is Friday. He is angry. He says the business is stealing his money, wants it back today, and wants an extra $50 for his time. An agent is now answering the chat.\n\nWhat the agent knows: Sam is signed in. Our rule: a booking cancelled at least 7 days before its date is refunded in full. The manager approved his $200 refund on Wednesday, and it was sent yesterday, but nobody told him. Banks usually take 3 to 5 working days to show a refund, so it should show between Tuesday and Thursday next week. The agent cannot speed it up or see his bank. Agents cannot give extra money or credits. The agent can pass a complaint about the missed call to the manager."
      },
      {
        "id": "gn-double-booked",
        "customerName": "Elena",
        "scenario": "Elena booked a 2 pm session on Saturday for her daughter's 10th birthday party and paid a $120 deposit. Today an email told her the booking was cancelled, because the same time was booked twice by mistake. She has already invited 12 children. She is very upset, almost crying. She asks the agent to cancel the other booking, because a child's birthday matters more, or to tell her who the other customer is so she can ask them to move. An agent is now answering the chat.\n\nWhat the agent knows: Elena is signed in. Our system let two customers book the same time; the other booking came first. The mistake was ours. The agent can move her to Saturday at 10 am or Sunday at 2 pm, both open, at no extra cost. Or the agent can send back the full $120 today; it shows in her bank in 3 to 5 working days. The agent cannot cancel or move another customer's booking, and cannot share anything about them."
      },
      {
        "id": "gn-many-questions",
        "customerName": "Joy",
        "scenario": "Joy sends five quick messages, one after another. She has read that prices are going up and is worried she cannot afford it. She asks: does her price go up too? Can she keep the old price after 4 years as a customer? Can she move her Thursday 6 pm booking to Friday? Can her sister come with her on Friday? Can she pay for next month's visits at the end of the month? An agent is now answering the chat.\n\nWhat the agent knows: Joy is signed in. From the 1st of next month, every visit costs $35, not $30, even if it was booked earlier. Agents cannot keep anyone on the old price or give discounts. Friday at 6 pm has 2 open places, and moving a booking is free. Her sister can take the other place, but must book it in her own name. Both Friday visits are before the 1st, so they cost $30. Payment is taken at booking; there is no pay-later option."
      }
    ]
  }
};

/** The pack with this id, or null for anything else (a value read from a request or a step). */
export function scenarioPack(id: unknown): ScenarioPack | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SCENARIO_PACKS, id) ? SCENARIO_PACKS[id as ScenarioPackId] : null;
}
