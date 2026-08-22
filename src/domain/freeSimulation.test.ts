import { describe, expect, it } from "vitest";
import {
  DEFAULT_FREE_CONFIG,
  FREE_SCENARIO_DURATION,
  getFreeWindAngle,
  getOpponentManeuverTimes,
  runFreeScenario,
  type FreeScenarioConfig,
} from "./freeSimulation";

const config = (overrides: Partial<FreeScenarioConfig> = {}): FreeScenarioConfig => ({
  ...DEFAULT_FREE_CONFIG,
  ...overrides,
});

describe("フリーシミュレーション", () => {
  it("振れが平均へ戻る設定と、振れたままの設定を作れる", () => {
    expect(getFreeWindAngle(10, config())).toBe(10);
    expect(getFreeWindAngle(30, config())).toBe(0);
    expect(getFreeWindAngle(30, config({ windPattern: "hold" }))).toBe(10);
  });

  it("右振れでは右側の自艇に暫定ゲインが生まれ、戻ると小さくなる", () => {
    const replay = runFreeScenario(config({ opponentMode: "hold" }), []);
    const peakGain = replay.frames[10].relativeGain;
    const returnedGain = replay.frames[30].relativeGain;

    expect(peakGain).toBeGreaterThan(0);
    expect(Math.abs(returnedGain)).toBeLessThan(Math.abs(peakGain));
  });

  it("複数回のタックを航跡とロスへ反映する", () => {
    const replay = runFreeScenario(config({ opponentMode: "hold" }), [8, 20]);

    expect(replay.frames).toHaveLength(FREE_SCENARIO_DURATION + 1);
    expect(replay.frames[7].user.tack).toBe("port");
    expect(replay.frames[8].user.tack).toBe("starboard");
    expect(replay.frames[20].user.tack).toBe("port");
    expect(replay.userManeuverLoss).toBeGreaterThan(0);
  });

  it("カバー設定では相手が2秒後に同じ操作をする", () => {
    const times = getOpponentManeuverTimes(config({ opponentMode: "cover" }), [7, 18]);
    expect(times).toEqual([9, 20]);
  });

  it("振れ幅0度では誤解のないイベント名を返す", () => {
    const replay = runFreeScenario(config({ shiftAngle: 0 }), []);
    expect(replay.events[0].label).toBe("平均風向のまま");
    expect(replay.events[1].label).toBe("風向変化なし");
  });

  it("下りでは風上レグと相対ゲインの基準が反転する", () => {
    const upwind = runFreeScenario(config({ leg: "upwind", opponentMode: "hold" }), []);
    const downwind = runFreeScenario(config({ leg: "downwind", opponentMode: "hold" }), []);

    expect(upwind.frames[10].relativeGain).toBeGreaterThan(0);
    expect(downwind.frames[10].relativeGain).toBeLessThan(0);
  });
});
