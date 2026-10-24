import { describe, expect, it } from "vitest";
import {
  detectMomentImportMode,
  formatImportTime,
  parseMomentList,
  parseTimeExpression,
  planMomentImport,
} from "./momentImport";

function seconds(text: string, fps?: number) {
  const result = parseTimeExpression(text, { fps });
  if (!result.ok) throw new Error(`${text}: ${result.error}`);
  return result.seconds;
}

function error(text: string, fps?: number) {
  const result = parseTimeExpression(text, { fps });
  if (result.ok) throw new Error(`${text} unexpectedly parsed as ${result.seconds}`);
  return result.error;
}

const CASSIDY = `- 29 seconds
- 27 seconds
- 41 seconds
- 41 seconds
- 15 seconds
- 1 minute 3 seconds
- 1 minute 7 seconds
- 23 seconds`;

describe("parseTimeExpression", () => {
  it.each([
    ["29", 29],
    ["29.5", 29.5],
    ["29,5", 29.5],
    [".5", 0.5],
    ["0:29", 29],
    ["1:03", 63],
    ["01:03", 63],
    ["75:30", 4530],
    ["1:03.25", 63.25],
    ["1:03,5", 63.5],
    ["1:02:03", 3723],
    ["01:02:03.5", 3723.5],
    ["29s", 29],
    ["29 sec", 29],
    ["29 secs.", 29],
    ["29 seconds", 29],
    ["1m3s", 63],
    ["1m 3s", 63],
    ["1 min 3 sec", 63],
    ["1 min. 3 sec.", 63],
    ["1 minute 3 seconds", 63],
    ["1 minute, 3 seconds", 63],
    ["1 minute and 3 seconds", 63],
    ["1 Minute 3 Seconds", 63],
    ["1.5 min", 90],
    ["2 minutes", 120],
    ["1h", 3600],
    ["1 hr 2 min", 3720],
    ["1h2m3s", 3723],
    ["1 hour 2 minutes 3 seconds", 3723],
    ["500ms", 0.5],
    ["1s 500ms", 1.5],
    ["1m 500 ms", 60.5],
    ["1'03\"", 63],
    ["1′03″", 63],
    ["PT1M3S", 63],
    ["pt29s", 29],
    ["PT1H", 3600],
    ["PT1.5M", 90],
    ["(0:29)", 29],
    ["29.", 29],
    ["\u00a029 s\u00a0", 29],
  ])("reads %s as %d seconds", (text, expected) => {
    expect(seconds(text)).toBeCloseTo(expected, 6);
  });

  it("reads SMPTE frame timecodes with the video frame rate", () => {
    expect(seconds("00:00:29:15", 30)).toBeCloseTo(29.5, 6);
    expect(seconds("00:01:00;12", 24)).toBeCloseTo(60.5, 6);
  });

  it("tags each syntax so the import mode can be detected", () => {
    const syntax = (text: string) => {
      const result = parseTimeExpression(text, { fps: 30 });
      return result.ok ? result.syntax : result.error;
    };
    expect(syntax("1:03")).toBe("clock");
    expect(syntax("00:00:01:02")).toBe("frames");
    expect(syntax("1m3s")).toBe("units");
    expect(syntax("PT1M3S")).toBe("iso");
    expect(syntax("63")).toBe("number");
  });

  it("flags times it can't trust instead of guessing", () => {
    expect(error("1:75")).toMatch(/Seconds must be under 60/);
    expect(error("1:75:00")).toMatch(/Minutes must be under 60/);
    expect(error("-29s")).toMatch(/Negative/);
    expect(error("3 seconds 1 minute")).toMatch(/out of order/);
    expect(error("29s 30s")).toMatch(/repeated/);
    expect(error("00:00:29:15")).toMatch(/frame rate/);
    expect(error("00:00:29:45", 30)).toMatch(/past the 30 fps/);
    expect(error("PT")).toMatch(/Couldn't read|no time parts/);
    expect(error("banana")).toMatch(/Couldn't read "banana"/);
    expect(error("29 parsecs")).toMatch(/Couldn't read/);
    expect(error("")).toBe("Empty");
  });
});

describe("parseMomentList", () => {
  it("parses Cassidy's bulleted section lengths", () => {
    const entries = parseMomentList(CASSIDY);
    expect(entries.map((entry) => entry.seconds)).toEqual([29, 27, 41, 41, 15, 63, 67, 23]);
    expect(entries.every((entry) => entry.syntax === "units")).toBe(true);
  });

  it("strips bullets, numbering, checkboxes and blank lines", () => {
    const entries = parseMomentList("1. 0:29\n\n2) 0:56\n* 1:37\n• 2:18\n- [ ] 2:33\n  > 3:36\n### 4:43\n(8) 5:00");
    expect(entries.map((entry) => entry.seconds)).toEqual([29, 56, 97, 138, 153, 216, 283, 300]);
    expect(entries.map((entry) => entry.line)).toEqual([1, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("keeps YouTube-chapter labels before or after the time", () => {
    const entries = parseMomentList("0:00 Intro\n0:29 - Setup\n0:56: Demo\nWrap up – 1:37\nQ&A (2:18)");
    expect(entries.map(({ seconds: s, label }) => [s, label])).toEqual([
      [0, "Intro"],
      [29, "Setup"],
      [56, "Demo"],
      [97, "Wrap up"],
      [138, "Q&A"],
    ]);
  });

  it("reads ranges and keeps their end", () => {
    const entries = parseMomentList("0:00 - 0:29 Intro\n0:29–0:56 Setup");
    expect(entries.map(({ seconds: s, rangeEnd, label }) => [s, rangeEnd, label])).toEqual([
      [0, 29, "Intro"],
      [29, 56, "Setup"],
    ]);
  });

  it("splits several times on one line but keeps comma-separated units together", () => {
    expect(parseMomentList("0:29, 0:56, 1:37").map((entry) => entry.seconds)).toEqual([29, 56, 97]);
    expect(parseMomentList("29s; 27s; 41s").map((entry) => entry.seconds)).toEqual([29, 27, 41]);
    expect(parseMomentList("29 27 41").map((entry) => entry.seconds)).toEqual([29, 27, 41]);
    expect(parseMomentList("1 minute, 3 seconds").map((entry) => entry.seconds)).toEqual([63]);
  });

  it("flags unreadable lines with their line number and reason", () => {
    const entries = parseMomentList("Clip lengths for the demo:\n0:29\n1:75 Setup");
    expect(entries[0]).toMatchObject({ line: 1, error: expect.stringMatching(/Couldn't read/) });
    expect(entries[1]).toMatchObject({ line: 2, seconds: 29 });
    expect(entries[2]).toMatchObject({ line: 3, error: expect.stringMatching(/Seconds must be under 60/) });
  });

  it("handles Windows line endings and tab-separated spreadsheet rows", () => {
    expect(parseMomentList("Intro\t0:00\r\nSetup\t0:29\r\n").map(({ seconds: s, label }) => [s, label])).toEqual([
      [0, "Intro"],
      [29, "Setup"],
    ]);
  });
});

describe("detectMomentImportMode", () => {
  const detect = (text: string) => detectMomentImportMode(parseMomentList(text));

  it("treats unit words and ISO durations as section lengths", () => {
    expect(detect(CASSIDY)).toBe("durations");
    expect(detect("PT29S\nPT27S")).toBe("durations");
  });

  it("treats lists that don't keep increasing as section lengths", () => {
    expect(detect("0:29\n0:27\n0:41")).toBe("durations");
    expect(detect("29\n27\n41")).toBe("durations");
  });

  it("treats increasing lists, 0:00 starts and ranges as timecodes", () => {
    expect(detect("0:29\n0:56\n1:37")).toBe("timecodes");
    expect(detect("0:00 Intro\n0:29 Setup")).toBe("timecodes");
    expect(detect("0:00-0:29\n0:29-0:56")).toBe("timecodes");
    expect(detect("0:29")).toBe("timecodes");
  });
});

describe("planMomentImport", () => {
  it("turns Cassidy's section lengths into moments between sections", () => {
    const plan = planMomentImport(parseMomentList(CASSIDY), "durations", 0, 306);
    expect(plan.stops.map((stop) => stop.time)).toEqual([29, 56, 97, 138, 153, 216, 283]);
    expect(plan.rows[7]).toMatchObject({ status: "info", time: 306, message: expect.stringMatching(/Last section/) });
    expect(plan.sectionTotal).toBe(306);
    expect(plan.notes).toEqual([]);
  });

  it("counts section lengths from the clip start", () => {
    const plan = planMomentImport(parseMomentList("10s\n20s\n5s"), "durations", 100, 135);
    expect(plan.stops.map((stop) => stop.time)).toEqual([110, 130]);
  });

  it("labels each section boundary with the section that starts there", () => {
    const plan = planMomentImport(parseMomentList("Intro 29s\nSetup 27s\nDemo 41s"), "durations", 0, 97);
    expect(plan.stops).toEqual([
      { time: 29, label: "Setup" },
      { time: 56, label: "Demo" },
    ]);
  });

  it("uses range lengths as section lengths", () => {
    const plan = planMomentImport(parseMomentList("0:00-0:29\n0:29-0:56\n0:56-1:37"), "durations", 0, 97);
    expect(plan.stops.map((stop) => stop.time)).toEqual([29, 56]);
  });

  it("notes when sections don't add up to the clip length", () => {
    expect(planMomentImport(parseMomentList("29s\n27s"), "durations", 0, 60).notes[0]).toMatch(/0:04 shorter/);
    const over = planMomentImport(parseMomentList("29s\n35s\n30s"), "durations", 0, 60);
    expect(over.notes[0]).toMatch(/longer than the clip/);
    expect(over.rows[1]).toMatchObject({ status: "skipped", message: expect.stringMatching(/past the clip end/) });
    expect(over.stops.map((stop) => stop.time)).toEqual([29]);
  });

  it("skips zero-length sections", () => {
    const plan = planMomentImport(parseMomentList("29s\n0s\n27s"), "durations", 0, 60);
    expect(plan.rows[1]).toMatchObject({ status: "skipped", message: expect.stringMatching(/more than 0/) });
    expect(plan.stops.map((stop) => stop.time)).toEqual([29]);
  });

  it("places timecodes on the video timeline and flags anything outside the clip", () => {
    const plan = planMomentImport(parseMomentList("0:00 Intro\n0:05\n0:29 Setup\n0:29\n0:12\n1:00\n2:00"), "timecodes", 0, 60);
    expect(plan.stops).toEqual([{ time: 5 }, { time: 12 }, { time: 29, label: "Setup" }]);
    expect(plan.rows.map((row) => row.status)).toEqual(["info", "moment", "moment", "skipped", "moment", "info", "skipped"]);
    expect(plan.rows[3].message).toMatch(/Same time as line 3/);
    expect(plan.rows[4].message).toMatch(/Out of order/);
    expect(plan.rows[6].message).toMatch(/After the clip ends/);
  });

  it("treats timecodes as video-file times for trimmed clips", () => {
    const plan = planMomentImport(parseMomentList("0:05\n0:15\n0:25"), "timecodes", 10, 20);
    expect(plan.stops.map((stop) => stop.time)).toEqual([15]);
    expect(plan.rows[0]).toMatchObject({ status: "skipped", message: expect.stringMatching(/Before the clip starts/) });
  });

  it("keeps error rows in the plan without creating moments", () => {
    const plan = planMomentImport(parseMomentList("nope\n0:10"), "timecodes", 0, 60);
    expect(plan.rows[0]).toMatchObject({ status: "error", line: 1 });
    expect(plan.stops).toEqual([{ time: 10 }]);
  });
});

describe("formatImportTime", () => {
  it.each([
    [0, "0:00"],
    [29, "0:29"],
    [63.5, "1:03.5"],
    [3723.25, "1:02:03.25"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatImportTime(value)).toBe(expected);
  });
});
