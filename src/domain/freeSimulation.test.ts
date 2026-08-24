import { describe, expect, it } from "vitest";
import {
  DEFAULT_FREE_CONFIG,
  FREE_SCENARIO_MAX_DURATION,
  analyzeFirstManeuverTiming,
  analyzeShiftTimingChoice,
  analyzeManeuverPoints,
  analyzeWinningRoute,
  evaluateManeuverPlan,
  getFreeWindAngle,
  getFreeWindTimeline,
  getWindDecisionSnapshot,
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
  it("実戦型の海面は右・左・右へ何度も振れる", () => {
    const oscillating = config({ windPattern: "oscillating" });

    expect([4, 10, 16, 22, 28, 34].map((time) =>
      getFreeWindAngle(time, oscillating)
    )).toEqual([0, 10, 0, -10, 0, 10]);
  });

  it("反復する最大振れと平均通過をリプレイの判断点に残す", () => {
    const replay = runFreeScenario(config({ windPattern: "oscillating" }), []);

    expect(replay.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ time: 10, kind: "peak", label: "右振れ 最大10°" }),
      expect.objectContaining({ time: 16, kind: "mean", label: "平均を越えて左へ" }),
      expect.objectContaining({ time: 22, kind: "peak", label: "左振れ 最大10°" }),
      expect.objectContaining({ time: 28, kind: "mean", label: "平均を越えて右へ" }),
      expect.objectContaining({ time: 34, kind: "peak", label: "右振れ 最大10°" }),
    ]));
  });

  it("最大振れは変化中ではなく折り返しとして読む", () => {
    const snapshot = getWindDecisionSnapshot(
      config({ windPattern: "oscillating" }),
      10,
      "port",
    );

    expect(snapshot.windAngle).toBe(10);
    expect(snapshot.windTrend).toBe("steady");
  });

  it("連続するヘダーに合わせた各タックポイントを個別に評価する", () => {
    const reviews = analyzeManeuverPoints(
      config({ windPattern: "oscillating", opponentMode: "hold" }),
      [8, 20],
    );

    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      maneuverNumber: 1,
      time: 8,
      windTrend: "right",
      tackBefore: "port",
      tackAfter: "starboard",
      stateBefore: "unfavored",
      stateAfter: "favored",
      secondsSincePrevious: null,
    });
    expect(reviews[1]).toMatchObject({
      maneuverNumber: 2,
      time: 20,
      windTrend: "left",
      tackBefore: "starboard",
      tackAfter: "port",
      stateBefore: "unfavored",
      stateAfter: "favored",
      secondsSincePrevious: 12,
    });
    expect([-4, 0, 4]).toContain(reviews[0].bestOffset);
    expect(reviews[0].trials.map((trial) => trial.offset)).toEqual([-4, 0, 4]);
  });

  it("操作時に宣言した優先理由を、同時刻の風・相手・マークの記録と照合する", () => {
    const [review] = analyzeManeuverPoints(
      config({ windPattern: "oscillating", opponentMode: "hold", leverageBoatLengths: 20 }),
      [8],
      [{ time: 8, reason: "wind" }],
    );

    expect(review.declaredReason).toBe("wind");
    expect(review.strongestCue).toBe("wind");
    expect(review.reasonVerdict).toBe("supported");
    expect(review.tacticalCues.wind.supported).toBe(true);
    expect(review.tacticalCues.opponent.supported).toBe(false);
    expect(review.tacticalCues.mark.supported).toBe(false);
  });

  it("宣言した理由が海面記録に弱いときは、より強い観察対象を返す", () => {
    const [review] = analyzeManeuverPoints(
      config({ windPattern: "oscillating", opponentMode: "hold", leverageBoatLengths: 20 }),
      [8],
      [{ time: 8, reason: "mark" }],
    );

    expect(review.reasonVerdict).toBe("reconsider");
    expect(review.strongestCue).toBe("wind");
    expect(review.tacticalCues.mark.observation).toContain("レイライン前");
  });

  it("レイラインで返した操作は、マークを優先した判断として支持する", () => {
    const [review] = analyzeManeuverPoints(
      config({ shiftAngle: 0, windPattern: "hold", opponentMode: "hold" }),
      [23],
      [{ time: 23, reason: "mark" }],
    );

    expect(review.tacticalCues.mark.supported).toBe(true);
    expect(review.strongestCue).toBe("mark");
    expect(review.reasonVerdict).toBe("supported");
  });

  it("下りは上りと有利なサイドが逆になるため、ジャイブ前後を逆向きに評価する", () => {
    const [review] = analyzeManeuverPoints(
      config({ leg: "downwind", windPattern: "oscillating", opponentMode: "hold" }),
      [8],
    );

    expect(review).toMatchObject({
      tackBefore: "port",
      tackAfter: "starboard",
      stateBefore: "favored",
      stateAfter: "unfavored",
    });
  });

  it("前後4秒の仮想操作は隣の操作を追い越したり同時刻へ潰したりしない", () => {
    const reviews = analyzeManeuverPoints(
      config({ windPattern: "oscillating", opponentMode: "hold" }),
      [8, 12],
    );

    expect(reviews[0].trials.find((trial) => trial.offset === 4)?.maneuverTimes).toEqual([11, 12]);
    expect(reviews[1].trials.find((trial) => trial.offset === -4)?.maneuverTimes).toEqual([8, 9]);
  });

  it("振れが平均へ戻る設定と、振れたままの設定を作れる", () => {
    expect(getFreeWindAngle(10, config({ windPattern: "return" }))).toBe(10);
    expect(getFreeWindAngle(30, config({ windPattern: "return" }))).toBe(0);
    expect(getFreeWindAngle(30, config({ windPattern: "hold" }))).toBe(10);
  });

  it("風の変化速度によって、最大振れと振れ戻りの時刻が変わる", () => {
    expect(getFreeWindTimeline(config({ windTempo: "quick" }))).toEqual({
      shiftStart: 2,
      peak: 7,
      returnStart: 11,
      returnEnd: 22,
    });
    expect(getFreeWindAngle(7, config({ windPattern: "return", windTempo: "quick" }))).toBe(10);
    expect(getFreeWindAngle(22, config({ windPattern: "return", windTempo: "quick" }))).toBe(0);
    expect(getFreeWindAngle(22, config({ windPattern: "return", windTempo: "slow" }))).toBe(10);
  });

  it("右振れでは右側の自艇に暫定ゲインが生まれ、戻ると小さくなる", () => {
    const replay = runFreeScenario(config({ windPattern: "return", opponentMode: "hold" }), []);
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

  it("相手の見かけの風下へ入るとブランケットで減速し、損失をリプレイへ残す", () => {
    const replay = runFreeScenario(config({
      leg: "downwind",
      leverageBoatLengths: 6,
      opponentMode: "optimize",
    }), [10]);
    const blanketFrame = replay.frames.find((frame) => frame.blanket?.affected === "user");

    expect(blanketFrame).toBeDefined();
    expect(blanketFrame!.user.speed).toBeLessThan(blanketFrame!.blanket!.cleanSpeed);
    expect(replay.userBlanketSeconds).toBeGreaterThan(0);
    expect(replay.userBlanketLoss).toBeGreaterThan(0);
    expect(replay.events).toContainEqual(expect.objectContaining({
      kind: "blanket",
      label: "相手のブランケットに入る",
    }));
    expect(replay.events).toContainEqual(expect.objectContaining({
      kind: "blanket",
      label: "自艇がクリーンエアへ戻る",
    }));
  });

  it("見かけの風の後流から横へ離れればクリーンエアの速度を保つ", () => {
    const replay = runFreeScenario(config({
      leg: "downwind",
      leverageBoatLengths: 20,
      opponentMode: "optimize",
    }), [10]);

    expect(replay.frames.every((frame) => frame.blanket === undefined)).toBe(true);
    expect(replay.userBlanketSeconds + replay.opponentBlanketSeconds).toBe(0);
    expect(replay.userBlanketLoss + replay.opponentBlanketLoss).toBe(0);
  });

  it("最適化する相手は上りの連続ヘダーを返し、有利なタックへ乗り換える", () => {
    const replay = runFreeScenario(config({
      leg: "upwind",
      windPattern: "oscillating",
      opponentMode: "optimize",
    }), []);

    expect(replay.opponentManeuverTimes.slice(0, 2)).toEqual([6, 18]);
    expect(replay.events).toContainEqual(expect.objectContaining({
      time: 6,
      kind: "opponent-tack",
      label: "相手が最適化判断でタック",
    }));
  });

  it("最適化する相手は下りでは有利側を逆に読み、左振れでジャイブする", () => {
    const replay = runFreeScenario(config({
      leg: "downwind",
      windPattern: "oscillating",
      opponentMode: "optimize",
    }), []);

    expect(replay.opponentManeuverTimes[0]).toBe(18);
    expect(replay.events).toContainEqual(expect.objectContaining({
      time: 18,
      kind: "opponent-tack",
      label: "相手が最適化判断でジャイブ",
    }));
  });

  it("相手はレイラインまで走ってから、マークへ向かうタックをする", () => {
    const replay = runFreeScenario(config({
      shiftAngle: 0,
      windPattern: "hold",
      opponentMode: "hold",
    }), []);
    const laylineTackTime = replay.opponentManeuverTimes[0];

    expect(laylineTackTime).toBeGreaterThanOrEqual(32);
    expect(laylineTackTime).toBeLessThanOrEqual(36);
    expect(replay.frames[laylineTackTime - 1].opponent.tack).toBe("port");
    expect(replay.frames[laylineTackTime].opponent.tack).toBe("starboard");
    expect(replay.events).toContainEqual(expect.objectContaining({
      time: laylineTackTime,
      kind: "opponent-tack",
      label: "相手がレイラインでタック",
    }));
  });

  it("レイライン前のミートで自艇が後ろなら、相手はタックしてレイライン側へ返す", () => {
    const replay = runFreeScenario(config({
      shiftAngle: 0,
      windPattern: "hold",
      opponentMode: "hold",
    }), [10]);
    const meetingTack = replay.events.find((event) => event.label === "相手がミート前にタック");

    expect(meetingTack).toBeDefined();
    expect(meetingTack!.time).toBeLessThan(32);
    const meetingFrame = replay.frames[meetingTack!.time];
    expect(meetingFrame.user.tack).toBe("starboard");
    expect(meetingFrame.opponent.tack).toBe("starboard");
    expect(replay.events.some((event) =>
      event.kind === "avoid" && event.time <= meetingTack!.time + 5
    )).toBe(false);
  });

  it("右振れ後に自艇がタックした通常のミートでは、相手もミート前にタックする", () => {
    const replay = runFreeScenario(config({
      shiftAngle: 10,
      windPattern: "hold",
      opponentMode: "hold",
    }), [9]);
    const meetingTack = replay.events.find((event) => event.label === "相手がミート前にタック");

    expect(meetingTack).toBeDefined();
    expect(meetingTack!.time).toBeGreaterThanOrEqual(9);
    expect(meetingTack!.time).toBeLessThanOrEqual(12);
    expect(replay.frames[meetingTack!.time].opponent.tack).toBe("starboard");
    expect(replay.events.some((event) =>
      event.kind === "avoid" && event.time <= meetingTack!.time
    )).toBe(false);
    expect(replay.opponentDecisions[0]).toMatchObject({
      time: 10,
      action: "tack",
      secondsToMeeting: 12,
      closestDistanceBoatLengths: 2,
      maneuverRecoverySeconds: 4,
      safetyMarginSeconds: 7,
    });
    expect(Object.values(replay.opponentDecisions[0].meetingPoint).every(Number.isFinite)).toBe(true);
  });

  it("タックを完了する安全余地がない近距離ミートでは、相手は下って後ろを通る", () => {
    const replay = runFreeScenario(config({
      shiftAngle: 10,
      windPattern: "hold",
      leverageBoatLengths: 4,
      opponentMode: "hold",
    }), [9]);
    const avoidance = replay.events.find((event) => event.kind === "avoid");

    expect(avoidance).toBeDefined();
    const avoidanceFrame = replay.frames[avoidance!.time];
    expect(avoidanceFrame.user.tack).toBe("starboard");
    expect(avoidanceFrame.opponent.tack).toBe("port");
    expect(avoidanceFrame.opponent.heading - avoidanceFrame.windAngle).toBeGreaterThan(60);
    expect(avoidance?.label).toBe("相手がタックできず、下って避ける");
    expect(replay.opponentDecisions[0]).toMatchObject({
      time: 9,
      action: "duck",
      secondsToMeeting: 4,
      closestDistanceBoatLengths: 1.4,
      maneuverRecoverySeconds: 4,
      safetyMarginSeconds: -1,
    });
    expect(Object.values(replay.opponentDecisions[0].meetingPoint).every(Number.isFinite)).toBe(true);
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

  it("振れを観測した直後と最大振れの操作を、同じ時刻の相手との差で比べる", () => {
    const analysis = analyzeShiftTimingChoice(config({
      shiftAngle: 12,
      windPattern: "return",
      windTempo: "standard",
      opponentMode: "hold",
    }));

    expect(analysis.onset.maneuverTime).toBe(5);
    expect(analysis.peak.maneuverTime).toBe(10);
    expect(analysis.onset.windAngle).toBeCloseTo(2);
    expect(analysis.peak.windAngle).toBe(12);
    expect(analysis.comparisonTime).toBe(16);
    expect(Number.isFinite(analysis.onset.relativeGain)).toBe(true);
    expect(Number.isFinite(analysis.peak.relativeGain)).toBe(true);
  });

  it("今のタックがリフトされる振れでは、早いか遅いかを比べる前に走り続ける", () => {
    const analysis = analyzeShiftTimingChoice(config({
      leg: "upwind",
      shiftAngle: -12,
      windPattern: "return",
    }));

    expect(analysis.recommendation).toBe("hold");
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

  it("上りと下りの仮想試走から、マークへ到達して相手より前になる操作列を返す", () => {
    for (const leg of ["upwind", "downwind"] as const) {
      const analysis = analyzeWinningRoute(
        config({ leg, windPattern: "oscillating", opponentMode: "hold" }),
        [],
      );

      expect(analysis.status).toBe("win-found");
      expect(analysis.current.markResult).not.toBe("reached");
      expect(analysis.recommended.markResult).toBe("reached");
      expect(analysis.recommended.relativeGain).toBeGreaterThan(0);
      expect(analysis.recommended.maneuverTimes.length).toBeGreaterThan(0);
      expect(analysis.recommended.maneuverTimes.every((time, index, times) =>
        index === 0 || time - times[index - 1] >= 4
      )).toBe(true);
    }
  });

  it("仮想試走で見つけた勝ち筋を再現した場合は、新しい勝ち方を捏造しない", () => {
    const activeConfig = config({ windPattern: "oscillating", opponentMode: "hold" });
    const firstAnalysis = analyzeWinningRoute(activeConfig, []);
    const repeatedAnalysis = analyzeWinningRoute(
      activeConfig,
      firstAnalysis.recommended.maneuverTimes,
    );

    expect(repeatedAnalysis.status).toBe("already-winning");
    expect(repeatedAnalysis.exploredRoutes).toBe(1);
    expect(repeatedAnalysis.recommended.maneuverTimes)
      .toEqual(firstAnalysis.recommended.maneuverTimes);
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

  it("風・艇間距離・相手モードが変わっても、相手は4秒未満で連続操作しない", () => {
    const failures: string[] = [];
    for (const shiftAngle of [-18, -10, 0, 10, 18]) {
      for (const leverageBoatLengths of [4, 8, 12, 16, 20]) {
        for (const opponentMode of ["hold", "optimize", "fixed", "cover"] as const) {
          for (const userManeuverTime of [5, 9, 15, 25]) {
            const replay = runFreeScenario(config({
              shiftAngle,
              windPattern: "hold",
              leverageBoatLengths,
              opponentMode,
            }), [userManeuverTime]);
            const hasRapidRepeat = replay.opponentManeuverTimes.some((time, index, times) =>
              index > 0 && time - times[index - 1] < 4
            );
            if (hasRapidRepeat) {
              failures.push(`${shiftAngle}/${leverageBoatLengths}/${opponentMode}/${userManeuverTime}`);
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("海面設定を共有URL用のクエリへ変換し、同じ設定へ戻せる", () => {
    const sharedConfig = config({
      leg: "downwind",
      shiftAngle: -18,
      windPattern: "return-past",
      windTempo: "slow",
      leverageBoatLengths: 20,
      opponentMode: "optimize",
    });

    const search = serializeFreeScenarioConfig(sharedConfig);

    expect(search).toBe("v=1&leg=downwind&shift=-18&pattern=return-past&tempo=slow&leverage=20&opponent=optimize");
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
