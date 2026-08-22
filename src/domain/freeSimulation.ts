import {
  BOAT_LENGTH_PX,
  getLeverage,
  getRelativeGain,
  type Frame,
  type Point,
  type ScenarioEvent,
  type Tack,
} from "./simulation";

export const FREE_SCENARIO_DURATION = 36;

export type CourseLeg = "upwind" | "downwind";
export type WindPattern = "hold" | "return" | "return-past";
export type OpponentMode = "hold" | "fixed" | "cover";

export interface FreeScenarioConfig {
  leg: CourseLeg;
  shiftAngle: number;
  windPattern: WindPattern;
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
}

export const DEFAULT_FREE_CONFIG: FreeScenarioConfig = {
  leg: "upwind",
  shiftAngle: 10,
  windPattern: "return",
  leverageBoatLengths: 12,
  opponentMode: "fixed",
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeManeuverTimes = (times: number[]) =>
  [...new Set(times.map((time) => Math.round(time)))]
    .filter((time) => time >= 0 && time <= FREE_SCENARIO_DURATION)
    .sort((a, b) => a - b);

export function getFreeWindAngle(time: number, config: FreeScenarioConfig): number {
  const safeTime = clamp(time, 0, FREE_SCENARIO_DURATION);
  if (safeTime <= 4) return 0;
  if (safeTime < 10) return ((safeTime - 4) / 6) * config.shiftAngle;
  if (config.windPattern === "hold" || safeTime <= 16) return config.shiftAngle;

  const endAngle = config.windPattern === "return" ? 0 : config.shiftAngle * -0.7;
  if (safeTime < 30) {
    return config.shiftAngle + ((safeTime - 16) / 14) * (endAngle - config.shiftAngle);
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

  for (let time = 0; time <= FREE_SCENARIO_DURATION; time += 1) {
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

    userManeuverLoss += baseSpeed - userSpeed;
    opponentManeuverLoss += baseSpeed - opponentSpeed;
    userPosition = moveBoat(userPosition, userSpeed, userHeading);
    opponentPosition = moveBoat(opponentPosition, opponentSpeed, opponentHeading);
  }

  const direction = config.shiftAngle < 0 ? "左" : "右";
  const maneuver = config.leg === "upwind" ? "タック" : "ジャイブ";
  const events: ScenarioEvent[] = [
    {
      time: 4,
      kind: "shift",
      label: config.shiftAngle === 0 ? "平均風向のまま" : `${direction}振れが始まる`,
    },
    {
      time: 10,
      kind: "peak",
      label: config.shiftAngle === 0 ? "風向変化なし" : `${direction}振れ 最大${Math.abs(config.shiftAngle)}°`,
    },
  ];

  if (config.windPattern !== "hold") {
    events.push({ time: 16, kind: "return", label: "風が戻り始める" });
    events.push({
      time: 30,
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
  };
}
