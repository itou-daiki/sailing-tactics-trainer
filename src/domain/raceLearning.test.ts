import { describe, expect, it } from "vitest";
import { getRaceCoachStop, getRaceLearningFeedback } from "./raceLearning";
import { DEFAULT_RACE_CONFIG, runRaceScenario } from "./raceSimulation";

describe("RACE LABの形成的フィードバック", () => {
  it("OCSを解消していないときは、他の数値よりスタート成立を優先する", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, [
      { time: -18, type: "accelerate" },
    ]);

    expect(getRaceLearningFeedback(replay)).toMatchObject({
      focus: "start",
      headline: "最優先は、スタートを成立させること",
    });
  });

  it("OCSから戻れたときも、次走は時間と距離の見積もりに戻す", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, [
      { time: -18, type: "accelerate" },
      { time: 40, type: "return" },
    ]);

    expect(getRaceLearningFeedback(replay)).toMatchObject({
      focus: "start",
      headline: "戻れた。次は、OCSになる前に止める",
    });
  });

  it("権利リスクが繰り返されたときは、早い回避判断を次の焦点にする", () => {
    const replay = runRaceScenario(DEFAULT_RACE_CONFIG, []);

    expect(getRaceLearningFeedback(replay).focus).toBe("rights");
  });

  it("乱れた風が長いときは、クリーンエアを次の焦点にする", () => {
    const replay = runRaceScenario({
      ...DEFAULT_RACE_CONFIG,
      fleetSize: 4,
    }, []);

    expect(getRaceLearningFeedback(replay).focus).toBe("lane");
  });

  it("風の振れに合わないタックが長いときは、リフトを次の焦点にする", () => {
    const replay = runRaceScenario({
      ...DEFAULT_RACE_CONFIG,
      fleetSize: 4,
      startEnd: "pin",
      firstBeatPlan: "left",
    }, []);

    expect(getRaceLearningFeedback(replay).focus).toBe("shift");
  });

  it("主要4項目を保てたときは、複数情報を統合する課題へ進める", () => {
    const replay = runRaceScenario({
      ...DEFAULT_RACE_CONFIG,
      fleetSize: 4,
      startEnd: "committee",
      firstBeatPlan: "left",
    }, []);

    expect(getRaceLearningFeedback(replay)).toMatchObject({
      focus: "integrate",
      headline: "基本項目は確認できました。次は2つの情報を同時に使います",
    });
  });
});

describe("初級コーチの停止点", () => {
  const sailing = {
    cleanAir: true,
    isOcsOutstanding: false,
    markDistance: 20,
  };

  it("残り30秒で時間と距離を確認する", () => {
    expect(getRaceCoachStop({ ...sailing, time: -30 })).toBe("thirty");
  });

  it("OCSのときだけスタートで止まる", () => {
    expect(getRaceCoachStop({ ...sailing, time: 0 })).toBeNull();
    expect(getRaceCoachStop({ ...sailing, time: 0, isOcsOutstanding: true })).toBe("start");
  });

  it("スタート後に乱れた風へ入ったら止まる", () => {
    expect(getRaceCoachStop({ ...sailing, time: 8, cleanAir: false })).toBe("dirty-air");
  });

  it("3艇身ゾーンへ入る前の5艇身で止まる", () => {
    expect(getRaceCoachStop({ ...sailing, time: 90, markDistance: 5 })).toBe("zone");
  });
});
