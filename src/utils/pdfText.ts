import { pdfjs } from "react-pdf";

// Ensure worker is configured (react-pdf requires this for reliable parsing)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export async function extractPdfTextFromUrl(url: string): Promise<{ text: string; extracted: boolean }>{
  try {
    const doc = await pdfjs.getDocument({ url }).promise;
    let text = "";

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
          .join(" ") +
        "\n";
    }

    text = text.trim();
    return { text, extracted: text.length >= 100 };
  } catch {
    return { text: "", extracted: false };
  }
}
