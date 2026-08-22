import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  getCompletedCount,
  getRecommendedLessonId,
  parseProgress,
  recordAttempt,
} from "./progress";

describe("学習進捗", () => {
  it("壊れた保存データは安全に初期化する", () => {
    expect(parseProgress("not-json")).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"version":2}')).toEqual(EMPTY_PROGRESS);
  });

  it("再挑戦では最高点を残し、試行回数を増やす", () => {
    const first = recordAttempt(EMPTY_PROGRESS, "ladder-rungs", 86, "thinking", undefined, "2026-01-01");
    const second = recordAttempt(first, "ladder-rungs", 52, "guessing", "position-only-thinking", "2026-01-02");

    expect(second.lessons["ladder-rungs"]?.attempts).toBe(2);
    expect(second.lessons["ladder-rungs"]?.bestScore).toBe(86);
    expect(second.lessons["ladder-rungs"]?.lastScore).toBe(52);
  });

  it("未実施の先頭レッスンを次に勧める", () => {
    const progress = recordAttempt(EMPTY_PROGRESS, "ladder-rungs", 100, "sure", undefined, "2026-01-01");

    expect(getCompletedCount(progress)).toBe(1);
    expect(getRecommendedLessonId(progress)).toBe("shift-cross");
  });

  it("70点未満は完了にせず、同じレッスンの復習を勧める", () => {
    const progress = recordAttempt(
      EMPTY_PROGRESS,
      "ladder-rungs",
      52,
      "sure",
      "position-only-thinking",
      "2026-01-01",
    );

    expect(getCompletedCount(progress)).toBe(0);
    expect(getRecommendedLessonId(progress)).toBe("ladder-rungs");
  });
});
