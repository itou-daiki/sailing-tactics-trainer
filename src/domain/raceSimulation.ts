import type { BoatState, Point, Tack } from "./simulation";

export type RaceCondition = "oscillating" | "right-pressure" | "current-push";
export type StartEnd = "pin" | "middle" | "committee";
export type FirstBeatPlan = "left" | "middle" | "right";
export type RaceActionType = "accelerate" | "slow" | "tack" | "bear-away" | "return";
export type RaceEventKind = "signal" | "action" | "start" | "rule" | "pressure" | "mark";

export interface RaceScenarioConfig {
  condition: RaceCondition;
  startEnd: StartEnd;
  firstBeatPlan: FirstBeatPlan;
  fleetSize: number;
}

export interface RaceAction {
  time: number;
  type: RaceActionType;
}

export interface FleetBoatState extends BoatState {
  id: string;
  sailNumber: string;
  markReachedTime?: number;
}

export interface RaceFrame {
  time: number;
  windAngle: number;
  current: Point;
  user: BoatState;
  fleet: FleetBoatState[];
  rank: number;
  cleanAir: boolean;
  onLiftedTack: boolean;
  isOcsOutstanding: boolean;
  lineDeltaBoatLengths: number;
}

export interface RaceEvent {
  time: number;
  kind: RaceEventKind;
  label: string;
}

export interface RaceStartResult {
  isOcs: boolean;
  ocsCleared: boolean;
  lineDeltaSeconds: number;
  rank: number;
}

export interface RaceReplay {
  frames: RaceFrame[];
  events: RaceEvent[];
  actions: RaceAction[];
  start: RaceStartResult;
  finishRank: number;
  cleanAirSeconds: number;
  liftedTackSeconds: number;
  ruleRiskCount: number;
  markReached: boolean;
}

export const DEFAULT_RACE_CONFIG: RaceScenarioConfig = {
  condition: "oscillating",
  startEnd: "middle",
  firstBeatPlan: "middle",
  fleetSize: 8,
};

const START_SIGNALS: RaceEvent[] = [
  { time: -300, kind: "signal", label: "5分：予告信号" },
  { time: -240, kind: "signal", label: "4分：準備信号" },
  { time: -60, kind: "signal", label: "1分：準備信号旗降下" },
  { time: 0, kind: "signal", label: "START" },
];

export const RACE_START_LINE = {
  pin: { x: 14, y: 18 },
  committee: { x: 86, y: 18 },
};
export const RACE_WINDWARD_MARK: Point = { x: 50, y: 125 };
export const RACE_MARK_ZONE_RADIUS = 3;
export const RACE_MARK_REACH_RADIUS = 0.8;
export const RACE_FIRST_FRAME_TIME = -60;
export const RACE_LAST_FRAME_TIME = 300;

const degreesToRadians = (degrees: number) => degrees * Math.PI / 180;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getCondition = (condition: RaceCondition, time: number) => {
  const raceTime = Math.max(0, time);
  if (condition === "right-pressure") {
    return {
      windAngle: raceTime < 12 ? 2 : clamp(2 + (raceTime - 12) * 0.22, 2, 12),
      current: { x: -0.015, y: 0 },
      gustSide: "right" as const,
    };
  }
  if (condition === "current-push") {
    return {
      windAngle: 4 * Math.sin(raceTime / 32),
      current: { x: 0.018, y: 0.055 },
      gustSide: "left" as const,
    };
  }
  return {
    windAngle: 7 * Math.sin(raceTime / 34),
    current: { x: 0.012, y: 0 },
    gustSide: "right" as const,
  };
};

export const getRaceStartLineY = (x: number, condition: RaceCondition) => {
  const bias = condition === "right-pressure" ? 1.8 : condition === "current-push" ? -1.4 : 0;
  return RACE_START_LINE.pin.y + bias * ((x - 50) / 36);
};

const getHeading = (tack: Tack, windAngle: number) =>
  windAngle + (tack === "starboard" ? -42 : 42);

const move = (boat: BoatState, heading: number, speed: number, current: Point): BoatState => {
  const radians = degreesToRadians(heading);
  return {
    x: boat.x + Math.sin(radians) * speed + current.x,
    y: boat.y + Math.cos(radians) * speed + current.y,
    tack: boat.tack,
    speed,
    heading,
  };
};

const getStartX = (startEnd: StartEnd) =>
  startEnd === "pin" ? 24 : startEnd === "committee" ? 76 : 50;

const getInitialTack = (plan: FirstBeatPlan): Tack => plan === "right" ? "port" : "starboard";

const getActionLabel = (type: RaceActionType) => ({
  accelerate: "加速を始める",
  slow: "艇速を落として時間をつくる",
  tack: "タック",
  "bear-away": "ベアしてスペースをつくる",
  return: "ライン下へ戻る",
})[type];

const getDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const getRank = (user: Point, fleet: FleetBoatState[], isOcs: boolean) => {
  if (isOcs) return fleet.length + 1;
  const userDistance = getDistance(user, RACE_WINDWARD_MARK);
  const finishedAhead = fleet.filter((boat) => boat.markReachedTime !== undefined).length;
  const racingAhead = fleet.filter((boat) =>
    boat.markReachedTime === undefined
    && getDistance(boat, RACE_WINDWARD_MARK) < userDistance
  ).length;
  return 1 + finishedAhead + racingAhead;
};

const getIsInGust = (position: Point, side: "left" | "right") =>
  position.y >= 48
  && position.y <= 105
  && (side === "left" ? position.x <= 40 : position.x >= 60);

const getIsCleanAir = (user: BoatState, fleet: FleetBoatState[]) => !fleet.some((boat) => {
  const forwardDistance = boat.y - user.y;
  return forwardDistance > 0
    && forwardDistance < 5
    && Math.abs(boat.x - user.x) < 2.8;
});

const getIsLiftedTack = (tack: Tack, windAngle: number) =>
  (windAngle >= 0 && tack === "starboard") || (windAngle < 0 && tack === "port");

const normalizeActions = (actions: RaceAction[]) => actions
  .filter((action) => Number.isFinite(action.time)
    && action.time >= RACE_FIRST_FRAME_TIME
    && action.time <= RACE_LAST_FRAME_TIME)
  .map((action) => ({ ...action, time: Math.round(action.time) }))
  .sort((a, b) => a.time - b.time);

export function runRaceScenario(
  config: RaceScenarioConfig,
  actions: RaceAction[],
): RaceReplay {
  const normalizedActions = normalizeActions(actions);
  const events: RaceEvent[] = [
    ...START_SIGNALS,
    ...(config.condition === "current-push" ? [{
      time: -30,
      kind: "pressure" as const,
      label: "潮がライン方向へ押す：バウ位置を再確認",
    }] : []),
    ...normalizedActions.map((action): RaceEvent => ({
      time: action.time,
      kind: "action",
      label: `あなた：${getActionLabel(action.type)}`,
    })),
  ];
  const fleetCount = clamp(Math.round(config.fleetSize), 4, 18) - 1;
  let user: BoatState = {
    x: getStartX(config.startEnd),
    y: 4.5,
    tack: getInitialTack(config.firstBeatPlan),
    speed: 0.22,
    heading: 0,
  };
  let fleet: FleetBoatState[] = Array.from({ length: fleetCount }, (_, index) => ({
    id: `fleet-${index + 1}`,
    sailNumber: String(4200 + index * 37),
    x: 18 + index * (64 / Math.max(1, fleetCount - 1)),
    y: 4.4 + ((index * 7) % 5) * 0.22,
    tack: index % 3 === 0 ? "port" : "starboard",
    speed: 0.21 + (index % 4) * 0.008,
    heading: 0,
  }));
  let accelerationUntil = -61;
  let slowUntil = -61;
  let bearAwayUntil = -61;
  let returningToStart = false;
  let lastUserTackTime = -100;
  let start: RaceStartResult = {
    isOcs: false,
    ocsCleared: true,
    lineDeltaSeconds: 0,
    rank: fleetCount + 1,
  };
  let ocsOutstanding = false;
  let startWasRecorded = false;
  let cleanAirSeconds = 0;
  let liftedTackSeconds = 0;
  let ruleRiskCount = 0;
  let lastRuleRiskTime = -20;
  let markReached = false;
  let markZoneEntered = false;
  const frames: RaceFrame[] = [];

  for (let time = RACE_FIRST_FRAME_TIME; time <= RACE_LAST_FRAME_TIME; time += 1) {
    for (const action of normalizedActions.filter((item) => item.time === time)) {
      if (action.type === "accelerate") accelerationUntil = time + 10;
      if (action.type === "slow") slowUntil = time + 10;
      if (action.type === "bear-away") bearAwayUntil = time + 3;
      if (action.type === "return" && time >= 0) returningToStart = true;
      if (action.type === "tack") {
        user.tack = user.tack === "starboard" ? "port" : "starboard";
        lastUserTackTime = time;
      }
    }

    const condition = getCondition(config.condition, time);
    if (time >= 0 && time - lastUserTackTime >= 5) {
      const atLeftLayline = user.x <= 17 && user.tack === "starboard";
      const atRightLayline = user.x >= 83 && user.tack === "port";
      if (atLeftLayline || atRightLayline) {
        user.tack = user.tack === "starboard" ? "port" : "starboard";
        lastUserTackTime = time;
        events.push({ time, kind: "action", label: "レイラインで自動タック" });
      }
    }

    const preStart = time < 0;
    let userHeading = preStart ? 0 : getHeading(user.tack, condition.windAngle);
    if (time <= bearAwayUntil) {
      userHeading = condition.windAngle + (user.tack === "starboard" ? -78 : 78);
    }
    if (returningToStart) userHeading = 180;
    if (!preStart && user.y >= 109) {
      userHeading = Math.atan2(
        RACE_WINDWARD_MARK.x - user.x,
        RACE_WINDWARD_MARK.y - user.y,
      ) * 180 / Math.PI;
    }
    let userSpeed = preStart ? 0.22 : 0.72;
    if (time <= accelerationUntil) userSpeed = preStart ? 0.52 : 0.79;
    if (time <= slowUntil) userSpeed = preStart ? 0.08 : 0.46;
    if (returningToStart) userSpeed = 0.64;
    if (time - lastUserTackTime >= 0 && time - lastUserTackTime < 4) {
      userSpeed *= [0.42, 0.58, 0.76, 0.9][time - lastUserTackTime];
    }
    if (!preStart && getIsInGust(user, condition.gustSide)) userSpeed *= 1.1;

    if (time === 0 && !startWasRecorded) {
      const lineDeltaBoatLengths = getRaceStartLineY(user.x, config.condition) - user.y;
      const isOcs = lineDeltaBoatLengths < 0;
      const rank = getRank(user, fleet, isOcs);
      start = {
        isOcs,
        ocsCleared: !isOcs,
        lineDeltaSeconds: Number((lineDeltaBoatLengths / Math.max(0.1, userSpeed)).toFixed(1)),
        rank,
      };
      ocsOutstanding = isOcs;
      events.push(isOcs
        ? { time: 0, kind: "rule", label: "X旗：個別リコール（OCS）" }
        : { time: 0, kind: "start", label: `スタート順位 ${rank}位` });
      startWasRecorded = true;
    }

    fleet = fleet.map((boat, index) => {
      if (boat.markReachedTime !== undefined) return boat;
      let tack = boat.tack;
      if (time >= 0) {
        const shouldTurnAtLeft = boat.x <= 16 && tack === "starboard";
        const shouldTurnAtRight = boat.x >= 84 && tack === "port";
        if (shouldTurnAtLeft || shouldTurnAtRight) tack = tack === "starboard" ? "port" : "starboard";
      }
      let heading = preStart ? 0 : getHeading(tack, condition.windAngle + ((index % 3) - 1) * 0.7);
      if (!preStart && boat.y >= 110) {
        heading = Math.atan2(
          RACE_WINDWARD_MARK.x - boat.x,
          RACE_WINDWARD_MARK.y - boat.y,
        ) * 180 / Math.PI;
      }
      let speed = preStart ? boat.speed : 0.67 + (index % 4) * 0.015;
      if (!preStart && getIsInGust(boat, condition.gustSide)) speed *= 1.1;
      const nextBoat: FleetBoatState = {
        ...move({ ...boat, tack }, heading, speed, condition.current),
        id: boat.id,
        sailNumber: boat.sailNumber,
        tack,
      };
      return getDistance(nextBoat, RACE_WINDWARD_MARK) <= RACE_MARK_REACH_RADIUS
        ? { ...nextBoat, speed: 0, markReachedTime: time }
        : nextBoat;
    });

    const cleanAir = preStart || getIsCleanAir(user, fleet);
    if (!preStart && !cleanAir) userSpeed *= 0.86;
    user = move(user, userHeading, userSpeed, condition.current);

    const lineDeltaBoatLengths = getRaceStartLineY(user.x, config.condition) - user.y;
    if (time > 0 && ocsOutstanding && lineDeltaBoatLengths >= 0) {
      ocsOutstanding = false;
      returningToStart = false;
      start = { ...start, ocsCleared: true };
      events.push({ time, kind: "start", label: "ライン下へ戻り、再スタート" });
    }

    const ruleRisk = time >= 0 && fleet.some((boat) =>
      user.tack === "port"
      && boat.tack === "starboard"
      && getDistance(user, boat) <= 2.2);
    if (ruleRisk && time - lastRuleRiskTime >= 5) {
      ruleRiskCount += 1;
      lastRuleRiskTime = time;
      events.push({ time, kind: "rule", label: "RRS 10：スターボード艇を先に避ける" });
    }

    const onLiftedTack = getIsLiftedTack(user.tack, condition.windAngle);
    if (time >= 0 && cleanAir) cleanAirSeconds += 1;
    if (time >= 0 && onLiftedTack) liftedTackSeconds += 1;
    const rank = getRank(user, fleet, ocsOutstanding);
    frames.push({
      time,
      windAngle: condition.windAngle,
      current: condition.current,
      user,
      fleet,
      rank,
      cleanAir,
      onLiftedTack,
      isOcsOutstanding: ocsOutstanding,
      lineDeltaBoatLengths,
    });

    const markDistance = getDistance(user, RACE_WINDWARD_MARK);
    if (time >= 0 && !markZoneEntered && markDistance <= RACE_MARK_ZONE_RADIUS) {
      markZoneEntered = true;
      events.push({
        time,
        kind: "mark",
        label: "3艇身ゾーン：内外とオーバーラップを確認",
      });
    }
    if (time >= 0 && markDistance <= RACE_MARK_REACH_RADIUS) {
      markReached = true;
      events.push({ time, kind: "mark", label: `第1上マーク ${rank}位` });
      break;
    }
  }

  events.sort((a, b) => a.time - b.time);
  const finishRank = frames.at(-1)?.rank ?? fleetCount + 1;
  return {
    frames,
    events,
    actions: normalizedActions,
    start,
    finishRank,
    cleanAirSeconds,
    liftedTackSeconds,
    ruleRiskCount,
    markReached,
  };
}

export const getRaceTackLabel = (tack: Tack) => tack === "starboard" ? "スターボード" : "ポート";
