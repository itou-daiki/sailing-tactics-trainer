import { describe, expect, it } from "vitest";
import {
  DEFAULT_FREE_CONFIG,
  FREE_SCENARIO_MAX_DURATION,
  analyzeFirstManeuverTiming,
  evaluateManeuverPlan,
  getFreeWindAngle,
  getFreeWindTimeline,
  getOpponentManeuverTimes,
  getRelativeGainDifferenceAtCommonTime,
  parseFreeScenarioConfig,
  runFreeScenario,
  serializeFreeScenarioConfig,
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

  it("風の変化速度によって、最大振れと振れ戻りの時刻が変わる", () => {
    expect(getFreeWindTimeline(config({ windTempo: "quick" }))).toEqual({
      shiftStart: 2,
      peak: 7,
      returnStart: 11,
      returnEnd: 22,
    });
    expect(getFreeWindAngle(7, config({ windTempo: "quick" }))).toBe(10);
    expect(getFreeWindAngle(22, config({ windTempo: "quick" }))).toBe(0);
    expect(getFreeWindAngle(22, config({ windTempo: "slow" }))).toBe(10);
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

    expect(replay.frames).toHaveLength(replay.endTime + 1);
    expect(replay.endTime).toBeLessThanOrEqual(FREE_SCENARIO_MAX_DURATION);
    expect(replay.frames[7].user.tack).toBe("port");
    expect(replay.frames[8].user.tack).toBe("starboard");
    expect(replay.frames[20].user.tack).toBe("port");
    expect(replay.userManeuverLoss).toBeGreaterThan(0);
  });

  it("カバー設定では相手が2秒後に同じ操作をする", () => {
    const times = getOpponentManeuverTimes(config({ opponentMode: "cover" }), [7, 18]);
    expect(times).toEqual([9, 20]);
  });

  it("同じ時刻で操作ありと操作なしのゲイン差を比較する", () => {
    const active = runFreeScenario(config({ opponentMode: "hold" }), [10]);
    const baseline = runFreeScenario(config({ opponentMode: "hold" }), []);
    const comparison = getRelativeGainDifferenceAtCommonTime(active, baseline);

    expect(comparison.time).toBe(Math.min(active.endTime, baseline.endTime));
    expect(Number.isFinite(comparison.difference)).toBe(true);
  });

  it("最初の操作を前後4秒にずらした比較から、再試行の方向を返す", () => {
    const analysis = analyzeFirstManeuverTiming(
      config({ opponentMode: "hold" }),
      [14],
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.trials.map((trial) => trial.offset)).toEqual([-4, 0, 4]);
    expect(analysis?.trials.map((trial) => trial.maneuverTime)).toEqual([10, 14, 18]);
    expect([-4, 0, 4]).toContain(analysis?.bestOffset);
  });

  it("複数回操作した場合は、操作間隔を保って全体を前後へずらす", () => {
    const analysis = analyzeFirstManeuverTiming(config(), [10, 18]);

    expect(analysis?.trials[0].maneuverTimes).toEqual([6, 14]);
    expect(analysis?.trials[1].maneuverTimes).toEqual([10, 18]);
    expect(analysis?.trials[2].maneuverTimes).toEqual([14, 22]);
  });

  it("操作していない場合はタイミング比較を作らない", () => {
    expect(analyzeFirstManeuverTiming(config(), [])).toBeNull();
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

  it("適切な操作時刻を選べば、上りも下りもマークへ到達できる", () => {
    for (const leg of ["upwind", "downwind"] as const) {
      const successfulTime = Array.from({ length: 51 }, (_, time) => time).find((time) =>
        runFreeScenario(config({ leg, opponentMode: "hold" }), [time]).markResult === "reached"
      );
      expect(successfulTime).toBeDefined();
    }
  });

  it("設定範囲を走査しても、終了時刻と全フレームは有限範囲に収まる", () => {
    for (const leg of ["upwind", "downwind"] as const) {
      for (const shiftAngle of [-18, 0, 18]) {
        for (const windPattern of ["hold", "return", "return-past"] as const) {
          for (const windTempo of ["quick", "standard", "slow"] as const) {
            const replay = runFreeScenario(config({ leg, shiftAngle, windPattern, windTempo }), [12, 28]);
            expect(replay.endTime).toBeLessThanOrEqual(FREE_SCENARIO_MAX_DURATION);
            expect(replay.frames).toHaveLength(replay.endTime + 1);
            expect(replay.frames.every((frame) => [
              frame.windAngle,
              frame.user.x,
              frame.user.y,
              frame.opponent.x,
              frame.opponent.y,
              frame.relativeGain,
              frame.leverage,
            ].every(Number.isFinite))).toBe(true);
          }
        }
      }
    }
  });

  it("海面設定を共有URL用のクエリへ変換し、同じ設定へ戻せる", () => {
    const sharedConfig = config({
      leg: "downwind",
      shiftAngle: -18,
      windPattern: "return-past",
      windTempo: "slow",
      leverageBoatLengths: 20,
      opponentMode: "cover",
    });

    const search = serializeFreeScenarioConfig(sharedConfig);

    expect(search).toBe("v=1&leg=downwind&shift=-18&pattern=return-past&tempo=slow&leverage=20&opponent=cover");
    expect(parseFreeScenarioConfig(`?${search}`)).toEqual(sharedConfig);
  });

  it("壊れた共有値は安全な範囲へ直し、未対応バージョンは読み込まない", () => {
    expect(parseFreeScenarioConfig(
      "?v=1&leg=unknown&shift=99&pattern=unknown&tempo=unknown&leverage=-3&opponent=unknown",
    )).toEqual({
      ...DEFAULT_FREE_CONFIG,
      shiftAngle: 18,
      leverageBoatLengths: 2,
    });
    expect(parseFreeScenarioConfig("?v=2&leg=downwind")).toBeNull();
    expect(parseFreeScenarioConfig("")).toBeNull();
  });

  it("走る前の予定と最初の操作を、予定どおり・早い・遅い・未実行に分ける", () => {
    expect(evaluateManeuverPlan(10, [10, 22])).toMatchObject({ rating: "on-plan", delta: 0 });
    expect(evaluateManeuverPlan(10, [7])).toMatchObject({ rating: "early", delta: -3 });
    expect(evaluateManeuverPlan(10, [14])).toMatchObject({ rating: "late", delta: 4 });
    expect(evaluateManeuverPlan(10, [])).toMatchObject({ rating: "not-executed", actualTime: null });
  });
});
