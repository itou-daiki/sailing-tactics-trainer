export const BOAT_LENGTH_PX = 10;
export const SCENARIO_DURATION = 34;
export const COACH_TACK_TIME = 10;
export const OPPONENT_TACK_TIME = 21;

export type Tack = "port" | "starboard";

export interface Point {
  x: number;
  y: number;
}

export interface BoatState extends Point {
  tack: Tack;
  speed: number;
  heading: number;
}

export interface Frame {
  time: number;
  windAngle: number;
  user: BoatState;
  opponent: BoatState;
  relativeGain: number;
  leverage: number;
}

export type EventKind =
  | "shift"
  | "peak"
  | "user-tack"
  | "opponent-tack"
  | "cross-window"
  | "return"
  | "mean";

export interface ScenarioEvent {
  time: number;
  kind: EventKind;
  label: string;
}

export interface DecisionFeedback {
  rating: "よい判断" | "少し早い" | "少し遅い" | "タックしなかった";
  summary: string;
  nextTry: string;
  score: number;
}

export interface ScenarioReplay {
  frames: Frame[];
  events: ScenarioEvent[];
  userTackTime: number | null;
  userManeuverLoss: number;
  opponentManeuverLoss: number;
  finalRelativeGain: number;
  gainChange: number;
  decision: DecisionFeedback;
}

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * A classroom-friendly oscillating shift: build to +10°, hold, then return.
 * Positive angles mean the wind has shifted right of the course's mean axis.
 */
export function getWindAngle(time: number): number {
  if (time <= 4) return 0;
  if (time < 10) return ((time - 4) / 6) * 10;
  if (time <= 16) return 10;
  if (time < 28) return 10 - ((time - 16) / 12) * 10;
  return 0;
}

export function getRelativeGain(
  boat: Point,
  reference: Point,
  windAngle: number,
): number {
  const radians = degreesToRadians(windAngle);
  const dx = boat.x - reference.x;
  const dy = boat.y - reference.y;
  return dx * Math.sin(radians) + dy * Math.cos(radians);
}

export function getLeverage(boat: Point, reference: Point, windAngle: number): number {
  const radians = degreesToRadians(windAngle);
  const dx = boat.x - reference.x;
  const dy = boat.y - reference.y;
  return Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians));
}

function getSpeed(time: number, tackTime: number | null): number {
  const baseSpeed = 8.4;
  if (tackTime === null || time < tackTime) return baseSpeed;

  const secondsAfterTack = time - tackTime;
  const recovery = [0.28, 0.5, 0.7, 0.86];
  return baseSpeed * (recovery[secondsAfterTack] ?? 1);
}

function getTack(time: number, tackTime: number | null): Tack {
  return tackTime !== null && time >= tackTime ? "starboard" : "port";
}

function getHeading(tack: Tack, windAngle: number): number {
  return windAngle + (tack === "port" ? 45 : -45);
}

function moveBoat(position: Point, speed: number, heading: number): Point {
  const radians = degreesToRadians(heading);
  return {
    x: position.x + Math.sin(radians) * speed,
    y: position.y + Math.cos(radians) * speed,
  };
}

function getDecisionFeedback(tackTime: number | null): DecisionFeedback {
  if (tackTime === null) {
    return {
      rating: "タックしなかった",
      summary: "右振れで生まれたチャンスを、相手とのクロスに変えられませんでした。",
      nextTry: "ヘダーを確認したら、風が戻る前にクロスできる時刻を探しましょう。",
      score: 24,
    };
  }

  const difference = tackTime - COACH_TACK_TIME;
  if (Math.abs(difference) <= 2) {
    return {
      rating: "よい判断",
      summary: "右振れを利用し、相手より先にタックしてクロスを狙えました。",
      nextTry: "次は、振れの大きさと横の距離からゲインを予想してみましょう。",
      score: Math.max(84, 100 - Math.abs(difference) * 7),
    };
  }

  if (difference < 0) {
    return {
      rating: "少し早い",
      summary: "風の兆候が十分に見える前のタックでした。結果がよくても、同じ判断を繰り返せる根拠がありません。",
      nextTry: "風向計と相手の角度から右振れを確認してから、クロスを狙いましょう。",
      score: Math.max(35, 82 - Math.abs(difference) * 7),
    };
  }

  return {
    rating: "少し遅い",
    summary: "右振れは読めましたが、相手をクロスできる時間を逃しました。",
    nextTry: "相手をクロスできるうちにタックし、暫定ゲインを取り込みましょう。",
    score: Math.max(30, 82 - Math.abs(difference) * 7),
  };
}

export function runScenario(userTackTime: number | null): ScenarioReplay {
  let userPosition: Point = { x: 340, y: 105 };
  let opponentPosition: Point = { x: 220, y: 105 };
  let userManeuverLoss = 0;
  let opponentManeuverLoss = 0;
  const baseSpeed = getSpeed(0, null);
  const frames: Frame[] = [];

  for (let time = 0; time <= SCENARIO_DURATION; time += 1) {
    const windAngle = getWindAngle(time);
    const userTack = getTack(time, userTackTime);
    const opponentTack = getTack(time, OPPONENT_TACK_TIME);
    const userSpeed = getSpeed(time, userTackTime);
    const opponentSpeed = getSpeed(time, OPPONENT_TACK_TIME);
    const userHeading = getHeading(userTack, windAngle);
    const opponentHeading = getHeading(opponentTack, windAngle);

    frames.push({
      time,
      windAngle,
      user: { ...userPosition, tack: userTack, speed: userSpeed, heading: userHeading },
      opponent: {
        ...opponentPosition,
        tack: opponentTack,
        speed: opponentSpeed,
        heading: opponentHeading,
      },
      relativeGain: getRelativeGain(userPosition, opponentPosition, windAngle),
      leverage: getLeverage(userPosition, opponentPosition, windAngle),
    });

    userManeuverLoss += baseSpeed - userSpeed;
    opponentManeuverLoss += baseSpeed - opponentSpeed;
    userPosition = moveBoat(userPosition, userSpeed, userHeading);
    opponentPosition = moveBoat(opponentPosition, opponentSpeed, opponentHeading);
  }

  const events: ScenarioEvent[] = [
    { time: 4, kind: "shift", label: "右振れが始まる" },
    { time: 10, kind: "peak", label: "右振れ 最大10°" },
    { time: 20, kind: "cross-window", label: "クロスできる目安" },
    { time: OPPONENT_TACK_TIME, kind: "opponent-tack", label: "相手がタック" },
    { time: 16, kind: "return", label: "風が戻り始める" },
    { time: 28, kind: "mean", label: "平均風向へ戻る" },
  ];

  if (userTackTime !== null) {
    events.push({ time: userTackTime, kind: "user-tack", label: "あなたがタック" });
  }

  events.sort((a, b) => a.time - b.time);
  const firstFrame = frames[0];
  const finalFrame = frames[frames.length - 1];

  return {
    frames,
    events,
    userTackTime,
    userManeuverLoss: userManeuverLoss / BOAT_LENGTH_PX,
    opponentManeuverLoss: opponentManeuverLoss / BOAT_LENGTH_PX,
    finalRelativeGain: finalFrame.relativeGain / BOAT_LENGTH_PX,
    gainChange: (finalFrame.relativeGain - firstFrame.relativeGain) / BOAT_LENGTH_PX,
    decision: getDecisionFeedback(userTackTime),
  };
}
