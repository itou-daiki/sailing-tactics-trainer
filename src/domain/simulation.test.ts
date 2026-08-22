import { describe, expect, it } from "vitest";
import {
  BOAT_LENGTH_PX,
  getRelativeGain,
  getWindAngle,
  MARK_REACH_RADIUS_PX,
  runScenario,
  SCENARIO_MAX_DURATION,
} from "./simulation";

describe("振れ戻りシナリオ", () => {
  it("右へ10度振れたあと、平均風向へ戻る", () => {
    expect(getWindAngle(0)).toBe(0);
    expect(getWindAngle(10)).toBe(10);
    expect(getWindAngle(16)).toBe(10);
    expect(getWindAngle(28)).toBe(0);
  });

  it("同じ高さなら、右振れで右側の艇が前になる", () => {
    const rightBoat = { x: 360, y: 120 };
    const leftBoat = { x: 180, y: 120 };

    expect(getRelativeGain(rightBoat, leftBoat, 0)).toBeCloseTo(0, 5);
    expect(getRelativeGain(rightBoat, leftBoat, 10) / BOAT_LENGTH_PX).toBeCloseTo(3.13, 1);
  });

  it("タック時刻から比較可能なリプレイを生成する", () => {
    const replay = runScenario(10);

    expect(replay.frames.length).toBeGreaterThan(35);
    expect(replay.frames).toHaveLength(replay.endTime + 1);
    expect(replay.endTime).toBeLessThan(SCENARIO_MAX_DURATION);
    expect(replay.markResult).toBe("reached");
    expect(replay.markDistance).toBeLessThanOrEqual(MARK_REACH_RADIUS_PX / BOAT_LENGTH_PX);
    expect(replay.userTackTime).toBe(10);
    expect(replay.userManeuverLoss).toBeGreaterThan(0);
    expect(replay.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["shift", "user-tack", "opponent-tack", "return", "finish"]),
    );
    expect(replay.decision.rating).toBe("よい判断");
  });

  it("遅いタックには、次に試す行動を返す", () => {
    const replay = runScenario(18);

    expect(replay.decision.rating).toBe("少し遅い");
    expect(replay.decision.nextTry).toContain("クロス");
  });

  it("コーチ例は相手の前をクロスする航跡になる", () => {
    const replay = runScenario(10);

    expect(replay.frames[21].user.x).toBeLessThan(replay.frames[21].opponent.x);
    expect(replay.events.map((event) => event.kind)).toContain("cross-window");
    expect(replay.markResult).toBe("reached");
  });

  it("どの判断時刻でも有限値の航跡を生成し、マーク到達か通過まで走る", () => {
    const tackTimes = [null, 0, 4, 10, 16, 24, 32] as const;
    const endTimes = new Set<number>();

    for (const tackTime of tackTimes) {
      const replay = runScenario(tackTime);
      endTimes.add(replay.endTime);
      expect(replay.endTime).toBeLessThan(SCENARIO_MAX_DURATION);
      expect(["reached", "missed"]).toContain(replay.markResult);
      if (replay.markResult === "reached") {
        expect(
          replay.markDistance,
          `タック時刻 ${tackTime ?? "なし"}秒、終了 ${replay.endTime}秒`,
        ).toBeLessThanOrEqual(MARK_REACH_RADIUS_PX / BOAT_LENGTH_PX);
      }
      expect(replay.frames.every((frame) => [
        frame.user.x,
        frame.user.y,
        frame.opponent.x,
        frame.opponent.y,
        frame.relativeGain,
        frame.leverage,
      ].every(Number.isFinite))).toBe(true);
    }

    expect(endTimes.size).toBeGreaterThan(1);
  });
});
