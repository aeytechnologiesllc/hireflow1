/**
 * generate-flow's parts as the writer finishes them (the owner's live run of
 * 2026-11-01: "when it was creating the job, it felt like it almost got stuck
 * because it was there for a very long time and the last process"). The
 * builder's "Building your hiring plan" walked six timed lines in four
 * seconds, then held the last one until the whole plan came back. Asked for
 * its parts (`progress: true`), generate-flow streams the model's answer and
 * says each top-level part of the plan as its value closes (the job post, the
 * form questions, the interview, the scorecard), so the screen shows real
 * progress.
 *
 * Pure, no Deno or browser API (scripts/generate_flow_parts.test.mjs).
 */

/**
 * Reads the text of an OpenAI chat-completions stream (server-sent events),
 * chunk by chunk, and hands on each piece of the answer's content. A line cut
 * between chunks waits for its end; a keep-alive or a line that is not JSON is
 * skipped.
 */
export function createSseContentReader(onContent: (text: string) => void): { push(chunk: string): void; end(): void } {
  let buf = "";
  const line = (raw: string) => {
    const t = raw.trim();
    if (!t.startsWith("data:")) return;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const content = JSON.parse(data)?.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content) onContent(content);
    } catch {
      /* not a JSON line: skipped */
    }
  };
  return {
    push(chunk: string) {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    },
    end() {
      if (buf) line(buf);
      buf = "";
    },
  };
}

/**
 * Watches a JSON object arrive in pieces and calls `onPart(key)` once for each
 * top-level key, the moment its value is complete (an object or a list when it
 * closes, a string at its closing quote, a number or a word at the comma or
 * brace after it). Strings are read with their escapes, so a brace or a quote
 * inside the job post's words is never taken for the end of a part.
 */
export function createJsonPartScanner(onPart: (key: string) => void): { push(chunk: string): void } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let readingKey = false;
  let expectKey = false;
  let key = "";
  let pendingKey: string | null = null;
  let valueKey: string | null = null;
  const seen = new Set<string>();
  const done = () => {
    if (valueKey !== null && !seen.has(valueKey)) {
      seen.add(valueKey);
      onPart(valueKey);
    }
    valueKey = null;
  };
  return {
    push(chunk: string) {
      for (const ch of chunk) {
        if (inString) {
          if (escaped) {
            escaped = false;
            if (readingKey) key += ch;
          } else if (ch === "\\") {
            escaped = true;
            if (readingKey) key += ch;
          } else if (ch === '"') {
            inString = false;
            if (readingKey) {
              readingKey = false;
              pendingKey = key;
            } else if (depth === 1 && valueKey !== null) {
              done();
            }
          } else if (readingKey) {
            key += ch;
          }
          continue;
        }
        switch (ch) {
          case '"':
            inString = true;
            if (depth === 1 && expectKey && valueKey === null) {
              readingKey = true;
              expectKey = false;
              key = "";
            }
            break;
          case ":":
            if (depth === 1 && pendingKey !== null) {
              valueKey = pendingKey;
              pendingKey = null;
            }
            break;
          case "{":
          case "[":
            depth += 1;
            if (depth === 1) expectKey = true;
            break;
          case "}":
          case "]":
            depth -= 1;
            if (depth <= 1 && valueKey !== null) done();
            break;
          case ",":
            if (depth === 1) {
              if (valueKey !== null) done();
              expectKey = true;
            }
            break;
          default:
            break;
        }
      }
    },
  };
}
