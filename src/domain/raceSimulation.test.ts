import { describe, expect, it } from "vitest";
import {
  DEFAULT_RACE_CONFIG,
  RACE_LAST_FRAME_TIME,
  runRaceScenario,
} from "./raceSimulation";

describe("実戦レースシミュレーション", () => {
  it("RRS 26の5分・4分・1分・スタート信号をレース時刻で返す", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, []);

    expect(replay.events.filter((event) => event.kind === "signal")).toEqual([
      { time: -300, kind: "signal", label: "5分：予告信号" },
      { time: -240, kind: "signal", label: "4分：準備信号" },
      { time: -60, kind: "signal", label: "1分：準備信号旗降下" },
      { time: 0, kind: "signal", label: "START" },
    ]);
  });

  it("最終1分から8艇の艇団を走らせ、第1上マーク到達まで記録する", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, []);

    expect(replay.frames[0].time).toBe(-60);
    expect(replay.frames[0].fleet).toHaveLength(7);
    expect(replay.markReached).toBe(true);
    expect(replay.events.at(-1)?.kind).toBe("mark");
    expect(replay.finishRank).toBeGreaterThanOrEqual(1);
    expect(replay.finishRank).toBeLessThanOrEqual(8);
    expect(replay.frames.every((frame) => [
      frame.user.x,
      frame.user.y,
      frame.user.speed,
      frame.rank,
      ...frame.fleet.flatMap((boat) => [boat.x, boat.y, boat.speed]),
    ].every(Number.isFinite))).toBe(true);
  });

  it("基準プランはライン直下からスタートし、早い加速には個別リコールを出す", () => {
    const baseline = runRaceScenario(DEFAULT_RACE_CONFIG, []);
    const earlyAcceleration = runRaceScenario(DEFAULT_RACE_CONFIG, [
      { time: -18, type: "accelerate" },
    ]);

    expect(baseline.start.isOcs).toBe(false);
    expect(baseline.start.lineDeltaSeconds).toBeGreaterThanOrEqual(0);
    expect(baseline.start.lineDeltaSeconds).toBeLessThanOrEqual(1);
    expect(earlyAcceleration.start.isOcs).toBe(true);
    expect(earlyAcceleration.events).toContainEqual({
      time: 0,
      kind: "rule",
      label: "X旗：個別リコール（OCS）",
    });
  });

  it("上げ潮では30秒前にライン接近を警告し、操作なしならOCSになる", () => {
    const replay = runRaceScenario({
      ...DEFAULT_RACE_CONFIG,
      condition: "current-push",
    }, []);

    expect(replay.events).toContainEqual({
      time: -30,
      kind: "pressure",
      label: "潮がライン方向へ押す：バウ位置を再確認",
    });
    expect(replay.start.isOcs).toBe(true);
  });

  it("OCS後はライン下へ戻る操作で解消し、再スタートを記録する", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, [
      { time: -18, type: "accelerate" },
      { time: 40, type: "return" },
    ]);

    expect(replay.start.isOcs).toBe(true);
    expect(replay.start.ocsCleared).toBe(true);
    expect(replay.events.some((event) =>
      event.kind === "start" && event.label === "ライン下へ戻り、再スタート"
    )).toBe(true);
    expect(replay.frames.at(-1)?.isOcsOutstanding).toBe(false);
    expect(replay.finishRank).toBe(DEFAULT_RACE_CONFIG.fleetSize);
  });

  it("第1上マークでは3艇身ゾーン進入を回航より先に記録する", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, []);
    const zone = replay.events.find((event) => event.label.startsWith("3艇身ゾーン"));
    const rounding = replay.events.find((event) => event.label.startsWith("第1上マーク"));

    expect(zone).toBeDefined();
    expect(rounding).toBeDefined();
    expect(zone!.time).toBeLessThan(rounding!.time);
  });

  it("ポートでスターボード艇へ収束したらRRS 10のリスクを記録する", () => {
    const replay = runRaceScenario({
      ...DEFAULT_RACE_CONFIG,
      startEnd: "pin",
      firstBeatPlan: "right",
    }, []);

    expect(replay.ruleRiskCount).toBeGreaterThan(0);
    expect(replay.events.some((event) =>
      event.kind === "rule" && event.label === "RRS 10：スターボード艇を先に避ける"
    )).toBe(true);
  });

  it("海面・スタート位置・初手・艇団規模・操作を変えてもレースの不変条件を保つ", () => {
    const failures: string[] = [];
    const actionPatterns = [
      [],
      [{ time: -18, type: "accelerate" as const }],
      [{ time: 12, type: "tack" as const }],
      [
        { time: -22, type: "slow" as const },
        { time: -6, type: "accelerate" as const },
        { time: 24, type: "tack" as const },
      ],
    ];

    for (const condition of ["oscillating", "right-pressure", "current-push"] as const) {
      for (const startEnd of ["pin", "middle", "committee"] as const) {
        for (const firstBeatPlan of ["left", "middle", "right"] as const) {
          for (const fleetSize of [4, 8, 12, 18]) {
            for (const actions of actionPatterns) {
              const id = `${condition}/${startEnd}/${firstBeatPlan}/${fleetSize}/${actions.length}`;
              const replay = runRaceScenario({ condition, startEnd, firstBeatPlan, fleetSize }, actions);
              const valid = replay.markReached
                && replay.frames[0]?.time === -60
                && replay.frames.at(-1)!.time <= RACE_LAST_FRAME_TIME
                && replay.frames.every((frame, index, frames) =>
                  frame.fleet.length === fleetSize - 1
                  && frame.rank >= 1
                  && frame.rank <= fleetSize
                  && (index === 0 || frame.time === frames[index - 1].time + 1)
                  && [frame.user.x, frame.user.y, frame.user.speed, ...frame.fleet.flatMap((boat) => [boat.x, boat.y, boat.speed])].every(Number.isFinite)
                );
              if (!valid) {
                const last = replay.frames.at(-1)!;
                failures.push(`${id}: mark=${replay.markReached}, t=${last.time}, user=${last.user.x.toFixed(1)}/${last.user.y.toFixed(1)}`);
              }
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
