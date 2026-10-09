import { LegalPage } from "@/components/LegalPage";
import { TERMS } from "@/content/legal";

/** The Terms and Conditions. Their words are src/content/legal.ts (docs/LEGAL-PAGES.md). */
const Terms = () => <LegalPage document={TERMS} other={{ label: "Privacy Policy", to: "/privacy" }} />;

export default Terms;
