import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { usePageHead } from "@/components/seo/usePageHead";
import { isStaffHost } from "@/lib/hosts";
import { openRolesPath } from "@/lib/openRoles";

const NotFound = () => {
  const location = useLocation();
  // The app answers every address with 200, so this page tells search engines
  // itself that there is nothing here to list.
  usePageHead({ title: "Page not found", noindex: true });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="dark flex min-h-[100dvh] items-center justify-center bg-[hsl(220,18%,10%)] text-white">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        {/* An applicant who followed a broken link wants the open roles, not
            HireFlow's landing page; the hiring team wants home. */}
        <a href={isStaffHost() ? "/" : openRolesPath()} className="text-primary underline hover:text-primary/90">
          {isStaffHost() ? "Return to Home" : "See open roles"}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
