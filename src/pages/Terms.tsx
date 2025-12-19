import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
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
          <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last Updated: December 19, 2024</p>

          {/* Table of Contents */}
          <div className="bg-muted/50 rounded-lg p-6 mb-12">
            <h2 className="text-xl font-semibold text-foreground mt-0 mb-4">Table of Contents</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li><a href="#acceptance" className="text-primary hover:underline">Acceptance of Terms</a></li>
              <li><a href="#description" className="text-primary hover:underline">Description of Services</a></li>
              <li><a href="#eligibility" className="text-primary hover:underline">Eligibility and Account Registration</a></li>
              <li><a href="#subscriptions" className="text-primary hover:underline">Subscription Plans and Billing</a></li>
              <li><a href="#employer-responsibilities" className="text-primary hover:underline">Employer Responsibilities</a></li>
              <li><a href="#candidate-responsibilities" className="text-primary hover:underline">Candidate Responsibilities</a></li>
              <li><a href="#prohibited-uses" className="text-primary hover:underline">Prohibited Uses</a></li>
              <li><a href="#ai-features" className="text-primary hover:underline">AI-Powered Features</a></li>
              <li><a href="#intellectual-property" className="text-primary hover:underline">Intellectual Property Rights</a></li>
              <li><a href="#e-signature" className="text-primary hover:underline">Electronic Signatures and Documents</a></li>
              <li><a href="#third-party" className="text-primary hover:underline">Third-Party Services and Integrations</a></li>
              <li><a href="#disclaimers" className="text-primary hover:underline">Disclaimers and Warranties</a></li>
              <li><a href="#limitation" className="text-primary hover:underline">Limitation of Liability</a></li>
              <li><a href="#indemnification" className="text-primary hover:underline">Indemnification</a></li>
              <li><a href="#dispute" className="text-primary hover:underline">Dispute Resolution and Arbitration</a></li>
              <li><a href="#termination" className="text-primary hover:underline">Termination</a></li>
              <li><a href="#modifications" className="text-primary hover:underline">Modifications to Terms</a></li>
              <li><a href="#general" className="text-primary hover:underline">General Provisions</a></li>
              <li><a href="#contact" className="text-primary hover:underline">Contact Information</a></li>
            </ol>
          </div>

          {/* Section 1 */}
          <section id="acceptance" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              Welcome to HireFlow. These Terms of Service ("Terms," "Agreement") constitute a legally binding agreement between you ("User," "you," or "your") and AEY Technologies LLC ("Company," "HireFlow," "we," "us," or "our"), governing your access to and use of the HireFlow website located at hireflownow.com (the "Site"), our web-based application, mobile applications, and all related services (collectively, the "Platform" or "Services").
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>PLEASE READ THESE TERMS CAREFULLY BEFORE USING OUR SERVICES. BY ACCESSING OR USING THE PLATFORM, CREATING AN ACCOUNT, OR CLICKING "I AGREE" OR SIMILAR BUTTON, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS AND OUR PRIVACY POLICY, WHICH IS INCORPORATED HEREIN BY REFERENCE.</strong>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>IMPORTANT: THESE TERMS CONTAIN A BINDING ARBITRATION CLAUSE AND CLASS ACTION WAIVER IN SECTION 15, WHICH AFFECT YOUR LEGAL RIGHTS. PLEASE READ THEM CAREFULLY.</strong>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If you do not agree to these Terms, you must not access or use our Services. If you are accessing or using the Services on behalf of a company, organization, or other entity, you represent and warrant that you have the authority to bind such entity to these Terms, and "you" and "your" shall refer to both you individually and such entity.
            </p>
          </section>

          {/* Section 2 */}
          <section id="description" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">2. Description of Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow is an AI-powered hiring and recruitment platform that provides tools and services to streamline the hiring process for employers and job seekers. Our Services include, but are not limited to:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.1 For Employers</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Job posting creation and management with AI-assisted content generation</li>
              <li>Customizable hiring workflows with multiple assessment stages</li>
              <li>AI-powered candidate screening, scoring, and shortlisting</li>
              <li>Voice and video interview features with AI analysis</li>
              <li>Chat interviews and sales simulation assessments</li>
              <li>Typing tests, quizzes, and skill assessments</li>
              <li>Portfolio upload and AI-powered portfolio review</li>
              <li>Document generation, management, and electronic signature capabilities</li>
              <li>Team collaboration tools with customizable permissions</li>
              <li>Candidate messaging and communication tools</li>
              <li>Interview scheduling with calendar integrations</li>
              <li>Analytics and reporting dashboards</li>
              <li>Candidate pipeline management</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">2.2 For Candidates</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Job search and application submission</li>
              <li>Profile and resume management</li>
              <li>Completion of various assessment types (quizzes, typing tests, video introductions)</li>
              <li>Participation in AI-powered interviews (voice, chat, sales simulation)</li>
              <li>Portfolio submission and management</li>
              <li>Document review and electronic signature</li>
              <li>Interview scheduling and management</li>
              <li>Messaging with potential employers</li>
              <li>Application status tracking</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed mt-6">
              We reserve the right to modify, suspend, or discontinue any aspect of our Services at any time, with or without notice. We may also impose limits on certain features or restrict access to parts or all of the Services without notice or liability.
            </p>
          </section>

          {/* Section 3 */}
          <section id="eligibility" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">3. Eligibility and Account Registration</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.1 Eligibility Requirements</h3>
            <p className="text-muted-foreground leading-relaxed">
              To use our Services, you must:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Be at least 18 years of age</li>
              <li>Have the legal capacity to enter into a binding agreement</li>
              <li>Not be prohibited from using the Services under applicable law</li>
              <li>If registering on behalf of an organization, have the authority to bind that organization to these Terms</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.2 Account Registration</h3>
            <p className="text-muted-foreground leading-relaxed">
              To access certain features of our Services, you must register for an account. When registering, you agree to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and accept all risks of unauthorized access</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.3 Account Types</h3>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow offers different account types with different capabilities:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Employer Accounts:</strong> For companies and individuals who wish to post jobs and hire candidates</li>
              <li><strong>Candidate Accounts:</strong> For individuals seeking employment opportunities</li>
              <li><strong>Team Member Accounts:</strong> For individuals invited by employers to collaborate on hiring</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">3.4 Account Security</h3>
            <p className="text-muted-foreground leading-relaxed">
              You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify us of any unauthorized use of your account or any other breach of security. We will not be liable for any loss or damage arising from your failure to comply with this security obligation.
            </p>
          </section>

          {/* Section 4 */}
          <section id="subscriptions" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">4. Subscription Plans and Billing</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.1 Subscription Tiers</h3>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow offers various subscription plans for employers, including but not limited to Trial, Growth, Business, and Enterprise tiers. Each tier provides different features, usage limits, and capabilities as described on our pricing page. We reserve the right to modify our subscription offerings at any time.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.2 Free Trial</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may offer a free trial period for new users. Upon expiration of the trial period, you will be required to select a paid subscription plan to continue using premium features. We reserve the right to modify or discontinue free trials at any time.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.3 Billing and Payment</h3>
            <p className="text-muted-foreground leading-relaxed">
              By subscribing to a paid plan, you agree to pay all applicable fees. Payment is processed through our third-party payment processor, Stripe, Inc. By providing payment information, you represent that you are authorized to use the payment method and authorize us to charge the applicable fees.
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Subscription fees are billed in advance on a recurring basis (monthly or annually)</li>
              <li>All fees are non-refundable except as expressly stated in these Terms</li>
              <li>You are responsible for all applicable taxes</li>
              <li>Failure to pay may result in suspension or termination of your account</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.4 Automatic Renewal</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>YOUR SUBSCRIPTION WILL AUTOMATICALLY RENEW AT THE END OF EACH BILLING PERIOD UNLESS YOU CANCEL IT BEFORE THE RENEWAL DATE.</strong> You may cancel your subscription at any time through your account settings. Cancellation will take effect at the end of the current billing period, and you will continue to have access to paid features until then.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.5 Voice Credits</h3>
            <p className="text-muted-foreground leading-relaxed">
              Certain features, such as AI-powered voice interviews, may require voice credits. Voice credits may be included in your subscription plan or purchased separately. Voice credits:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Have an expiration date as specified at the time of purchase or grant</li>
              <li>Are non-transferable and non-refundable</li>
              <li>May not be exchanged for cash or other value</li>
              <li>Will be deducted based on actual usage of voice features</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.6 Price Changes</h3>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to change our subscription prices at any time. Price changes will take effect at the beginning of the next billing cycle following notice to you. If you do not agree to the price change, you may cancel your subscription before it takes effect.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">4.7 Refund Policy</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>ALL FEES ARE NON-REFUNDABLE EXCEPT WHERE REQUIRED BY LAW.</strong> We do not provide refunds or credits for any partial subscription periods, unused voice credits, or unused features. In exceptional circumstances, we may consider refund requests on a case-by-case basis at our sole discretion.
            </p>
          </section>

          {/* Section 5 */}
          <section id="employer-responsibilities" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">5. Employer Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you use our Services as an employer, you agree to the following additional terms and responsibilities:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.1 Lawful Job Postings</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree that all job postings will:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Be for actual, legitimate employment opportunities</li>
              <li>Accurately describe the position, requirements, and compensation</li>
              <li>Comply with all applicable employment laws and regulations</li>
              <li>Not contain false, misleading, or deceptive information</li>
              <li>Not be used for any illegal purpose</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.2 Non-Discrimination</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree to comply with all applicable anti-discrimination laws, including but not limited to Title VII of the Civil Rights Act of 1964, the Age Discrimination in Employment Act, the Americans with Disabilities Act, and similar state and local laws. You shall not discriminate against any candidate on the basis of race, color, religion, sex, sexual orientation, gender identity, national origin, age, disability, genetic information, veteran status, or any other protected characteristic.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.3 Employment Law Compliance</h3>
            <p className="text-muted-foreground leading-relaxed">
              You are solely responsible for ensuring that your hiring practices, including the use of our AI-powered features, comply with all applicable employment laws and regulations. This includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Equal Employment Opportunity Commission (EEOC) guidelines</li>
              <li>Fair Credit Reporting Act (FCRA) requirements</li>
              <li>State and local hiring laws and ban-the-box legislation</li>
              <li>Immigration and work authorization verification requirements</li>
              <li>Wage and hour laws</li>
              <li>Any applicable AI hiring law regulations (e.g., NYC Local Law 144)</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.4 Team Member Management</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you invite team members to your account, you are responsible for:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Ensuring they comply with these Terms</li>
              <li>Managing their access permissions appropriately</li>
              <li>Revoking access when team members leave your organization</li>
              <li>Any actions taken by team members under your account</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.5 Document Accuracy</h3>
            <p className="text-muted-foreground leading-relaxed">
              You are solely responsible for the accuracy and legality of any documents you create, send, or have signed through our Platform, including offer letters, employment agreements, and other HR documents. We strongly recommend having legal counsel review all documents before use.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">5.6 Candidate Data Handling</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree to handle all candidate data in accordance with applicable privacy laws and our Privacy Policy. You shall not use candidate information for any purpose other than evaluating candidates for employment with your organization.
            </p>
          </section>

          {/* Section 6 */}
          <section id="candidate-responsibilities" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">6. Candidate Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you use our Services as a job candidate, you agree to the following:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.1 Truthful Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree to provide accurate, truthful, and complete information in your profile, applications, and assessments. This includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Accurate representation of your work history and experience</li>
              <li>Truthful educational credentials and certifications</li>
              <li>Honest responses to interview and assessment questions</li>
              <li>Authentic portfolio materials and work samples</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.2 No Fraudulent Credentials</h3>
            <p className="text-muted-foreground leading-relaxed">
              You shall not misrepresent your qualifications, fabricate credentials, or provide false references. Doing so may result in immediate termination of your account and may have legal consequences.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.3 Professional Conduct</h3>
            <p className="text-muted-foreground leading-relaxed">
              You agree to communicate professionally and respectfully with employers and their representatives. Harassment, threats, or abusive behavior will not be tolerated.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">6.4 Assessment Integrity</h3>
            <p className="text-muted-foreground leading-relaxed">
              When completing assessments, you agree to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Complete all assessments independently unless otherwise instructed</li>
              <li>Not use unauthorized assistance, materials, or AI tools</li>
              <li>Not share assessment content with others</li>
              <li>Not attempt to circumvent or manipulate assessment systems</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section id="prohibited-uses" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">7. Prohibited Uses</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to use our Services for any of the following prohibited purposes:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.1 Illegal Activities</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Any activity that violates any applicable law or regulation</li>
              <li>Fraud, money laundering, or other financial crimes</li>
              <li>Human trafficking or labor exploitation</li>
              <li>Collection of information for unlawful purposes</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.2 Harmful Content and Behavior</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Posting discriminatory, harassing, or abusive content</li>
              <li>Threatening or intimidating other users</li>
              <li>Posting sexually explicit or violent content</li>
              <li>Impersonating another person or entity</li>
              <li>Stalking or harassing candidates or employers</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.3 Platform Abuse</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Attempting to gain unauthorized access to our systems</li>
              <li>Circumventing security measures or access controls</li>
              <li>Using automated scripts, bots, or scrapers without authorization</li>
              <li>Interfering with or disrupting the Platform or servers</li>
              <li>Reverse engineering, decompiling, or disassembling our software</li>
              <li>Introducing viruses, malware, or other harmful code</li>
              <li>Overloading our infrastructure through excessive requests</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.4 Data Misuse</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Scraping or harvesting user data without consent</li>
              <li>Selling, sharing, or misusing candidate or employer information</li>
              <li>Using data for purposes other than legitimate hiring activities</li>
              <li>Violating the privacy rights of other users</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">7.5 Spam and Unauthorized Communications</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Sending unsolicited bulk messages</li>
              <li>Using the Platform for unauthorized advertising or marketing</li>
              <li>Creating multiple accounts to circumvent restrictions</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section id="ai-features" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">8. AI-Powered Features</h2>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow incorporates artificial intelligence and machine learning technologies throughout the Platform. By using these features, you acknowledge and agree to the following:
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.1 AI as Assistive Tool</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>AI-POWERED FEATURES ARE DESIGNED TO ASSIST AND AUGMENT HUMAN DECISION-MAKING, NOT TO REPLACE IT.</strong> All AI-generated scores, analyses, recommendations, and shortlists are advisory in nature. Employers are solely responsible for making final hiring decisions and must exercise their own judgment.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.2 No Guarantee of Accuracy</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>WE DO NOT GUARANTEE THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY AI-GENERATED OUTPUT.</strong> AI systems may produce errors, biases, or unexpected results. You should always verify AI-generated content and not rely solely on automated assessments.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.3 Human Review Requirement</h3>
            <p className="text-muted-foreground leading-relaxed">
              We strongly recommend that employers review all AI-generated recommendations and conduct human evaluation before making hiring decisions. The use of AI screening does not eliminate the need for human judgment and due diligence.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.4 Bias Mitigation</h3>
            <p className="text-muted-foreground leading-relaxed">
              While we strive to design our AI systems to minimize bias and promote fair outcomes, no AI system is perfect. We cannot guarantee that our AI features are free from bias, and users should be aware of this limitation. We encourage employers to use AI insights as one factor among many in their evaluation process.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.5 AI Training and Improvement</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may use aggregated and anonymized data to improve our AI models and algorithms. This helps us enhance the accuracy and fairness of our AI-powered features over time.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">8.6 Regulatory Compliance</h3>
            <p className="text-muted-foreground leading-relaxed">
              Employers are responsible for ensuring that their use of AI-powered hiring tools complies with applicable laws and regulations, including any local AI hiring laws (such as NYC Local Law 144) that may require bias audits, candidate notifications, or other compliance measures.
            </p>
          </section>

          {/* Section 9 */}
          <section id="intellectual-property" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">9. Intellectual Property Rights</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">9.1 HireFlow Intellectual Property</h3>
            <p className="text-muted-foreground leading-relaxed">
              The Platform and all content, features, and functionality (including but not limited to all information, software, text, displays, images, video, audio, design, selection, and arrangement) are owned by AEY Technologies LLC, its licensors, or other providers and are protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              HireFlow, the HireFlow logo, and related names, logos, product and service names, designs, and slogans are trademarks of AEY Technologies LLC. You must not use such marks without our prior written permission.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">9.2 User Content</h3>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of all intellectual property rights in the content you upload, post, or otherwise make available through the Platform ("User Content"), including resumes, cover letters, job postings, documents, and other materials.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">9.3 License Grant to HireFlow</h3>
            <p className="text-muted-foreground leading-relaxed">
              By uploading or submitting User Content to the Platform, you grant HireFlow a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, reproduce, modify, adapt, publish, translate, create derivative works from, distribute, perform, and display such User Content in connection with providing and improving the Services.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              This license includes the right to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Process your content through AI systems for screening and analysis</li>
              <li>Store your content on our servers and those of our service providers</li>
              <li>Display your content to relevant employers or candidates as part of the hiring process</li>
              <li>Use aggregated and anonymized data derived from your content for analytics and service improvement</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">9.4 Content Representations</h3>
            <p className="text-muted-foreground leading-relaxed">
              You represent and warrant that you own or have the necessary rights to all User Content you submit, and that your User Content does not infringe the intellectual property rights or other rights of any third party.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">9.5 DMCA Compliance</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you believe that any content on our Platform infringes your copyright, please contact us at legal@hireflownow.com with a notice that includes all elements required under the Digital Millennium Copyright Act.
            </p>
          </section>

          {/* Section 10 */}
          <section id="e-signature" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">10. Electronic Signatures and Documents</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.1 Legal Validity</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our electronic signature features are designed to comply with the Electronic Signatures in Global and National Commerce Act (E-SIGN Act), the Uniform Electronic Transactions Act (UETA), and other applicable electronic signature laws. Documents signed electronically through our Platform are intended to be legally binding and enforceable.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.2 Consent to Electronic Transactions</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>BY USING OUR ELECTRONIC SIGNATURE FEATURES, YOU CONSENT TO CONDUCTING TRANSACTIONS ELECTRONICALLY AND TO THE ELECTRONIC DELIVERY OF ALL DOCUMENTS, NOTICES, AND RECORDS.</strong> You acknowledge that your electronic signature has the same legal effect as a handwritten signature.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.3 Audit Trails</h3>
            <p className="text-muted-foreground leading-relaxed">
              We maintain comprehensive audit trails for all documents signed through our Platform, including timestamps, IP addresses, geographic location data, and device information. These audit trails are designed to provide evidence of the signing process and document integrity.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.4 Document Integrity</h3>
            <p className="text-muted-foreground leading-relaxed">
              We use cryptographic hashing to ensure document integrity. However, you are responsible for verifying that documents are accurate and complete before signing.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.5 No Legal Advice</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>HIREFLOW IS NOT A LAW FIRM AND DOES NOT PROVIDE LEGAL ADVICE.</strong> The documents and templates available through our Platform are provided for informational purposes only. We strongly recommend that you consult with qualified legal counsel before using any document for employment or contractual purposes.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">10.6 User Responsibility</h3>
            <p className="text-muted-foreground leading-relaxed">
              You are solely responsible for ensuring that any documents you create or sign through our Platform comply with applicable laws and are suitable for your specific situation. HireFlow is not responsible for the content, accuracy, or enforceability of any documents.
            </p>
          </section>

          {/* Section 11 */}
          <section id="third-party" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">11. Third-Party Services and Integrations</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">11.1 Third-Party Services</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our Platform integrates with and relies on various third-party services, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong>Stripe, Inc.:</strong> For payment processing</li>
              <li><strong>Google:</strong> For calendar integration and authentication</li>
              <li><strong>AI/LLM Providers:</strong> For natural language processing and analysis</li>
              <li><strong>ElevenLabs:</strong> For text-to-speech services</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Your use of these third-party services is subject to their respective terms of service and privacy policies.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">11.2 Google Calendar Integration</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you connect your Google Calendar to our Platform, you authorize us to access and modify your calendar as necessary to schedule and manage interviews. This access is governed by Google's Terms of Service and API Services User Data Policy.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">11.3 Third-Party Links</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our Platform may contain links to third-party websites or services. We do not control and are not responsible for the content, privacy policies, or practices of any third-party websites or services. You access third-party links at your own risk.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">11.4 No Endorsement</h3>
            <p className="text-muted-foreground leading-relaxed">
              The inclusion of any third-party links or integrations does not imply endorsement or affiliation with such third parties. We are not responsible for any damages or losses arising from your use of third-party services.
            </p>
          </section>

          {/* Section 12 */}
          <section id="disclaimers" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">12. Disclaimers and Warranties</h2>
            <p className="text-muted-foreground leading-relaxed uppercase font-semibold">
              THE FOLLOWING DISCLAIMERS ARE IMPORTANT LIMITATIONS ON YOUR RIGHTS. PLEASE READ THEM CAREFULLY.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.1 "As Is" and "As Available" Basis</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>THE PLATFORM AND ALL SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</strong> TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.2 No Warranty of Continuous Service</h3>
            <p className="text-muted-foreground leading-relaxed">
              We do not warrant that the Platform will be uninterrupted, timely, secure, or error-free, that defects will be corrected, or that the Platform or the servers that make it available are free of viruses or other harmful components.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.3 No Warranty of Results</h3>
            <p className="text-muted-foreground leading-relaxed">
              We do not warrant or make any representations regarding the accuracy, reliability, or quality of any content, information, or results obtained through the Platform. Your use of the Platform and any content or services obtained through it is at your own risk.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.4 No Employment Guarantee</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>HIREFLOW DOES NOT GUARANTEE THAT YOU WILL FIND EMPLOYMENT OR HIRE SUITABLE CANDIDATES.</strong> We are a platform that facilitates the hiring process, but we are not an employment agency and do not guarantee any employment outcomes.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">12.5 User Interactions</h3>
            <p className="text-muted-foreground leading-relaxed">
              We are not responsible for the conduct of any user, whether online or offline. We do not verify the qualifications, backgrounds, or identities of users and make no representations or warranties regarding users or their content.
            </p>
          </section>

          {/* Section 13 */}
          <section id="limitation" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">13. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed uppercase font-semibold">
              PLEASE READ THIS SECTION CAREFULLY AS IT LIMITS OUR LIABILITY TO YOU.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.1 Exclusion of Certain Damages</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL HIREFLOW, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, PARTNERS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</strong>
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.2 Cap on Liability</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF THE PLATFORM SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU HAVE PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100).</strong>
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.3 Specific Exclusions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Without limiting the foregoing, we shall not be liable for:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Any hiring decisions made based on information from our Platform</li>
              <li>Any errors, inaccuracies, or omissions in AI-generated content or analyses</li>
              <li>The conduct or content of any user</li>
              <li>Any unauthorized access to or alteration of your data</li>
              <li>Any interruption or cessation of our Services</li>
              <li>Any loss or damage resulting from documents signed through our Platform</li>
              <li>Any disputes between employers and candidates</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.4 Force Majeure</h3>
            <p className="text-muted-foreground leading-relaxed">
              We shall not be liable for any failure or delay in performance resulting from causes beyond our reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, riots, pandemics, government actions, power failures, or Internet disruptions.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">13.5 Jurisdictional Limitations</h3>
            <p className="text-muted-foreground leading-relaxed">
              Some jurisdictions do not allow the exclusion or limitation of certain warranties or liability for consequential or incidental damages. In such jurisdictions, our liability shall be limited to the maximum extent permitted by law.
            </p>
          </section>

          {/* Section 14 */}
          <section id="indemnification" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">14. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              <strong>YOU AGREE TO DEFEND, INDEMNIFY, AND HOLD HARMLESS HIREFLOW, ITS PARENT, SUBSIDIARIES, AFFILIATES, DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, PARTNERS, CONTRACTORS, AND LICENSORS</strong> from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including but not limited to attorneys' fees) arising from:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Your use of and access to the Platform</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any applicable law or regulation</li>
              <li>Your violation of any rights of a third party, including intellectual property, privacy, or employment rights</li>
              <li>Any content you upload, post, or transmit through the Platform</li>
              <li>Your hiring practices or employment decisions</li>
              <li>Any documents you create or sign through the Platform</li>
              <li>Any claim by a candidate, employer, or third party arising from your use of the Services</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We reserve the right, at your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify us, and you agree to cooperate with our defense of such claims. You agree not to settle any matter without our prior written consent.
            </p>
          </section>

          {/* Section 15 */}
          <section id="dispute" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">15. Dispute Resolution and Arbitration</h2>
            <p className="text-muted-foreground leading-relaxed uppercase font-semibold">
              PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS, INCLUDING YOUR RIGHT TO FILE A LAWSUIT IN COURT AND TO HAVE A JURY HEAR YOUR CLAIMS.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.1 Informal Resolution</h3>
            <p className="text-muted-foreground leading-relaxed">
              Before initiating any arbitration or court proceeding, you agree to first contact us at legal@hireflownow.com and attempt to resolve the dispute informally. If the dispute is not resolved within thirty (30) days, either party may proceed with formal dispute resolution.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.2 Binding Arbitration</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>EXCEPT FOR DISPUTES THAT QUALIFY FOR SMALL CLAIMS COURT, ALL DISPUTES ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF THE PLATFORM SHALL BE RESOLVED THROUGH BINDING ARBITRATION.</strong> Arbitration shall be conducted by a single arbitrator in accordance with the American Arbitration Association's Consumer Arbitration Rules.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.3 CLASS ACTION WAIVER</h3>
            <p className="text-muted-foreground leading-relaxed">
              <strong>YOU AND HIREFLOW AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING.</strong> Unless both you and HireFlow agree otherwise, the arbitrator may not consolidate more than one person's claims and may not otherwise preside over any form of a representative or class proceeding.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.4 Arbitration Location and Fees</h3>
            <p className="text-muted-foreground leading-relaxed">
              Arbitration shall take place in the State of Delaware, or at another mutually agreed location. The arbitration fees will be governed by the AAA's rules, but we will pay all arbitration fees for claims of less than $10,000 unless the arbitrator determines your claims are frivolous.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.5 Exceptions to Arbitration</h3>
            <p className="text-muted-foreground leading-relaxed">
              Either party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement, misappropriation, or violation of intellectual property rights. Claims that qualify for small claims court may be brought in small claims court.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.6 Governing Law</h3>
            <p className="text-muted-foreground leading-relaxed">
              These Terms and any dispute arising out of or relating to them shall be governed by the laws of the State of Delaware, without regard to its conflict of law provisions. This choice of law provision is only intended to specify the use of Delaware law to interpret these Terms.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">15.7 Opt-Out Right</h3>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to opt out of this arbitration agreement by sending written notice of your decision to opt out to legal@hireflownow.com within thirty (30) days of first accepting these Terms. Your notice must include your name, address, email address, and a clear statement that you wish to opt out of this arbitration agreement.
            </p>
          </section>

          {/* Section 16 */}
          <section id="termination" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">16. Termination</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">16.1 Termination by You</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may terminate your account at any time by following the instructions in your account settings or by contacting us at support@hireflownow.com. Termination of your account does not entitle you to any refund of fees paid.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">16.2 Termination by HireFlow</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may suspend or terminate your account and access to the Services at any time, with or without cause, and with or without notice, including if we reasonably believe that:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>You have violated these Terms</li>
              <li>You have engaged in fraudulent or illegal activity</li>
              <li>Your continued use poses a risk to other users or our Platform</li>
              <li>We are required to do so by law</li>
              <li>We discontinue our Services</li>
            </ul>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">16.3 Effect of Termination</h3>
            <p className="text-muted-foreground leading-relaxed">
              Upon termination:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Your right to access and use the Platform will immediately cease</li>
              <li>You remain responsible for any fees incurred prior to termination</li>
              <li>We may retain your data as required by law or for legitimate business purposes</li>
              <li>Provisions that by their nature should survive termination will survive, including ownership provisions, warranty disclaimers, indemnification, and limitations of liability</li>
            </ul>
          </section>

          {/* Section 17 */}
          <section id="modifications" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">17. Modifications to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. If we make material changes, we will notify you by email or by posting a notice on the Platform prior to the changes becoming effective. The "Last Updated" date at the top of these Terms indicates when they were last revised.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>YOUR CONTINUED USE OF THE PLATFORM AFTER ANY CHANGES TO THESE TERMS CONSTITUTES YOUR ACCEPTANCE OF THE REVISED TERMS.</strong> If you do not agree to the revised Terms, you must stop using the Platform before the changes become effective.
            </p>
          </section>

          {/* Section 18 */}
          <section id="general" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">18. General Provisions</h2>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.1 Entire Agreement</h3>
            <p className="text-muted-foreground leading-relaxed">
              These Terms, together with our Privacy Policy and any other policies or guidelines referenced herein, constitute the entire agreement between you and HireFlow regarding your use of the Platform and supersede all prior agreements and understandings.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.2 Severability</h3>
            <p className="text-muted-foreground leading-relaxed">
              If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving the parties' intent.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.3 Waiver</h3>
            <p className="text-muted-foreground leading-relaxed">
              Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an authorized representative of HireFlow.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.4 Assignment</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may not assign or transfer these Terms or your rights and obligations hereunder without our prior written consent. We may assign these Terms without restriction. These Terms shall be binding upon and inure to the benefit of the parties' successors and permitted assigns.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.5 No Agency Relationship</h3>
            <p className="text-muted-foreground leading-relaxed">
              Nothing in these Terms creates any agency, partnership, joint venture, or employment relationship between you and HireFlow. Neither party has the authority to bind the other or to incur obligations on behalf of the other.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.6 Notices</h3>
            <p className="text-muted-foreground leading-relaxed">
              We may provide notices to you through the Platform, by email to the address associated with your account, or by other reasonable means. You agree that electronic notices have the same legal effect as written notices. Notices to us should be sent to legal@hireflownow.com.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.7 Headings</h3>
            <p className="text-muted-foreground leading-relaxed">
              The section headings in these Terms are for convenience only and have no legal or contractual effect.
            </p>

            <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">18.8 Language</h3>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are written in English. Any translated versions are provided for convenience only. In case of conflict, the English version shall prevail.
            </p>
          </section>

          {/* Section 19 */}
          <section id="contact" className="mb-12">
            <h2 className="text-2xl font-bold text-foreground border-b border-border pb-2">19. Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions, concerns, or feedback regarding these Terms of Service, please contact us:
            </p>
            <div className="bg-muted/50 rounded-lg p-6 mt-4">
              <p className="text-foreground font-semibold mb-2">AEY Technologies LLC</p>
              <p className="text-muted-foreground">Operating as: HireFlow</p>
              <p className="text-muted-foreground">Email: legal@hireflownow.com</p>
              <p className="text-muted-foreground">Support: support@hireflownow.com</p>
              <p className="text-muted-foreground">Website: https://hireflownow.com</p>
            </div>
            <p className="text-muted-foreground leading-relaxed mt-4">
              For legal notices, please email legal@hireflownow.com with "Legal Notice" in the subject line.
            </p>
          </section>

          {/* Acknowledgment */}
          <section className="mb-12">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
              <h2 className="text-xl font-bold text-foreground mt-0 mb-4">Acknowledgment</h2>
              <p className="text-muted-foreground leading-relaxed mb-0">
                BY USING THE HIREFLOW PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS OF SERVICE, UNDERSTOOD THEM, AND AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE TO THESE TERMS, YOU ARE NOT AUTHORIZED TO USE THE PLATFORM.
              </p>
            </div>
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

export default Terms;
