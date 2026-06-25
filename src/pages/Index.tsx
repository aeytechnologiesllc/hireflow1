import { useEffect } from "react";

export default function Index() {
  useEffect(() => {
    const iframe = document.getElementById("landing-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = "/landing.html";
    }
  }, []);

  return (
    <iframe
      id="landing-iframe"
      src="/landing.html"
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 50,
      }}
      title="Hireflow Landing Page"
    />
  );
}
