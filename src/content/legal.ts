/**
 * legal.ts: the words of the Privacy Policy and the Terms and Conditions
 * (docs/LEGAL-PAGES.md). The pages that show them are src/pages/Privacy.tsx
 * and src/pages/Terms.tsx, through src/components/LegalPage.tsx.
 *
 * The owner, 2026-10-09: "write terms and condition and privacy policy dont
 * mention company name and address for now". They replace two pages dated
 * December 2024, written for a product that no longer exists (fees, a
 * company name, email addresses nobody reads).
 *
 * Two rules for anyone changing this file:
 *
 * 1. Every statement about what the site collects, shows or does must be
 *    true of the code and the live setup. docs/LEGAL-PAGES.md lists where
 *    each one was checked. If the site changes (a new step, a new provider,
 *    a retention period), this changes with it.
 * 2. No company name, no postal address and no email address, until the
 *    owner says otherwise. The way to reach the people who run the site is
 *    Messages, as everywhere else. scripts/legal_pages.test.mjs holds both.
 *
 * Plain words on purpose: an applicant reads this on a phone, often in a
 * second language.
 */

export type LegalBlock = string | { list: string[] } | { sub: string };

export interface LegalSection {
  id: string;
  title: string;
  body: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** As shown: "October 9, 2026". */
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

export const LEGAL_UPDATED = "October 10, 2026";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  updated: LEGAL_UPDATED,
  intro: [
    "This policy says what information this site collects, why, who sees it, and what you can do about it.",
    "\"This site\" means hireflownow.com and the hiring tools on it. \"We\" means the people who run it. The policy covers two kinds of people: applicants, who apply for a job here, and hiring teams, who use the site to hire.",
  ],
  sections: [
    {
      id: "short",
      title: "The short version",
      body: [
        {
          list: [
            "We collect what you give us when you apply, and what you do in each step of the application.",
            "The hiring team for the job you applied to sees it. Other applicants never do.",
            "We do not sell your information, and the site shows no advertising.",
            "Software, including AI, scores your answers. A person on the hiring team decides whether to pass on your application.",
            "You can delete your account yourself, at any time, in Settings.",
            "To ask us anything, message us in your account.",
          ],
        },
      ],
    },
    {
      id: "collect",
      title: "What we collect",
      body: [
        { sub: "When you make an account" },
        "Your name, your email address and a password. The password is stored in a scrambled form that we cannot read.",
        { sub: "If you fill in your profile" },
        "This is optional: a phone number, your location, a short description of yourself, your job title, years of experience, skills, links such as LinkedIn or a portfolio, a resume, and a photo. A photo you add is stored at a public web address, so anyone who has that address can open it.",
        { sub: "When you apply for a job" },
        "Your answers to the application questions, and any file the job asks for, such as a resume or a cover letter.",
        { sub: "While you take each step" },
        "For every step we keep when you started and finished, how long you were active, and how far you got.",
        "To keep the tests fair, we record certain events during the form and the tests: copying, cutting or pasting, text that was pasted in, right-clicks, leaving the tab or window and for how long, screenshot keys, opening the browser's developer tools, and closing the page. We record that these things happened. We do not record your screen, your camera or your microphone.",
        {
          list: [
            "Skills check: each answer, the time you took on each question, your score, and how many attempts you made.",
            "Computer and connection check: your download and upload speed, latency and jitter; details of your device and browser (operating system, browser, screen size, processor cores, memory, whether it is a touch device, language, time zone and connection type); and the IP addresses seen during the check.",
            "Typing test: the text you typed, your speed, your accuracy and your errors.",
            "Chat practice: the whole conversation, how long each reply took, and a summary of how each reply was typed (number of characters and keys, time spent typing, corrections, and whether text looked pasted).",
            "Written interview: the whole conversation.",
          ],
        },
        "From these, software produces scores, a written summary, and notes on strengths and concerns for the hiring team.",
        "Not every job uses every step. A job may also include a spoken interview with the AI interviewer. If yours does, what you say is turned into text, and the text and the audio may be stored.",
        { sub: "Interviews with a person" },
        "The time you agreed, what you wrote about when you are free, and the hiring team's own notes and ratings from your interview.",
        { sub: "Messages" },
        "Messages between you and the hiring team, and any files attached to them.",
        { sub: "Documents and signatures" },
        "Documents sent to you, such as an offer letter. When you sign one we keep your signature (typed or drawn), the date and time, your name and email address, your IP address and your browser type. This record is kept with the signed document so that both sides can show what was signed and when.",
        { sub: "Documents the hiring team asks you for" },
        "Once you are near a job offer, the hiring team may ask you to send documents, such as a photo of a government ID, an NBI clearance or proof of address, or to type your TIN or the email you use on Wise or PayPal to be paid. Files are kept in private storage. Each time someone on the hiring team opens one, we record who opened it and when. We never ask for bank account numbers.",
        { sub: "Technical information" },
        {
          list: [
            "Your IP address, kept by some features to stop abuse, such as too many requests in a short time.",
            "If the site crashes on your device: a report of the error, the page it happened on, your browser family and your account.",
            "Page counts: which page was opened, the site that sent you here (its name only), campaign tags in the link, and whether the device was a phone or a computer. This uses no cookie and no visitor number, stores no IP address, and is switched off if your browser sends Do Not Track or Global Privacy Control.",
          ],
        },
        { sub: "If you are on a hiring team" },
        "Your name, email address and password; your company's name, logo and details as you enter them; the jobs you post; your notes, ratings and decisions about applicants; the documents you send and sign; and the name and email address of anyone you invite to your team.",
      ],
    },
    {
      id: "use",
      title: "How we use it",
      body: [
        {
          list: [
            "To run your application: show you the next step, save your progress, and score the results.",
            "To let the hiring team review applicants and decide.",
            "To contact you about your application, in the site and by email. You can turn some emails off in Settings.",
            "To keep the tests fair and the site secure.",
            "To keep a record of signed documents.",
            "To fix problems, and to understand in total numbers how the site is used.",
          ],
        },
        "We do not sell your information. We do not use it for advertising.",
      ],
    },
    {
      id: "ai",
      title: "AI and automatic scoring",
      body: [
        "AI software reads your test answers, your chat practice, your written interview and, if you upload one, your resume. It produces scores, a summary and notes for the hiring team. The player you chat with in the chat practice and the interviewer in the written interview are AI, not people.",
        "When you finish a step, the site may move you to the next step automatically.",
        "No application is declined by software alone. A person on the hiring team makes that decision. The one automatic refusal is this: if the hiring team has blocked an account, that account cannot apply again.",
        "AI can be wrong. If you think a result is wrong, message the hiring team in your account.",
      ],
    },
    {
      id: "who",
      title: "Who sees your information",
      body: [
        { sub: "The hiring team" },
        "The owner of the hiring account for the job you applied to, and the team members they have given access to that job. They see your application, your results, the events recorded during your tests, your messages and your documents.",
        "You can see your own application, messages and documents. You cannot see the scoring detail, the events recorded during tests, or the hiring team's notes and ratings.",
        { sub: "Companies that run parts of the site for us" },
        "They handle your information only to provide their service to us:",
        {
          list: [
            "Supabase: the database, sign-in and file storage.",
            "Vercel: hosting the site.",
            "OpenAI: the AI scoring, the chat practice and the written interview.",
            "Resend: sending email.",
            "OneSignal: notifications, if you use the mobile app.",
            "A video-call provider, if the hiring team uses the site's built-in call for your interview.",
          ],
        },
        "Your browser also loads fonts and small pieces of code from public networks (Google Fonts, jsDelivr and unpkg). Like any website you visit, they see your IP address when it does.",
        { sub: "Anyone else" },
        "Only if the law requires it, to protect someone's rights or safety, or if the site passes to a new owner, who would be bound by this policy.",
      ],
    },
    {
      id: "where",
      title: "Where it is kept",
      body: [
        "Your information is stored and processed in the United States and in other countries where the companies above operate. These may not be the country you live in, and their privacy laws may differ from yours.",
      ],
    },
    {
      id: "keep",
      title: "How long we keep it",
      body: [
        "Most things are not deleted on a timer. We keep your account and your applications until you delete them, you ask us to, or the hiring team removes them.",
        "The one exception is identity papers. A government ID, NBI clearance or proof of address you send when the hiring team asks for it is deleted 30 days after they approve it. If they ask you to send one again and you do not, the earlier file is deleted 30 days after they asked.",
        "When you delete your account, your profile, your applications, your test records and your files are deleted with it.",
        "A few technical records stay behind: a count of your test attempts, the start times of typing tests, a block-list entry if the account was blocked, and error reports. Signed documents and their records may also be kept where both sides may still need them or the law requires it.",
      ],
    },
    {
      id: "choices",
      title: "Your choices",
      body: [
        {
          list: [
            "See and change your details: open Profile in your account.",
            "Turn emails off: open Settings.",
            "Withdraw an application: open Applications.",
            "Delete your account: open Settings and choose Delete Account.",
            "Ask for a copy of your information, for a correction, or to object to how it is used: message us in your account.",
          ],
        },
        "Depending on where you live, the law may give you more rights than these, for example in the European Union, the United Kingdom, the Philippines or California. Tell us which right you want to use and we will handle it. You can also complain to the data protection authority where you live.",
        "We will not treat you differently for using any of these rights.",
      ],
    },
    {
      id: "storage",
      title: "Cookies and browser storage",
      body: [
        "The site keeps you signed in using your browser's storage. It also saves unsent drafts and test progress in your browser, so that a refresh does not lose your work, and it remembers display choices such as light or dark. One small cookie remembers whether a menu is open.",
        "There are no advertising cookies and no trackers from advertising or social media companies.",
      ],
    },
    {
      id: "security",
      title: "Keeping it safe",
      body: [
        "The connection to the site is encrypted. Files such as resumes are kept in private storage and opened through links that expire after a few minutes. Access rules limit who can read each record.",
        "No system is perfectly secure. If you think someone else has used your account, change your password and message us.",
      ],
    },
    {
      id: "age",
      title: "Age",
      body: ["The site is for adults. You must be 18 or older to use it. We do not knowingly collect information from anyone under 18."],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: ["When this policy changes, the date at the top changes with it. If a change is important, we will tell you in the site or by email before it takes effect."],
    },
    {
      id: "contact",
      title: "How to reach us",
      body: ["Message us in your account: open Messages and write to the hiring team. We do not read replies to the emails the site sends."],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: "Terms and Conditions",
  updated: LEGAL_UPDATED,
  intro: [
    "These terms are the agreement between you and the people who run this site (\"we\") for using hireflownow.com and the hiring tools on it (\"this site\").",
    "By making an account or using this site, you agree to them. If you do not agree, please do not use the site.",
  ],
  sections: [
    {
      id: "who",
      title: "Who can use the site",
      body: [
        {
          list: [
            "You must be 18 or older.",
            "The information you give must be true and your own.",
            "One account per person. Keep your password to yourself: you are responsible for what is done in your account.",
          ],
        },
      ],
    },
    {
      id: "applying",
      title: "If you are applying for a job",
      body: [
        { sub: "What the site does" },
        "It lets you apply for a job and complete the steps the hiring team has set. Your answers and results go to that hiring team.",
        { sub: "No promises" },
        "Applying does not guarantee an interview, an offer or a job. The decision about your application is made by the hiring team for that job.",
        { sub: "Do your own work" },
        {
          list: [
            "Your answers must be your own. Nobody else may take a step for you.",
            "Do not use AI tools, scripts or copied answers in a test unless the step says you may.",
            "Do not copy, share or publish the questions, tests or conversations.",
          ],
        },
        "During the form and the tests we record certain events, described in the Privacy Policy. The hiring team may take them into account.",
        { sub: "Your computer and connection" },
        "They are yours to look after. An interruption can affect a result. If something broke during a step, message the hiring team in your account.",
        { sub: "Offers" },
        "An offer is only an offer when the hiring team sends it to you in writing. The terms of any job are between you and the employer. Using this site does not make you anyone's employee or contractor.",
        { sub: "Blocked accounts" },
        "The hiring team can block an account that breaks these terms. A blocked account cannot apply again.",
      ],
    },
    {
      id: "hiring",
      title: "If you are hiring",
      body: [
        {
          list: [
            "Your jobs are your responsibility. They must be real, accurate and lawful.",
            "Your decisions are yours. Scores and summaries are there to help you; you must review each applicant and decide yourself.",
            "You must follow the employment, anti-discrimination and privacy laws that apply to you and to the people who apply.",
            "Use applicants' information only to hire for the job they applied to, keep it confidential, and act on a request to delete it.",
            "You are responsible for the people you invite to your team and for what they do here.",
            "Documents you send, such as offer letters, are yours. The site gives you the tool, not legal advice.",
          ],
        },
        { sub: "Price" },
        "Using the site is free at the moment. If that changes we will tell you first, and nothing will be charged without your agreement.",
      ],
    },
    {
      id: "ai",
      title: "AI features",
      body: [
        "Scores, summaries and the simulated conversations are produced by software. They can be wrong or incomplete, and they are not professional advice. A hiring team must not rely on them alone.",
      ],
    },
    {
      id: "conduct",
      title: "What you must not do",
      body: [
        {
          list: [
            "Break the law, or help anyone else to.",
            "Harass, threaten or discriminate against anyone.",
            "Pretend to be someone else, or give false information.",
            "Try to get into another person's account or see information that is not yours.",
            "Upload anything harmful, such as a virus.",
            "Copy the site's content in bulk, overload it, or try to work out how its tests are scored.",
            "Send spam, or use the site to collect people's information for anything other than hiring.",
          ],
        },
      ],
    },
    {
      id: "signing",
      title: "Documents and electronic signatures",
      body: [
        "You can sign a document on this site by typing or drawing your name. As far as the law allows, that has the same effect as signing on paper.",
        "You can decline to sign. When you do sign, the site keeps a record of the signing, described in the Privacy Policy. Keep your own copy of anything you sign.",
      ],
    },
    {
      id: "yours",
      title: "What you submit",
      body: [
        "What you submit stays yours. You give us permission to store it, process it and show it to the people who need to see it so the site can work: an applicant's answers to the hiring team, and a hiring team's job and documents to applicants.",
        "You confirm that you have the right to submit it.",
      ],
    },
    {
      id: "ours",
      title: "What is ours",
      body: ["The site, its design, its tests, its questions and its software belong to us or to those who license them to us. Please do not copy, share or reuse them."],
    },
    {
      id: "service",
      title: "Changes to the site",
      body: ["We may change, pause or stop any part of the site. We work to keep it running, but we do not promise that it will always be available or free of errors."],
    },
    {
      id: "liability",
      title: "Our responsibility",
      body: [
        "The site is provided as it is. As far as the law allows, we are not responsible for hiring decisions made by hiring teams, for what other users do, for an opportunity you did not get, or for indirect losses.",
        "Nothing in these terms takes away a right the law gives you that cannot be taken away.",
      ],
    },
    {
      id: "ending",
      title: "Ending",
      body: [
        "You can stop using the site and delete your account at any time, in Settings.",
        "We may suspend or close an account that breaks these terms or puts other people at risk.",
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: ["When these terms change, the date at the top changes with them. If a change is important, we will tell you in the site or by email. Using the site after a change means you accept it."],
    },
    {
      id: "contact",
      title: "How to reach us",
      body: ["Message us in your account: open Messages and write to the hiring team."],
    },
  ],
};
