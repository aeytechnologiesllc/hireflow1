/*
 * The free job post writer at /blog/customer-service-job-post-writer
 * (scripts/build-blog.mjs, toolPage; docs/MARKETING.md). It runs only in the
 * visitor's browser: nothing typed here is sent anywhere. The shift is worked
 * out in Philippine time (UTC+8, no daylight saving) with the browser's own
 * time-zone data, for a winter and a summer day, so a business whose clocks
 * change sees both. scripts/job_post_writer.test.mjs runs these functions.
 */
(function () {
  "use strict";

  var MANILA = "Asia/Manila";
  var DAY = 86400000;

  var ZONES = {
    "America/New_York": "US Eastern time",
    "America/Chicago": "US Central time",
    "America/Denver": "US Mountain time",
    "America/Phoenix": "Arizona time",
    "America/Los_Angeles": "US Pacific time",
    "America/Toronto": "Toronto time",
    "Europe/London": "UK time",
    "Europe/Berlin": "Central European time",
    "Asia/Dubai": "UAE time",
    "Asia/Singapore": "Singapore time",
    "Australia/Perth": "Perth time",
    "Australia/Sydney": "Sydney time",
    "Pacific/Auckland": "New Zealand time",
    "Asia/Manila": "Philippine time",
  };

  var KINDS = {
    dental: {
      phrase: "a dental office",
      duties: [
        "Help patients book, move and cancel appointments.",
        "Answer questions about opening hours, forms, insurance and what to bring.",
        "Pass anything clinical to the dental team, with clear notes.",
      ],
    },
    medical: {
      phrase: "a medical office",
      duties: [
        "Help patients book and change appointments.",
        "Answer questions about opening hours, forms and billing.",
        "Pass anything medical to the clinical team, with clear notes.",
      ],
    },
    store: {
      phrase: "an online store",
      duties: [
        "Answer questions about orders, shipping, returns and refunds.",
        "Look up order details and keep customers updated.",
        "Handle unhappy customers calmly, and fix what you can.",
      ],
    },
    software: {
      phrase: "a software company",
      duties: [
        "Help customers with their accounts, logins and billing questions.",
        "Walk customers through common problems, step by step.",
        "Pass bugs to the product team with clear notes.",
      ],
    },
    home: {
      phrase: "a home services company",
      duties: [
        "Book and reschedule service visits.",
        "Answer questions about our services and the areas we cover.",
        "Keep customers updated when a visit runs late.",
      ],
    },
    other: {
      phrase: "",
      duties: [
        "Answer customer questions and solve what you can.",
        "Pass what you cannot solve to the right person, with clear notes.",
      ],
    },
  };

  var PRIVATE = {
    patient: "You will see patient records. Keep them private, use them only to help the patient, and follow our rules on what you may share.",
    orders: "You will see order and payment details. Keep them private, use them only to help the customer, and follow our rules on what you may share.",
    accounts: "You will see customer account details. Keep them private, use them only to help the customer, and follow our rules on what you may share.",
  };

  /** Minutes the zone is ahead of UTC at this moment. */
  function offsetMinutes(tz, ms) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    var v = {};
    for (var i = 0; i < parts.length; i++) v[parts[i].type] = parts[i].value;
    var asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }

  /** The moment a wall-clock time in the zone happens. */
  function wallToUtc(y, m, d, h, min, tz) {
    var guess = Date.UTC(y, m - 1, d, h, min);
    var off = offsetMinutes(tz, guess);
    var utc = guess - off * 60000;
    var off2 = offsetMinutes(tz, utc);
    return off2 === off ? utc : guess - off2 * 60000;
  }

  function clock(ms, tz) {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  }

  function hm(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return [+m[1], +m[2]];
  }

  /** A shift on one day in the zone, and in Philippine time. */
  function shiftOn(tz, y, mo, d, start, end) {
    var s = hm(start);
    var e = hm(end);
    if (!s || !e) return null;
    var a = wallToUtc(y, mo, d, s[0], s[1], tz);
    var endsNextDay = e[0] * 60 + e[1] <= s[0] * 60 + s[1];
    var b = wallToUtc(y, mo, d + (endsNextDay ? 1 : 0), e[0], e[1], tz);
    return { own: clock(a, tz) + " to " + clock(b, tz), ph: clock(a, MANILA) + " to " + clock(b, MANILA), off: offsetMinutes(tz, a) };
  }

  /**
   * The shift in both time zones. Where the business's clocks change, the
   * Philippine hours move by an hour: `dst` is during its daylight saving
   * time, `std` the rest of the year.
   */
  function manilaHours(tz, start, end, year) {
    var jan = shiftOn(tz, year, 1, 15, start, end);
    var jul = shiftOn(tz, year, 7, 15, start, end);
    if (!jan || !jul) return null;
    if (jan.off === jul.off) return { same: true, own: jan.own, ph: jan.ph };
    var dst = jan.off > jul.off ? jan : jul;
    var std = jan.off > jul.off ? jul : jan;
    return { same: false, own: std.own, dst: dst.ph, std: std.ph };
  }

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 120);
  }

  /** The post, as plain text, from the form's values. */
  function buildPost(f, year) {
    var channel = f.channel === "email" ? "email" : f.channel === "both" ? "both" : "chat";
    var label = { chat: "Chat", email: "Email", both: "Chat and Email" }[channel];
    var how = { chat: "live chat", email: "email", both: "live chat and email" }[channel];
    var kind = KINDS[f.kind] || KINDS.other;
    var phrase = f.kind === "other" || !KINDS[f.kind] ? clean(f.kindText, 80) : kind.phrase;
    var name = clean(f.business, 80);
    var about = clean(f.about, 240);
    var tz = ZONES[f.tz] ? f.tz : "America/New_York";
    var out = [];

    out.push("Customer Service Representative (" + label + "), Remote, " + (f.schedule === "part" ? "Part Time" : "Full Time"));
    out.push("");
    out.push("ABOUT US");
    var who = name || "We";
    var is = name ? " is " : " are ";
    var aboutLine = phrase ? who + is + phrase + "." + (about ? " " + about : "") : about || (name ? name + "." : "");
    if (aboutLine) out.push(aboutLine);
    out.push("We are hiring a remote customer service representative to help our customers by " + how + ".");
    out.push("");
    out.push("WHAT YOU WILL DO");
    var duties = kind.duties.slice();
    if (channel !== "email") {
      var at = Math.max(1, Math.min(4, parseInt(f.chats, 10) || 2));
      duties.push(at === 1 ? "Answer customers in live chat, one chat at a time." : "Answer customers in live chat, up to " + at + " chats at a time once you are trained.");
    }
    if (channel !== "chat") duties.push("Answer customer emails clearly and completely.");
    duties.push("Check before you answer, and ask when you are not sure.");
    for (var i = 0; i < duties.length; i++) out.push("- " + duties[i]);
    if (PRIVATE[f.privateInfo]) out.push("- " + PRIVATE[f.privateInfo]);
    out.push("");
    out.push("HOURS");
    var days = clean(f.days, 60) || "Monday to Friday";
    var hours = manilaHours(tz, f.start, f.end, year);
    if (!hours) out.push("- " + days + ". (Add the shift's start and end time.)");
    else if (tz === MANILA) out.push("- " + days + ", " + hours.own + " Philippine time.");
    else if (hours.same) out.push("- " + days + ", " + hours.own + " " + ZONES[tz] + " (" + hours.ph + " Philippine time).");
    else {
      out.push("- " + days + ", " + hours.own + " " + ZONES[tz] + ".");
      out.push("- That is " + hours.std + " Philippine time while our clocks are on standard time, and " + hours.dst + " Philippine time while they are on daylight saving time. The Philippines does not change its clocks.");
    }
    out.push("- " + (f.schedule === "part" ? "Part time." : "Full time."));
    out.push("");
    out.push("PAY");
    var amount = clean(f.pay, 20);
    if (amount) out.push("- " + (clean(f.currency, 3) || "USD") + " " + amount + (f.period === "hour" ? " an hour." : " a month.") + " The pay day and the payment method are agreed in writing before you start.");
    else out.push("- (Add the pay: the amount, the currency and how often you pay.)");
    out.push("");
    out.push("WHAT YOU NEED");
    var years = parseInt(f.experience, 10);
    if (years > 0) out.push("- At least " + years + (years === 1 ? " year" : " years") + " of customer service experience.");
    out.push("- Clear, friendly written English.");
    out.push("- Your own computer, a steady internet connection, a quiet place to work, and a plan for power or internet cuts.");
    var tools = clean(f.tools, 120);
    if (tools) out.push("- Experience with " + tools + " is a plus. We train you on our setup.");
    out.push(f.where === "anywhere" ? "- You can apply from any country." : "- This job is for people living in the Philippines.");
    out.push("");
    out.push("HOW TO APPLY");
    out.push("Apply online: (paste your application link here)");
    return out.join("\n");
  }

  function init() {
    var form = document.getElementById("jpw");
    var output = document.getElementById("jpw-out");
    var copy = document.getElementById("jpw-copy");
    var status = document.getElementById("jpw-status");
    var other = document.getElementById("jpw-kindtext-row");
    var chats = document.getElementById("jpw-chats-row");
    if (!form || !output) return;
    try {
      var guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (ZONES[guess]) form.elements.tz.value = guess;
    } catch (e) {
      /* the default zone stays */
    }
    function values() {
      var f = {};
      for (var i = 0; i < form.elements.length; i++) {
        var el = form.elements[i];
        if (!el.name) continue;
        if ((el.type === "radio" || el.type === "checkbox") && !el.checked) continue;
        f[el.name] = el.value;
      }
      return f;
    }
    function render() {
      var f = values();
      if (other) other.hidden = f.kind !== "other";
      if (chats) chats.hidden = f.channel === "email";
      output.value = buildPost(f, new Date().getFullYear());
      if (status) status.textContent = "";
    }
    form.addEventListener("input", render);
    form.addEventListener("change", render);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });
    if (copy) {
      copy.addEventListener("click", function () {
        var done = function () {
          if (status) status.textContent = "Copied. Paste it into your job board or careers page.";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(output.value).then(done, function () {
            output.select();
            if (status) status.textContent = "Selected. Press Ctrl+C (or Cmd+C) to copy.";
          });
        } else {
          output.select();
          if (status) status.textContent = "Selected. Press Ctrl+C (or Cmd+C) to copy.";
        }
      });
    }
    render();
  }

  var api = { offsetMinutes: offsetMinutes, manilaHours: manilaHours, buildPost: buildPost, ZONES: ZONES };
  if (typeof globalThis !== "undefined") globalThis.HFJobPost = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
