import type { RaceReplay } from "./raceSimulation";

export type RaceLearningFocus = "start" | "lane" | "shift" | "rights" | "integrate";
export type RaceCoachStop = "thirty" | "start" | "dirty-air" | "zone";

export interface RaceCoachSnapshot {
  time: number;
  cleanAir: boolean;
  isOcsOutstanding: boolean;
  markDistance: number;
}

export interface RaceLearningFeedback {
  focus: RaceLearningFocus;
  label: string;
  headline: string;
  evidence: string;
  nextAction: string;
}

const getRacePercent = (seconds: number, replay: RaceReplay) => {
  const elapsedSeconds = Math.max(1, (replay.frames.at(-1)?.time ?? 0) + 1);
  return Math.round(seconds / elapsedSeconds * 100);
};

export function getRaceCoachStop(snapshot: RaceCoachSnapshot): RaceCoachStop | null {
  if (snapshot.time === -30) return "thirty";
  if (snapshot.time === 0 && snapshot.isOcsOutstanding) return "start";
  if (snapshot.time >= 0 && snapshot.markDistance <= 5) return "zone";
  if (snapshot.time >= 8 && !snapshot.cleanAir) return "dirty-air";
  return null;
}

export function getRaceLearningFeedback(replay: RaceReplay): RaceLearningFeedback {
  if (replay.start.isOcs && !replay.start.ocsCleared) {
    return {
      focus: "start",
      label: "スタートの時間・距離",
      headline: "最優先は、スタートを成立させること",
      evidence: "X旗のあと、ライン下へ戻らないままMark 1へ向かいました。",
      nextAction: "次の1走は残り30秒で艇身数を声に出し、早ければ減速します。OCSなら最短でライン下へ戻ります。",
    };
  }

  if (replay.start.isOcs) {
    return {
      focus: "start",
      label: "スタートの時間・距離",
      headline: "戻れた。次は、OCSになる前に止める",
      evidence: "ライン下へ戻って再スタートできましたが、その間に艇団との距離が開きました。",
      nextAction: "次の1走は残り30秒のライン距離と潮をセットでコールし、加速開始を遅らせます。",
    };
  }

  if (replay.ruleRiskCount >= 2) {
    return {
      focus: "rights",
      label: "権利艇への早い対応",
      headline: "相手を見る時刻を、もう5秒早くする",
      evidence: `ポート対スターボードの注意場面が${replay.ruleRiskCount}回ありました。`,
      nextAction: "次の1走はミートしてからではなく、交差する前に「クロス・タック・ダック」を声に出して決めます。",
    };
  }

  const cleanAirPercent = getRacePercent(replay.cleanAirSeconds, replay);
  if (cleanAirPercent < 65) {
    return {
      focus: "lane",
      label: "乱れた風から抜ける",
      headline: "順位より先に、走れるレーンを確保する",
      evidence: `クリーンエアで走れたのは${cleanAirPercent}%でした。`,
      nextAction: "次の1走はスタート後10秒で前方2艇身を確認し、乱れた風なら早めにベアかタックでレーンを変えます。",
    };
  }

  const liftedPercent = getRacePercent(replay.liftedTackSeconds, replay);
  if (liftedPercent < 55) {
    return {
      focus: "shift",
      label: "振れに合うタック",
      headline: "長く走る前に、今のタックがリフトか確認する",
      evidence: `リフト側を走れたのは${liftedPercent}%でした。`,
      nextAction: "次の1走は風向表示が左右を変えた瞬間に、今のタックがマークへ向くかを声に出します。",
    };
  }

  return {
    focus: "integrate",
    label: "2つの情報を同時に確認",
    headline: "基本項目は確認できました。次は2つの情報を同時に使います",
    evidence: `クリーンエア${cleanAirPercent}%、リフト側${liftedPercent}%で、重大な見落としは続きませんでした。`,
    nextAction: "次の1走は「風＋相手」または「潮＋ライン」の2つを1回のコールにまとめます。",
  };
}
