import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Privacy = () => {
  return (
    <div className="dark min-h-screen bg-[hsl(220,18%,10%)] text-white">
      {/* Header */}
      <header className="border-b border-border/40 bg-[hsl(220,18%,10%)]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(220,18%,10%)]/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.png" alt="HireFlow" className="w-8 h-8" />
            <span className="font-bold text-xl text-foreground">HireFlow</span>
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: December 19, 2024</p>

          {/* Table of Contents */}
          <div className="bg-muted/50 rounded-lg p-6 mb-12">
            <h2 className="text-xl font-semibold text-foreground mt-0 mb-4">Table of Contents</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li><a href="#introduction" className="text-primary hover:underline">Introduction and Company Information</a></li>
              <li><a href="#information-collected" className="text-primary hover:underline">Information We Collect</a></li>
              <li><a href="#how-we-use" className="text-primary hover:underline">How We Use Your Information</a></li>
              <li><a href="#legal-bases" className="text-primary hover:underline">Legal Bases for Processing</a></li>
              <li><a href="#information-sharing" className="text-primary hover:underline">Information Sharing and Disclosure</a></li>
              <li><a href="#data-retention" className="text-primary hover:underline">Data Retention</a></li>
              <li><a href="#your-rights" className="text-primary hover:underline">Your Rights and Choices</a></li>
              <li><a href="#international-transfers" className="text-primary hover:underline">International Data Transfers</a></li>
              <li><a href="#security" className="text-primary hover:underline">Data Security</a></li>
              <li><a href="#cookies" className="text-primary hover:underline">Cookies and Tracking Technologies</a></li>
              <li><a href="#children" className="text-primary hover:underline">Children's Privacy</a></li>
              <li><a href="#ai-processing" className="text-primary hover:underline">AI and Automated Decision-Making</a></li>
              <li><a href="#california" className="text-primary hover:underline">California Privacy Rights (CCPA/CPRA)</a></li>
              <li><a href="#updates" className="text-primary hover:underline">Updates to This Policy</a></li>
              <li><a href="#contact" className="text-primary hover:underline">Contact Information</a></li>
            </ol>
          </div>

          {/* Section 1 */}
          <section id="introduction" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">1. Introduction and Company Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to HireFlow, an AI-powered hiring and recruitment platform operated by AEY Technologies LLC ("Company," "we," "us," or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website located at hireflownow.com (the "Site") and use our web-based application, mobile applications, and related services (collectively, the "Platform" or "Services").
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We respect your privacy and are committed to protecting personally identifiable information you may provide us through the Platform. We have adopted this Privacy Policy to explain what information may be collected, how we use this information, and under what circumstances we may disclose the information to third parties. This Privacy Policy applies only to information we collect through the Platform and does not apply to our collection of information from other sources.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              This Privacy Policy, together with the Terms of Service posted on our Platform, sets forth the general rules and policies governing your use of our Platform. Depending on your activities when visiting our Platform, you may be required to agree to additional terms and conditions.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>BY ACCESSING OR USING OUR PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THIS PRIVACY POLICY. IF YOU DO NOT AGREE WITH THE TERMS OF THIS PRIVACY POLICY, PLEASE DO NOT ACCESS THE PLATFORM.</strong>
            </p>
          </section>

          {/* Section 2 */}
          <section id="information-collected" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              We collect information about you in various ways when you use our Platform. The types of personal data we collect depend on how you interact with us and which Services you use. We collect information you provide directly to us, information we collect automatically when you use the Platform, and information we obtain from third-party sources.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.1 Account and Profile Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you register for an account, we collect information that identifies you, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Full legal name and display name</li>
              <li>Email address and phone number</li>
              <li>Password (stored in encrypted form)</li>
              <li>Profile photograph or avatar</li>
              <li>Account type (employer or candidate)</li>
              <li>Company name and company logo (for employer accounts)</li>
              <li>Company description and industry information</li>
              <li>Professional biography and summary</li>
              <li>Location and geographic region</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.2 Employer-Specific Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you use our Platform as an employer or hiring manager, we additionally collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Job posting details including titles, descriptions, requirements, and responsibilities</li>
              <li>Salary ranges and compensation information</li>
              <li>Benefits and perks offered</li>
              <li>Department and team structure information</li>
              <li>Hiring workflow configurations and preferences</li>
              <li>Interview scheduling preferences and calendar integration data</li>
              <li>Custom screening questions and assessment criteria</li>
              <li>Team member information for collaborative hiring</li>
              <li>Subscription and billing information</li>
              <li>Voice credit purchases and usage</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.3 Candidate-Specific Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you use our Platform as a job candidate or applicant, we collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Resume/CV documents and their contents</li>
              <li>Cover letters and application materials</li>
              <li>Work history and employment experience</li>
              <li>Educational background and qualifications</li>
              <li>Professional skills and competencies</li>
              <li>Portfolio materials including documents, images, and project work</li>
              <li>LinkedIn profile URL and other professional social media links</li>
              <li>Portfolio website URLs</li>
              <li>Professional certifications and licenses</li>
              <li>Language proficiency and communication preferences</li>
              <li>Salary expectations and availability</li>
              <li>Visa and work authorization status (where legally permitted)</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.4 Application and Assessment Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              During the application and screening process, we collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Responses to application screening questions</li>
              <li>Quiz and assessment results including scores and timing data</li>
              <li>Typing test results including words per minute and accuracy metrics</li>
              <li>Chat interview and simulation conversation transcripts</li>
              <li>Sales simulation performance data and outcomes</li>
              <li>Application status and progression through hiring stages</li>
              <li>Notes and feedback from employers and hiring team members</li>
              <li>Timestamps for all application activities and interactions</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.5 Audio, Video, and Voice Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our Platform includes features that capture audio and video content:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Voice interview recordings and their full transcriptions</li>
              <li>Video introduction recordings</li>
              <li>Screen recordings during assessments (where enabled)</li>
              <li>Duration and timing of audio/video sessions</li>
              <li>Language detection and speech analysis metadata</li>
              <li>Voice characteristics for AI analysis purposes</li>
              <li>Chat simulation conversation audio (if voice-enabled)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Important:</strong> By using voice and video features, you explicitly consent to the recording, storage, processing, and AI analysis of your audio and video data. These recordings may be retained and reviewed by employers as part of the hiring evaluation process.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.6 AI-Generated Data and Analysis</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our AI-powered features generate and store the following derived data:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Candidate screening scores and rankings</li>
              <li>AI-generated analysis reports and recommendations</li>
              <li>Skills assessment and matching scores</li>
              <li>Communication style and quality evaluations</li>
              <li>Bias detection analysis on job postings</li>
              <li>Performance predictions and suitability assessments</li>
              <li>Automated interview feedback and summaries</li>
              <li>Portfolio and work sample evaluations</li>
              <li>Resume parsing and structured data extraction</li>
              <li>Sentiment analysis of communications</li>
              <li>Shortlist recommendations and rankings</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.7 Document and E-Signature Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              When using our document signing and management features, we collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Document content including offer letters, contracts, and HR documents</li>
              <li>Digital signature images and signature data</li>
              <li>IP address at the time of document signing</li>
              <li>Geolocation data (city, region, country) during signing events</li>
              <li>Browser and device information (user agent) at signing</li>
              <li>Timestamps for document creation, viewing, and signing</li>
              <li>Document version history and modification audit trails</li>
              <li>Cryptographic hashes for document integrity verification</li>
              <li>Consent confirmations and acknowledgments</li>
              <li>Decline reasons (if applicable)</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.8 Communication Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              We collect data from communications on our Platform:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Messages exchanged between employers and candidates</li>
              <li>File attachments shared in messages</li>
              <li>Read receipts and message delivery status</li>
              <li>Email notification preferences</li>
              <li>In-app notification history</li>
              <li>Support inquiries and correspondence</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.9 Payment and Billing Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              For paid services and subscriptions, we collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Subscription plan type and billing cycle</li>
              <li>Payment transaction history</li>
              <li>Invoice and receipt information</li>
              <li>Voice credit purchase history and balance</li>
              <li>Stripe customer identifiers (payment processing is handled by Stripe)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Note:</strong> We do not directly collect, store, or have access to your full credit card numbers, CVV codes, or bank account details. All payment processing is handled by our third-party payment processor, Stripe, Inc., which maintains its own privacy policy and security standards. Please review Stripe's privacy policy for information on how they handle your payment data.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.10 Technical and Usage Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              We automatically collect certain information when you access our Platform:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>IP address and approximate geographic location</li>
              <li>Browser type, version, and language preferences</li>
              <li>Operating system and device type</li>
              <li>Device identifiers and unique device tokens</li>
              <li>Session duration and page view analytics</li>
              <li>Referring URLs and exit pages</li>
              <li>Click patterns and feature usage statistics</li>
              <li>Error logs and performance data</li>
              <li>Time zone and locale settings</li>
              <li>Screen resolution and viewport size</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.11 Third-Party Integration Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you connect third-party services to our Platform:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Google Calendar integration data for interview scheduling</li>
              <li>OAuth tokens and authorization data for connected services</li>
              <li>Calendar event information for scheduled interviews</li>
              <li>Google account email and basic profile information (when using Google sign-in)</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section id="how-we-use" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect for various purposes related to providing, maintaining, and improving our Services:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.1 Service Delivery and Platform Operations</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Creating and managing user accounts and profiles</li>
              <li>Facilitating job posting and application processes</li>
              <li>Enabling communication between employers and candidates</li>
              <li>Processing and storing documents and electronic signatures</li>
              <li>Managing subscription services and voice credit systems</li>
              <li>Scheduling interviews and managing hiring workflows</li>
              <li>Providing team collaboration features for employers</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.2 AI-Powered Screening and Analysis</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Automated resume parsing and skills extraction</li>
              <li>AI-powered candidate screening and scoring</li>
              <li>Voice interview transcription and analysis</li>
              <li>Portfolio and work sample evaluation</li>
              <li>Communication assessment and feedback generation</li>
              <li>Chat and sales simulation evaluation</li>
              <li>Job posting bias detection and improvement suggestions</li>
              <li>Shortlist generation and candidate ranking</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.3 Communications</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Sending transactional emails and notifications</li>
              <li>Delivering interview reminders and scheduling updates</li>
              <li>Providing document signing notifications and reminders</li>
              <li>Communicating service updates and policy changes</li>
              <li>Responding to inquiries and support requests</li>
              <li>Sending marketing communications (with consent)</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.4 Security and Fraud Prevention</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Verifying user identity and authenticating accounts</li>
              <li>Detecting and preventing fraudulent activity</li>
              <li>Monitoring for security threats and vulnerabilities</li>
              <li>Creating audit trails for document signing compliance</li>
              <li>Enforcing our Terms of Service and policies</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.5 Analytics and Improvement</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Analyzing platform usage and feature adoption</li>
              <li>Improving AI model accuracy and performance</li>
              <li>Developing new features and services</li>
              <li>Conducting research and generating aggregate statistics</li>
              <li>Optimizing user experience and interface design</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.6 Legal Compliance</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Complying with applicable laws than regulations</li>
              <li>Responding to legal process and law enforcement requests</li>
              <li>Protecting our legal rights and interests</li>
              <li>Enforcing contractual obligations</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="legal-bases" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">4. Legal Bases for Processing (GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed">
              For individuals in the European Economic Area (EEA), United Kingdom, and other jurisdictions with similar data protection laws, we process your personal data based on the following legal grounds:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.1 Contractual Necessity</h3>
            <p className="text-muted-foreground leading-relaxed">
              We process personal data as necessary to perform our contract with you, including providing the Services you have requested, managing your account, processing applications, and facilitating communications between employers and candidates.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.2 Consent</h3>
            <p className="text-muted-foreground leading-relaxed">
              We obtain your consent for processing activities that require it, including recording voice and video interviews, sending marketing communications, and using cookies for non-essential purposes. You may withdraw consent at any time, though this will not affect the lawfulness of processing prior to withdrawal.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.3 Legitimate Interests</h3>
            <p className="text-muted-foreground leading-relaxed">
              We process personal data based on our legitimate business interests, including improving our Services, ensuring platform security, preventing fraud, and conducting analytics. We balance these interests against your rights and freedoms.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.4 Legal Obligations</h3>
            <p className="text-muted-foreground leading-relaxed">
              We process personal data as necessary to comply with applicable legal obligations, including tax and financial regulations, employment law requirements, and responses to valid legal process.
            </p>
          </section>

          {/* Section 5 */}
          <section id="information-sharing" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">5. Information Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal information. We share information in the following circumstances:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.1 Between Employers and Candidates</h3>
            <p className="text-muted-foreground leading-relaxed">
              When candidates apply for jobs, their application materials, including resumes, cover letters, assessment results, interview recordings, and AI-generated analyses, are shared with the employer and their authorized team members. Employers' job posting information and company details are visible to candidates who view or apply for positions.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.2 Team Members</h3>
            <p className="text-muted-foreground leading-relaxed">
              Employer accounts may add team members who will have access to job postings, applications, candidate information, documents, and communications based on their assigned permissions.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.3 Service Providers</h3>
            <p className="text-muted-foreground leading-relaxed">
              We engage third-party service providers to perform services on our behalf, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Stripe, Inc.:</strong> Payment processing and subscription management</li>
              <li><strong>Google:</strong> Calendar integration, authentication services, and AI/ML services</li>
              <li><strong>ElevenLabs:</strong> Text-to-speech and voice synthesis services</li>
              <li><strong>AI/LLM Providers:</strong> Natural language processing and AI analysis services</li>
              <li><strong>Cloud Infrastructure Providers:</strong> Data hosting and storage services</li>
              <li><strong>Email Service Providers:</strong> Transactional and notification email delivery</li>
              <li><strong>IP Geolocation Services:</strong> Location verification for document signing</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              These service providers are contractually obligated to protect your information and may only use it to provide services to us.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.4 Legal Requirements</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may disclose personal information when required by law, legal process, litigation, or requests from governmental authorities. We may also disclose information to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Comply with subpoenas, court orders, or other legal process</li>
              <li>Respond to requests from public and government authorities</li>
              <li>Protect the security or integrity of our Platform</li>
              <li>Protect ourselves, our users, or the public from harm or illegal activities</li>
              <li>Enforce our Terms of Service or other agreements</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.5 Business Transfers</h3>
            <p className="text-muted-foreground leading-relaxed">
              In the event of a merger, acquisition, reorganization, bankruptcy, or sale of all or a portion of our assets, your personal information may be transferred as part of that transaction. We will notify you via email and/or prominent notice on our Platform of any change in ownership or uses of your personal information.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.6 With Your Consent</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may share information about you with third parties when you give us consent or direct us to do so.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.7 Aggregated or De-identified Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may share aggregated or de-identified information that cannot reasonably be used to identify you for research, marketing, analytics, and other purposes.
            </p>
          </section>

          {/* Section 6 */}
          <section id="data-retention" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain personal data for as long as necessary to fulfill the purposes for which it was collected, including to satisfy legal, accounting, or reporting requirements. Retention periods vary based on the type of data:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.1 Account Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              Active account information is retained for the duration of your account plus seven (7) years after account closure for tax, legal, and regulatory compliance purposes.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.2 Application Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              Job application data is retained for a minimum of three (3) years after the application is closed or the position is filled, or longer if required by applicable employment laws. Employers may configure shorter retention periods where legally permitted.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.3 Voice and Video Recordings</h3>
            <p className="text-muted-foreground leading-relaxed">
              Interview recordings and transcripts are retained for two (2) years after the associated application is closed, unless longer retention is required for legal compliance or ongoing disputes.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.4 Document and Audit Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              Signed documents and their associated audit logs are retained for ten (10) years to ensure legal validity and compliance with electronic signature laws (E-SIGN Act, UETA) and record-keeping requirements.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.5 Payment Records</h3>
            <p className="text-muted-foreground leading-relaxed">
              Payment transaction records are retained for seven (7) years in accordance with tax and financial regulations.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.6 Technical and Security Logs</h3>
            <p className="text-muted-foreground leading-relaxed">
              System logs and security data are retained for one (1) year for security monitoring and incident investigation purposes.
            </p>
          </section>

          {/* Section 7 */}
          <section id="your-rights" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">7. Your Rights and Choices</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your jurisdiction, you may have certain rights regarding your personal data:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.1 Access and Portability</h3>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to request access to the personal data we hold about you and to receive a copy of your data in a structured, commonly used, and machine-readable format.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.2 Rectification</h3>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to request correction of inaccurate or incomplete personal data we hold about you. You can update much of your information directly through your account settings.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.3 Erasure (Right to be Forgotten)</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may request deletion of your personal data in certain circumstances. Note that we may be required to retain certain information for legal, regulatory, or contractual purposes, and deletion requests may be subject to exceptions.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.4 Restriction of Processing</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may request that we restrict processing of your personal data in certain circumstances, such as when you contest the accuracy of the data or object to processing.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.5 Object to Processing</h3>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to object to processing of your personal data based on legitimate interests or for direct marketing purposes.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.6 Withdraw Consent</h3>
            <p className="text-muted-foreground leading-relaxed">
              Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing based on consent before its withdrawal.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.7 Exercising Your Rights</h3>
            <p className="text-muted-foreground leading-relaxed">
              To exercise any of these rights, please contact us at privacy@hireflownow.com. We will respond to your request within the timeframes required by applicable law (typically 30 days for GDPR requests, 45 days for CCPA requests). We may need to verify your identity before processing your request.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.8 Complaints</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you believe we have violated your privacy rights, you have the right to lodge a complaint with your local data protection supervisory authority.
            </p>
          </section>

          {/* Section 8 */}
          <section id="international-transfers" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">8. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow is operated from the United States. If you access our Services from outside the United States, please be aware that your information may be transferred to, stored, and processed in the United States and other countries where our servers and service providers are located.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              For transfers of personal data from the EEA, UK, or Switzerland to the United States or other countries that do not provide an adequate level of data protection, we implement appropriate safeguards including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Standard Contractual Clauses approved by the European Commission</li>
              <li>Binding Corporate Rules (where applicable)</li>
              <li>Other valid transfer mechanisms under applicable law</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              By using our Services, you consent to the transfer of your information to the United States and other countries that may have different data protection laws than your country of residence.
            </p>
          </section>

          {/* Section 9 */}
          <section id="security" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">9. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement and maintain appropriate technical and organizational security measures designed to protect your personal data against unauthorized access, alteration, disclosure, or destruction. These measures include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Encryption of data in transit using TLS/SSL protocols</li>
              <li>Encryption of data at rest</li>
              <li>Secure password hashing using industry-standard algorithms</li>
              <li>Role-based access controls and authentication</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Comprehensive audit logging of system access and changes</li>
              <li>Incident response procedures and protocols</li>
              <li>Employee training on data protection and security</li>
              <li>Physical security measures for data centers</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              While we strive to protect your personal data, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security of your data. You are responsible for maintaining the confidentiality of your account credentials and for any activity that occurs under your account.
            </p>
          </section>

          {/* Section 10 */}
          <section id="cookies" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">10. Cookies and Tracking Technologies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to collect and store information about your interactions with our Platform.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.1 Types of Cookies We Use</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Essential Cookies:</strong> Required for the Platform to function, including authentication, session management, and security features</li>
              <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our Platform</li>
              <li><strong>Third-Party Cookies:</strong> Set by our service providers (Stripe, Google) for payment processing and integrations</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.2 Managing Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              Most web browsers allow you to control cookies through their settings. However, disabling certain cookies may limit your ability to use some features of our Platform.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.3 Do Not Track</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our Platform does not currently respond to "Do Not Track" signals from browsers.
            </p>
          </section>

          {/* Section 11 */}
          <section id="children" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">11. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Platform is not intended for use by children under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe that your child has provided us with personal information, please contact us at privacy@hireflownow.com, and we will take steps to delete such information from our systems.
            </p>
          </section>

          {/* Section 12 */}
          <section id="ai-processing" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">12. AI and Automated Decision-Making</h2>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow uses artificial intelligence and machine learning technologies to provide various features, including candidate screening, resume analysis, interview evaluation, and shortlist generation.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.1 Transparency</h3>
            <p className="text-muted-foreground leading-relaxed">
              We are committed to transparency about our use of AI. Our AI-powered features are designed to assist employers in their hiring decisions, not to make final decisions automatically. All AI-generated scores, analyses, and recommendations are advisory in nature and should be reviewed by human decision-makers.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.2 Human Oversight</h3>
            <p className="text-muted-foreground leading-relaxed">
              Employers are responsible for reviewing AI-generated recommendations and making final hiring decisions. We strongly encourage employers to use AI insights as one factor among many in their evaluation process.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.3 Bias Mitigation</h3>
            <p className="text-muted-foreground leading-relaxed">
              We strive to minimize bias in our AI systems through careful design, regular testing, and ongoing monitoring. However, no AI system is perfect, and we cannot guarantee that our AI features are free from bias. Employers should exercise their own judgment and consider multiple factors in hiring decisions.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.4 Right to Contest</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you believe an automated decision has adversely affected you, you may contact us to request human review of the decision, express your point of view, and contest the outcome.
            </p>
          </section>

          {/* Section 13 */}
          <section id="california" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">13. California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA):
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.1 Categories of Personal Information Collected</h3>
            <p className="text-muted-foreground leading-relaxed">
              In the past 12 months, we have collected the following categories of personal information:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Identifiers:</strong> Name, email, phone number, IP address, account name</li>
              <li><strong>Personal Information Categories (Cal. Civ. Code § 1798.80(e)):</strong> Name, address, telephone number, employment history, education</li>
              <li><strong>Protected Classification Characteristics:</strong> Age (only to verify 18+)</li>
              <li><strong>Commercial Information:</strong> Subscription and purchase history</li>
              <li><strong>Biometric Information:</strong> Voice recordings (with consent)</li>
              <li><strong>Internet/Network Activity:</strong> Browsing history, Platform usage</li>
              <li><strong>Geolocation Data:</strong> Approximate location from IP, precise location during document signing</li>
              <li><strong>Sensory Data:</strong> Audio and video recordings</li>
              <li><strong>Professional/Employment Information:</strong> Employment history, job applications</li>
              <li><strong>Education Information:</strong> Educational history</li>
              <li><strong>Inferences:</strong> AI-generated profiles and predictions</li>
              <li><strong>Sensitive Personal Information:</strong> Account credentials, precise geolocation (during signing only)</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.2 Your California Rights</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Right to Know:</strong> Request disclosure of personal information collected, used, disclosed, and sold</li>
              <li><strong>Right to Delete:</strong> Request deletion of personal information (subject to exceptions)</li>
              <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information</li>
              <li><strong>Right to Opt-Out of Sale/Sharing:</strong> We do not sell personal information or share it for cross-context behavioral advertising</li>
              <li><strong>Right to Limit Use of Sensitive Personal Information:</strong> We only use sensitive personal information for disclosed purposes</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.3 Exercising Your California Rights</h3>
            <p className="text-muted-foreground leading-relaxed">
              To exercise your rights, please contact us at privacy@hireflownow.com or call [phone number]. We will verify your identity before processing your request. You may designate an authorized agent to make a request on your behalf.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.4 California "Shine the Light" Law</h3>
            <p className="text-muted-foreground leading-relaxed">
              California Civil Code Section 1798.83 permits California residents to request information regarding the disclosure of personal information to third parties for their direct marketing purposes. We do not share personal information with third parties for their direct marketing purposes.
            </p>
          </section>

          {/* Section 14 */}
          <section id="updates" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">14. Updates to This Privacy Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, legal requirements, or for other operational reasons. We will post any changes to this page and update the "Last Updated" date at the top of this Privacy Policy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              For material changes that significantly affect your privacy rights, we will provide additional notice, such as an email notification or a prominent notice on our Platform, prior to the change becoming effective.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Your continued use of our Platform after any changes to this Privacy Policy constitutes your acceptance of the updated policy. We encourage you to review this Privacy Policy periodically to stay informed about how we protect your information.
            </p>
          </section>

          {/* Section 15 */}
          <section id="contact" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">15. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions, concerns, or complaints about this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-muted/50 rounded-lg p-6 mt-4">
              <p className="text-foreground font-semibold mb-2">AEY Technologies LLC</p>
              <p className="text-muted-foreground">Operating as: HireFlow</p>
              <p className="text-muted-foreground">Email: privacy@hireflownow.com</p>
              <p className="text-muted-foreground">Website: https://hireflownow.com</p>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-4">
              For data subject access requests or to exercise your privacy rights, please email privacy@hireflownow.com with "Privacy Rights Request" in the subject line.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We will respond to all privacy inquiries and requests within the timeframes required by applicable law.
            </p>
          </section>

          {/* Footer */}
          <div className="border-t border-border pt-8 mt-12">
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} AEY Technologies LLC. All rights reserved. HireFlow is a trademark of AEY Technologies LLC.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Privacy;
