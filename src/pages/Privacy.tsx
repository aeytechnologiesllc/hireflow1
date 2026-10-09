import { LegalPage } from "@/components/LegalPage";
import { PRIVACY_POLICY } from "@/content/legal";

/** The Privacy Policy. Its words are src/content/legal.ts (docs/LEGAL-PAGES.md). */
const Privacy = () => <LegalPage document={PRIVACY_POLICY} other={{ label: "Terms and Conditions", to: "/terms" }} />;

export default Privacy;
