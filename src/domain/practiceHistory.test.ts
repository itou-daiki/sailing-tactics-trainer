import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_CONFIG, runFreeScenario, type ManeuverPointReview } from "./freeSimulation";
import {
  EMPTY_PRACTICE_HISTORY,
  PRACTICE_HISTORY_LIMIT,
  createPracticeAttempt,
  getPracticeRecommendation,
  parsePracticeHistory,
  recordPracticeAttempt,
  type PracticeAttempt,
} from "./practiceHistory";

const review = (overrides: Partial<ManeuverPointReview> = {}): ManeuverPointReview => ({
  maneuverNumber: 1,
  time: 8,
  windAngle: 6,
  windTrend: "right",
  tackBefore: "port",
  tackAfter: "starboard",
  stateBefore: "unfavored",
  stateAfter: "favored",
  secondsSincePrevious: null,
  declaredReason: "wind",
  strongestCue: "wind",
  reasonVerdict: "supported",
  tacticalCues: {
    wind: { supported: true, observation: "ヘダー" },
    opponent: { supported: false, observation: "遠い" },
    mark: { supported: false, observation: "レイライン前" },
  },
  bestOffset: 0,
  trials: [],
  ...overrides,
});

const attempt = (overrides: Partial<PracticeAttempt> = {}): PracticeAttempt => ({
  completedAt: "2026-08-24T00:00:00.000Z",
  config: { ...DEFAULT_FREE_CONFIG },
  maneuverCount: 1,
  recordedCallCount: 1,
  supportedCallCount: 1,
  focusReason: null,
  markResult: "reached",
  relativeGain: 1.2,
  ...overrides,
});

describe("SHIFT LABの練習記録", () => {
  it("操作時のコールと海面記録の照合結果を1試行にまとめる", () => {
    const replay = runFreeScenario(DEFAULT_FREE_CONFIG, [8, 20]);
    const summary = createPracticeAttempt(
      DEFAULT_FREE_CONFIG,
      [review(), review({
        maneuverNumber: 2,
        time: 20,
        declaredReason: "mark",
        strongestCue: "opponent",
        reasonVerdict: "reconsider",
      })],
      replay,
      "2026-08-24T00:00:00.000Z",
    );

    expect(summary).toMatchObject({
      maneuverCount: 2,
      recordedCallCount: 2,
      supportedCallCount: 1,
      focusReason: "opponent",
      completedAt: "2026-08-24T00:00:00.000Z",
    });
  });

  it("根拠が海面記録と合わないときは、同じ条件で見る対象を変える", () => {
    const history = recordPracticeAttempt(EMPTY_PRACTICE_HISTORY, attempt({
      supportedCallCount: 0,
      focusReason: "opponent",
    }));

    expect(getPracticeRecommendation(history)).toMatchObject({
      mode: "repeat",
      heading: "根拠を見直してもう一度",
      detail: expect.stringContaining("相手"),
      config: DEFAULT_FREE_CONFIG,
    });
  });

  it("同じ条件で2回続けて確認できたら、風の変化を変えて応用する", () => {
    const once = recordPracticeAttempt(EMPTY_PRACTICE_HISTORY, attempt());
    const twice = recordPracticeAttempt(once, attempt({ completedAt: "2026-08-24T00:05:00.000Z" }));

    expect(getPracticeRecommendation(twice)).toMatchObject({
      mode: "transfer",
      heading: "風の変化を変えて試す",
      config: { windPattern: "return-past" },
    });
  });

  it("マークへ届かなければ、根拠が合っていても同じ条件で走り直す", () => {
    const history = recordPracticeAttempt(EMPTY_PRACTICE_HISTORY, attempt({ markResult: "missed" }));

    expect(getPracticeRecommendation(history)).toMatchObject({
      mode: "repeat",
      heading: "マーク到達までの操作を組み直す",
    });
  });

  it("壊れた保存値を除外し、履歴を直近8件に制限する", () => {
    const attempts = Array.from({ length: PRACTICE_HISTORY_LIMIT + 3 }, (_, index) =>
      attempt({ completedAt: `2026-08-24T00:${String(index).padStart(2, "0")}:00.000Z` })
    );
    const parsed = parsePracticeHistory(JSON.stringify({
      version: 1,
      attempts: [{ broken: true }, ...attempts],
    }));

    expect(parsed.attempts).toHaveLength(PRACTICE_HISTORY_LIMIT);
    expect(parsed.attempts[0].completedAt).toBe("2026-08-24T00:03:00.000Z");
    expect(parsePracticeHistory(JSON.stringify({
      version: 1,
      attempts: [attempt(), attempt({ maneuverCount: 1, recordedCallCount: 2 })],
    })).attempts).toHaveLength(1);
    expect(parsePracticeHistory("not-json")).toEqual(EMPTY_PRACTICE_HISTORY);
    expect(parsePracticeHistory(JSON.stringify({ version: 2, attempts }))).toEqual(EMPTY_PRACTICE_HISTORY);
  });
});
