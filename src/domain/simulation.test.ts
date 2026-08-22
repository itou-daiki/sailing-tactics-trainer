import { describe, expect, it } from "vitest";
import {
  BOAT_LENGTH_PX,
  getRelativeGain,
  getWindAngle,
  runScenario,
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

    expect(replay.frames).toHaveLength(35);
    expect(replay.userTackTime).toBe(10);
    expect(replay.userManeuverLoss).toBeGreaterThan(0);
    expect(replay.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["shift", "user-tack", "opponent-tack", "return"]),
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
  });
});
