import { describe, expect, it } from "vitest";
import { LESSON_BY_ID, evaluateAnswer } from "./lessons";

describe("診断問題", () => {
  const ladderLesson = LESSON_BY_ID.get("ladder-rungs")!;

  it("正解でも自信が低い場合は、理由を確認する足場かけを返す", () => {
    const result = evaluateAnswer(ladderLesson, "right", "guessing");

    expect(result.correct).toBe(true);
    expect(result.score).toBe(72);
    expect(result.showScaffold).toBe(true);
    expect(result.nextInstruction).toContain("図");
  });

  it("高い自信での誤答は、思い込みとして診断する", () => {
    const result = evaluateAnswer(ladderLesson, "same", "sure");

    expect(result.correct).toBe(false);
    expect(result.score).toBe(28);
    expect(result.diagnosis).toBe("position-only-thinking");
    expect(result.headline).toContain("思い込み");
  });
});
