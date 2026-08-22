import {
  BOAT_LENGTH_PX,
  DOWNWIND_MARK,
  getLeverage,
  getMarkDistance,
  getRelativeGain,
  MARK_REACH_RADIUS_PX,
  UPWIND_MARK,
  type Frame,
  type Point,
  type MarkResult,
  type ScenarioEvent,
  type Tack,
} from "./simulation";

export const FREE_SCENARIO_MAX_DURATION = 120;

export type CourseLeg = "upwind" | "downwind";
export type WindPattern = "hold" | "return" | "return-past";
export type WindTempo = "quick" | "standard" | "slow";
export type OpponentMode = "hold" | "fixed" | "cover";

export interface FreeScenarioConfig {
  leg: CourseLeg;
  shiftAngle: number;
  windPattern: WindPattern;
  windTempo: WindTempo;
  leverageBoatLengths: number;
  opponentMode: OpponentMode;
}

export interface FreeScenarioReplay {
  frames: Frame[];
  events: ScenarioEvent[];
  userManeuverTimes: number[];
  opponentManeuverTimes: number[];
  userManeuverLoss: number;
  opponentManeuverLoss: number;
  finalRelativeGain: number;
  gainChange: number;
  maxRelativeGain: number;
  minRelativeGain: number;
  endTime: number;
  markResult: MarkResult;
  markDistance: number;
}

export interface FreeWindTimeline {
  shiftStart: number;
  peak: number;
  returnStart: number;
  returnEnd: number;
}

export type TimingOffset = -4 | 0 | 4;

export interface TimingTrial {
  offset: TimingOffset;
  maneuverTime: number;
  maneuverTimes: number[];
  markResult: MarkResult;
  endTime: number;
  markDistance: number;
  relativeGain: number;
  maneuverLoss: number;
}

export interface TimingAnalysis {
  bestOffset: TimingOffset;
  trials: TimingTrial[];
}

export const DEFAULT_FREE_CONFIG: FreeScenarioConfig = {
  leg: "upwind",
  shiftAngle: 10,
  windPattern: "return",
  windTempo: "standard",
  leverageBoatLengths: 12,
  opponentMode: "fixed",
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeManeuverTimes = (times: number[]) =>
  [...new Set(times.map((time) => Math.round(time)))]
    .filter((time) => time >= 0 && time <= FREE_SCENARIO_MAX_DURATION)
    .sort((a, b) => a - b);

const WIND_TIMELINES: Record<WindTempo, FreeWindTimeline> = {
  quick: { shiftStart: 2, peak: 7, returnStart: 11, returnEnd: 22 },
  standard: { shiftStart: 4, peak: 10, returnStart: 16, returnEnd: 30 },
  slow: { shiftStart: 6, peak: 14, returnStart: 22, returnEnd: 40 },
};

export function getFreeWindTimeline(config: FreeScenarioConfig): FreeWindTimeline {
  return WIND_TIMELINES[config.windTempo];
}

export function getFreeWindAngle(time: number, config: FreeScenarioConfig): number {
  const safeTime = clamp(time, 0, FREE_SCENARIO_MAX_DURATION);
  const timeline = getFreeWindTimeline(config);
  if (safeTime <= timeline.shiftStart) return 0;
  if (safeTime < timeline.peak) {
    return ((safeTime - timeline.shiftStart) / (timeline.peak - timeline.shiftStart)) * config.shiftAngle;
  }
  if (config.windPattern === "hold" || safeTime <= timeline.returnStart) return config.shiftAngle;

  const endAngle = config.windPattern === "return" ? 0 : config.shiftAngle * -0.7;
  if (safeTime < timeline.returnEnd) {
    return config.shiftAngle
      + ((safeTime - timeline.returnStart) / (timeline.returnEnd - timeline.returnStart))
      * (endAngle - config.shiftAngle);
  }
  return endAngle;
}

export function getOpponentManeuverTimes(
  config: FreeScenarioConfig,
  userManeuverTimes: number[],
): number[] {
  if (config.opponentMode === "hold") return [];
  if (config.opponentMode === "fixed") return [18];
  return normalizeManeuverTimes(userManeuverTimes.map((time) => time + 2));
}

const getTack = (time: number, maneuverTimes: number[]): Tack => {
  let maneuverCount = 0;
  for (const maneuverTime of maneuverTimes) {
    if (maneuverTime > time) break;
    maneuverCount += 1;
  }
  return maneuverCount % 2 === 0 ? "port" : "starboard";
};

const getSpeed = (time: number, maneuverTimes: number[], leg: CourseLeg) => {
  const baseSpeed = leg === "upwind" ? 8.4 : 7.2;
  let latestManeuver: number | null = null;
  for (const maneuverTime of maneuverTimes) {
    if (maneuverTime > time) break;
    latestManeuver = maneuverTime;
  }
  if (latestManeuver === null) return baseSpeed;

  const secondsAfter = time - latestManeuver;
  const recovery = leg === "upwind" ? [0.28, 0.5, 0.7, 0.86] : [0.48, 0.7, 0.86];
  return baseSpeed * (recovery[secondsAfter] ?? 1);
};

const getHeading = (tack: Tack, windAngle: number, leg: CourseLeg) => {
  const courseAngle = leg === "upwind" ? 45 : 135;
  return windAngle + (tack === "port" ? courseAngle : -courseAngle);
};

const moveBoat = (position: Point, speed: number, heading: number): Point => {
  const radians = degreesToRadians(heading);
  return {
    x: position.x + Math.sin(radians) * speed,
    y: position.y + Math.cos(radians) * speed,
  };
};

const getLegRelativeGain = (
  boat: Point,
  reference: Point,
  windAngle: number,
  leg: CourseLeg,
) => {
  const upwindGain = getRelativeGain(boat, reference, windAngle);
  return leg === "upwind" ? upwindGain : -upwindGain;
};

export function runFreeScenario(
  config: FreeScenarioConfig,
  requestedUserManeuverTimes: number[],
): FreeScenarioReplay {
  const userManeuverTimes = normalizeManeuverTimes(requestedUserManeuverTimes);
  const opponentManeuverTimes = getOpponentManeuverTimes(config, userManeuverTimes);
  const separation = clamp(config.leverageBoatLengths, 2, 22) * BOAT_LENGTH_PX;
  const initialY = config.leg === "upwind" ? 105 : 405;
  let userPosition: Point = { x: 275 + separation / 2, y: initialY };
  let opponentPosition: Point = { x: 275 - separation / 2, y: initialY };
  const baseSpeed = config.leg === "upwind" ? 8.4 : 7.2;
  let userManeuverLoss = 0;
  let opponentManeuverLoss = 0;
  const frames: Frame[] = [];
  let markResult: MarkResult = "timeout";
  const mark = config.leg === "upwind" ? UPWIND_MARK : DOWNWIND_MARK;
  const windTimeline = getFreeWindTimeline(config);

  for (let time = 0; time <= FREE_SCENARIO_MAX_DURATION; time += 1) {
    const windAngle = getFreeWindAngle(time, config);
    const userTack = getTack(time, userManeuverTimes);
    const opponentTack = getTack(time, opponentManeuverTimes);
    const userSpeed = getSpeed(time, userManeuverTimes, config.leg);
    const opponentSpeed = getSpeed(time, opponentManeuverTimes, config.leg);
    const userHeading = getHeading(userTack, windAngle, config.leg);
    const opponentHeading = getHeading(opponentTack, windAngle, config.leg);

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
      relativeGain: getLegRelativeGain(userPosition, opponentPosition, windAngle, config.leg),
      leverage: getLeverage(userPosition, opponentPosition, windAngle),
    });

    const markDistance = getMarkDistance(userPosition, config.leg);
    const crossedMarkLine = config.leg === "upwind"
      ? userPosition.y >= mark.y
      : userPosition.y <= mark.y;
    if (markDistance <= MARK_REACH_RADIUS_PX) {
      markResult = "reached";
      break;
    }
    if (crossedMarkLine) {
      markResult = markDistance <= MARK_REACH_RADIUS_PX ? "reached" : "missed";
      break;
    }

    userManeuverLoss += baseSpeed - userSpeed;
    opponentManeuverLoss += baseSpeed - opponentSpeed;
    userPosition = moveBoat(userPosition, userSpeed, userHeading);
    opponentPosition = moveBoat(opponentPosition, opponentSpeed, opponentHeading);
  }

  const direction = config.shiftAngle < 0 ? "左" : "右";
  const maneuver = config.leg === "upwind" ? "タック" : "ジャイブ";
  const events: ScenarioEvent[] = [
    {
      time: windTimeline.shiftStart,
      kind: "shift",
      label: config.shiftAngle === 0 ? "平均風向のまま" : `${direction}振れが始まる`,
    },
    {
      time: windTimeline.peak,
      kind: "peak",
      label: config.shiftAngle === 0 ? "風向変化なし" : `${direction}振れ 最大${Math.abs(config.shiftAngle)}°`,
    },
  ];

  if (config.windPattern !== "hold") {
    events.push({ time: windTimeline.returnStart, kind: "return", label: "風が戻り始める" });
    events.push({
      time: windTimeline.returnEnd,
      kind: "mean",
      label: config.windPattern === "return" ? "平均風向へ戻る" : "反対側まで戻る",
    });
  }
  for (const time of userManeuverTimes) {
    events.push({ time, kind: "user-tack", label: `あなたが${maneuver}` });
  }
  for (const time of opponentManeuverTimes) {
    events.push({ time, kind: "opponent-tack", label: `相手が${maneuver}` });
  }
  const finalFrame = frames[frames.length - 1];
  events.push({
    time: finalFrame.time,
    kind: "finish",
    label: markResult === "reached"
      ? `${config.leg === "upwind" ? "風上" : "風下"}マークに到達`
      : markResult === "missed"
        ? "マークを外して通過"
        : "制限時間で終了",
  });
  events.sort((a, b) => a.time - b.time);

  const gains = frames.map((frame) => frame.relativeGain / BOAT_LENGTH_PX);
  const firstGain = gains[0];
  const finalRelativeGain = gains[gains.length - 1];

  return {
    frames,
    events,
    userManeuverTimes,
    opponentManeuverTimes,
    userManeuverLoss: userManeuverLoss / BOAT_LENGTH_PX,
    opponentManeuverLoss: opponentManeuverLoss / BOAT_LENGTH_PX,
    finalRelativeGain,
    gainChange: finalRelativeGain - firstGain,
    maxRelativeGain: Math.max(...gains),
    minRelativeGain: Math.min(...gains),
    endTime: finalFrame.time,
    markResult,
    markDistance: getMarkDistance(finalFrame.user, config.leg) / BOAT_LENGTH_PX,
  };
}

export function getRelativeGainDifferenceAtCommonTime(
  replay: FreeScenarioReplay,
  reference: FreeScenarioReplay,
): { time: number; difference: number } {
  const time = Math.min(replay.endTime, reference.endTime);
  const replayGain = replay.frames[time].relativeGain / BOAT_LENGTH_PX;
  const referenceGain = reference.frames[time].relativeGain / BOAT_LENGTH_PX;
  return { time, difference: replayGain - referenceGain };
}

const MARK_RESULT_PRIORITY: Record<MarkResult, number> = {
  timeout: 0,
  missed: 1,
  reached: 2,
};

const compareTimingTrials = (left: TimingTrial, right: TimingTrial) => {
  const markDifference = MARK_RESULT_PRIORITY[right.markResult] - MARK_RESULT_PRIORITY[left.markResult];
  if (markDifference !== 0) return markDifference;

  if (left.markResult === "reached" && left.endTime !== right.endTime) {
    return left.endTime - right.endTime;
  }
  if (left.markResult !== "reached" && Math.abs(left.markDistance - right.markDistance) >= 0.1) {
    return left.markDistance - right.markDistance;
  }
  if (Math.abs(left.relativeGain - right.relativeGain) >= 0.1) {
    return right.relativeGain - left.relativeGain;
  }
  return Math.abs(left.offset) - Math.abs(right.offset);
};

export function analyzeFirstManeuverTiming(
  config: FreeScenarioConfig,
  userManeuverTimes: number[],
): TimingAnalysis | null {
  const normalizedTimes = normalizeManeuverTimes(userManeuverTimes);
  const firstManeuverTime = normalizedTimes[0];
  if (firstManeuverTime === undefined) return null;

  const offsets: TimingOffset[] = [-4, 0, 4];
  const trials = offsets.map((offset): TimingTrial => {
    const maneuverTimes = normalizeManeuverTimes(
      normalizedTimes.map((time) => clamp(time + offset, 1, FREE_SCENARIO_MAX_DURATION)),
    );
    const maneuverTime = maneuverTimes[0];
    const replay = runFreeScenario(config, maneuverTimes);
    return {
      offset,
      maneuverTime,
      maneuverTimes,
      markResult: replay.markResult,
      endTime: replay.endTime,
      markDistance: replay.markDistance,
      relativeGain: replay.finalRelativeGain,
      maneuverLoss: replay.userManeuverLoss,
    };
  });
  const bestTrial = [...trials].sort(compareTimingTrials)[0];

  return { bestOffset: bestTrial.offset, trials };
}
