import {
  BOAT_LENGTH_PX,
  DOWNWIND_MARK,
  getLeverage,
  getMarkDistance,
  getRelativeGain,
  MARK_REACH_RADIUS_PX,
  UPWIND_MARK,
  type BlanketState,
  type Frame,
  type Point,
  type MarkResult,
  type ScenarioEvent,
  type Tack,
} from "./simulation";

export const FREE_SCENARIO_MAX_DURATION = 120;

export type CourseLeg = "upwind" | "downwind";
export type WindPattern = "oscillating" | "hold" | "return" | "return-past";
export type WindTempo = "quick" | "standard" | "slow";
export type OpponentMode = "hold" | "optimize" | "fixed" | "cover";

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
  userBlanketLoss: number;
  opponentBlanketLoss: number;
  userBlanketSeconds: number;
  opponentBlanketSeconds: number;
  finalRelativeGain: number;
  gainChange: number;
  maxRelativeGain: number;
  minRelativeGain: number;
  endTime: number;
  markResult: MarkResult;
  markDistance: number;
  opponentDecisions: OpponentDecision[];
}

export interface OpponentDecision {
  time: number;
  action: "tack" | "duck";
  secondsToMeeting: number;
  closestDistanceBoatLengths: number;
  maneuverRecoverySeconds: number;
  safetyMarginSeconds: number;
  meetingPoint: Point;
}

export interface FreeWindTimeline {
  shiftStart: number;
  peak: number;
  returnStart: number;
  returnEnd: number;
}

export type ManeuverPlanRating = "on-plan" | "early" | "late" | "not-executed";

export interface ManeuverPlanReview {
  plannedTime: number;
  actualTime: number | null;
  delta: number | null;
  rating: ManeuverPlanRating;
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

export type ShiftTimingChoice = "onset" | "peak";
export type ShiftTimingRecommendation = ShiftTimingChoice | "close" | "hold";

export interface ShiftTimingTrial {
  choice: ShiftTimingChoice;
  maneuverTime: number;
  windAngle: number;
  relativeGain: number;
  maneuverLoss: number;
  markResult: MarkResult;
  endTime: number;
  markDistance: number;
}

export interface ShiftTimingAnalysis {
  onset: ShiftTimingTrial;
  peak: ShiftTimingTrial;
  comparisonTime: number;
  gainDifference: number;
  recommendation: ShiftTimingRecommendation;
}

export type WindTrend = "left" | "steady" | "right";
export type SailingShiftState = "favored" | "neutral" | "unfavored";
export type ManeuverReason = "wind" | "opponent" | "mark";
export type ManeuverReasonVerdict = "supported" | "reconsider" | "unclear" | "unrecorded";

export interface ManeuverReasonCall {
  time: number;
  reason: ManeuverReason;
}

export interface TacticalCueEvidence {
  supported: boolean;
  observation: string;
}

export interface ManeuverPointReview {
  maneuverNumber: number;
  time: number;
  windAngle: number;
  windTrend: WindTrend;
  tackBefore: Tack;
  tackAfter: Tack;
  stateBefore: SailingShiftState;
  stateAfter: SailingShiftState;
  secondsSincePrevious: number | null;
  declaredReason: ManeuverReason | null;
  strongestCue: ManeuverReason | null;
  reasonVerdict: ManeuverReasonVerdict;
  tacticalCues: Record<ManeuverReason, TacticalCueEvidence>;
  bestOffset: TimingOffset;
  trials: TimingTrial[];
}

export interface WindDecisionSnapshot {
  windAngle: number;
  windTrend: WindTrend;
  tack: Tack;
  state: SailingShiftState;
}

export type WinningRouteStatus = "already-winning" | "win-found" | "best-improvement";

export interface WinningRouteResult {
  maneuverTimes: number[];
  markResult: MarkResult;
  endTime: number;
  markDistance: number;
  relativeGain: number;
}

export interface WinningRouteAnalysis {
  status: WinningRouteStatus;
  current: WinningRouteResult;
  recommended: WinningRouteResult;
  exploredRoutes: number;
}

export const DEFAULT_FREE_CONFIG: FreeScenarioConfig = {
  leg: "upwind",
  shiftAngle: 10,
  windPattern: "oscillating",
  windTempo: "standard",
  leverageBoatLengths: 12,
  opponentMode: "hold",
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const isCourseLeg = (value: string | null): value is CourseLeg =>
  value === "upwind" || value === "downwind";

const isWindPattern = (value: string | null): value is WindPattern =>
  value === "oscillating" || value === "hold" || value === "return" || value === "return-past";

const isWindTempo = (value: string | null): value is WindTempo =>
  value === "quick" || value === "standard" || value === "slow";

const isOpponentMode = (value: string | null): value is OpponentMode =>
  value === "hold" || value === "optimize" || value === "fixed" || value === "cover";

const readBoundedInteger = (
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  if (value === null || value.trim() === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), minimum, maximum) : fallback;
};

// URLSearchParams is the browser-standard query serializer used by the share link.
// Source: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
export function serializeFreeScenarioConfig(config: FreeScenarioConfig): string {
  const parameters = new URLSearchParams();
  parameters.set("v", "1");
  parameters.set("leg", config.leg);
  parameters.set("shift", String(clamp(Math.round(config.shiftAngle), -18, 18)));
  parameters.set("pattern", config.windPattern);
  parameters.set("tempo", config.windTempo);
  parameters.set("leverage", String(clamp(Math.round(config.leverageBoatLengths), 2, 22)));
  parameters.set("opponent", config.opponentMode);
  return parameters.toString();
}

export function parseFreeScenarioConfig(search: string): FreeScenarioConfig | null {
  const parameters = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (parameters.get("v") !== "1") return null;

  const leg = parameters.get("leg");
  const windPattern = parameters.get("pattern");
  const windTempo = parameters.get("tempo");
  const opponentMode = parameters.get("opponent");

  return {
    leg: isCourseLeg(leg) ? leg : DEFAULT_FREE_CONFIG.leg,
    shiftAngle: readBoundedInteger(parameters.get("shift"), DEFAULT_FREE_CONFIG.shiftAngle, -18, 18),
    windPattern: isWindPattern(windPattern) ? windPattern : DEFAULT_FREE_CONFIG.windPattern,
    windTempo: isWindTempo(windTempo) ? windTempo : DEFAULT_FREE_CONFIG.windTempo,
    leverageBoatLengths: readBoundedInteger(
      parameters.get("leverage"),
      DEFAULT_FREE_CONFIG.leverageBoatLengths,
      2,
      22,
    ),
    opponentMode: isOpponentMode(opponentMode) ? opponentMode : DEFAULT_FREE_CONFIG.opponentMode,
  };
}

const normalizeManeuverTimes = (times: number[]) =>
  [...new Set(times.map((time) => Math.round(time)))]
    .filter((time) => time >= 0 && time <= FREE_SCENARIO_MAX_DURATION)
    .sort((a, b) => a - b);

export function evaluateManeuverPlan(
  requestedPlannedTime: number,
  userManeuverTimes: number[],
): ManeuverPlanReview {
  const plannedTime = clamp(Math.round(requestedPlannedTime), 1, FREE_SCENARIO_MAX_DURATION);
  const actualTime = normalizeManeuverTimes(userManeuverTimes)[0] ?? null;
  if (actualTime === null) {
    return { plannedTime, actualTime, delta: null, rating: "not-executed" };
  }

  const delta = actualTime - plannedTime;
  const rating = Math.abs(delta) <= 1 ? "on-plan" : delta < 0 ? "early" : "late";
  return { plannedTime, actualTime, delta, rating };
}

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
  if (config.windPattern === "oscillating") {
    const quarterCycle = timeline.peak - timeline.shiftStart;
    const radians = ((safeTime - timeline.shiftStart) / quarterCycle) * Math.PI / 2;
    const angle = Math.sin(radians) * config.shiftAngle;
    return Math.abs(angle) < 1e-9 ? 0 : angle;
  }
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
  if (config.opponentMode === "hold" || config.opponentMode === "optimize") return [];
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

const getOppositeTack = (tack: Tack): Tack => tack === "port" ? "starboard" : "port";

const hasReachedMarkLayline = (
  position: Point,
  tack: Tack,
  windAngle: number,
  leg: CourseLeg,
  mark: Point,
) => {
  const heading = getHeading(getOppositeTack(tack), windAngle, leg);
  const radians = degreesToRadians(heading);
  const direction = { x: Math.sin(radians), y: Math.cos(radians) };
  const toMark = { x: mark.x - position.x, y: mark.y - position.y };
  const distanceAlongNewTack = toMark.x * direction.x + toMark.y * direction.y;
  const crossTrackDistance = direction.x * toMark.y - direction.y * toMark.x;

  return distanceAlongNewTack > MARK_REACH_RADIUS_PX
    && Math.abs(crossTrackDistance) <= BOAT_LENGTH_PX;
};

const getVelocity = (speed: number, heading: number): Point => {
  const radians = degreesToRadians(heading);
  return { x: Math.sin(radians) * speed, y: Math.cos(radians) * speed };
};

interface MeetingPrediction {
  secondsToClosestApproach: number;
  closestDistance: number;
  meetingPoint: Point;
}

const MANEUVER_SAFETY_MARGIN_SECONDS = 1;

const makeOpponentDecision = (
  time: number,
  action: OpponentDecision["action"],
  prediction: MeetingPrediction,
  maneuverRecoverySeconds: number,
): OpponentDecision => {
  const secondsToMeeting = Math.round(prediction.secondsToClosestApproach);
  return {
    time,
    action,
    secondsToMeeting,
    closestDistanceBoatLengths: Number((prediction.closestDistance / BOAT_LENGTH_PX).toFixed(1)),
    maneuverRecoverySeconds,
    safetyMarginSeconds: secondsToMeeting
      - maneuverRecoverySeconds
      - MANEUVER_SAFETY_MARGIN_SECONDS,
    meetingPoint: prediction.meetingPoint,
  };
};

const getMeetingPrediction = (
  userPosition: Point,
  opponentPosition: Point,
  userSpeed: number,
  opponentSpeed: number,
  userHeading: number,
  opponentHeading: number,
  seconds: number,
): MeetingPrediction | null => {
  const userVelocity = getVelocity(userSpeed, userHeading);
  const opponentVelocity = getVelocity(opponentSpeed, opponentHeading);
  const relativePosition = {
    x: opponentPosition.x - userPosition.x,
    y: opponentPosition.y - userPosition.y,
  };
  const relativeVelocity = {
    x: opponentVelocity.x - userVelocity.x,
    y: opponentVelocity.y - userVelocity.y,
  };
  const relativeSpeedSquared = relativeVelocity.x ** 2 + relativeVelocity.y ** 2;
  if (relativeSpeedSquared < 0.01) return null;

  const closestTime = -(
    relativePosition.x * relativeVelocity.x
    + relativePosition.y * relativeVelocity.y
  ) / relativeSpeedSquared;
  if (closestTime < 0 || closestTime > seconds) return null;

  const closestDistance = Math.hypot(
    relativePosition.x + relativeVelocity.x * closestTime,
    relativePosition.y + relativeVelocity.y * closestTime,
  );
  const userClosestPoint = {
    x: userPosition.x + userVelocity.x * closestTime,
    y: userPosition.y + userVelocity.y * closestTime,
  };
  const opponentClosestPoint = {
    x: opponentPosition.x + opponentVelocity.x * closestTime,
    y: opponentPosition.y + opponentVelocity.y * closestTime,
  };
  return closestDistance <= BOAT_LENGTH_PX * 2.2
    ? {
      secondsToClosestApproach: closestTime,
      closestDistance,
      meetingPoint: {
        x: (userClosestPoint.x + opponentClosestPoint.x) / 2,
        y: (userClosestPoint.y + opponentClosestPoint.y) / 2,
      },
    }
    : null;
};

const getBearAwayHeading = (tack: Tack, windAngle: number, leg: CourseLeg) => {
  const courseAngle = leg === "upwind" ? 75 : 165;
  return windAngle + (tack === "port" ? courseAngle : -courseAngle);
};

const moveBoat = (position: Point, speed: number, heading: number): Point => {
  const radians = degreesToRadians(heading);
  return {
    x: position.x + Math.sin(radians) * speed,
    y: position.y + Math.cos(radians) * speed,
  };
};

const BLANKET_MAX_DISTANCE_BOAT_LENGTHS = 8;
const BLANKET_MAX_SPEED_LOSS = 0.28;

const getBlanketState = ({
  source,
  target,
  sourcePosition,
  targetPosition,
  sourceTack,
  targetTack,
  sourceHeading,
  sourceSpeed,
  targetCleanSpeed,
  windAngle,
  baseSpeed,
}: {
  source: BlanketState["source"];
  target: BlanketState["affected"];
  sourcePosition: Point;
  targetPosition: Point;
  sourceTack: Tack;
  targetTack: Tack;
  sourceHeading: number;
  sourceSpeed: number;
  targetCleanSpeed: number;
  windAngle: number;
  baseSpeed: number;
}): BlanketState | null => {
  if (sourceTack !== targetTack) return null;

  // The severe-interference zone follows apparent wind rather than true wind,
  // and drive force recovers close to one boat length either side of its axis.
  // The 28% maximum *speed* loss is a milder 420 teaching assumption because
  // the cited wind-tunnel study measured force, not 420 boat speed.
  // Sources: https://doi.org/10.5957/CSYS-2013-012
  // https://www.sailing.org/tools/documents/TRUMwebpagesFinal-%5B20252%5D.pdf
  const trueWindSpeed = baseSpeed * 1.7;
  const windFlow = getVelocity(trueWindSpeed, windAngle + 180);
  const sourceVelocity = getVelocity(sourceSpeed, sourceHeading);
  const apparentFlow = {
    x: windFlow.x - sourceVelocity.x,
    y: windFlow.y - sourceVelocity.y,
  };
  const apparentSpeed = Math.hypot(apparentFlow.x, apparentFlow.y);
  if (apparentSpeed < 0.01) return null;
  const wake = {
    x: apparentFlow.x / apparentSpeed,
    y: apparentFlow.y / apparentSpeed,
  };
  const relative = {
    x: targetPosition.x - sourcePosition.x,
    y: targetPosition.y - sourcePosition.y,
  };
  const downwindDistance = relative.x * wake.x + relative.y * wake.y;
  const downwindBoatLengths = downwindDistance / BOAT_LENGTH_PX;
  if (downwindBoatLengths < 0.4
    || downwindBoatLengths > BLANKET_MAX_DISTANCE_BOAT_LENGTHS) return null;

  const crosswindDistance = Math.abs(relative.x * wake.y - relative.y * wake.x);
  const halfWidthBoatLengths = Math.min(1.35, 0.9 + downwindBoatLengths * 0.06);
  const crosswindBoatLengths = crosswindDistance / BOAT_LENGTH_PX;
  if (crosswindBoatLengths >= halfWidthBoatLengths) return null;

  const distanceStrength = 1
    - (downwindBoatLengths - 0.4) / (BLANKET_MAX_DISTANCE_BOAT_LENGTHS - 0.4);
  const lateralStrength = 1 - crosswindBoatLengths / halfWidthBoatLengths;
  const strength = clamp(distanceStrength * lateralStrength, 0, 1);
  if (strength < 0.04) return null;
  return {
    affected: target,
    source,
    strength,
    speedMultiplier: 1 - BLANKET_MAX_SPEED_LOSS * strength,
    cleanSpeed: targetCleanSpeed,
    wakeHeading: Math.atan2(wake.x, wake.y) * 180 / Math.PI,
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
  const scheduledOpponentManeuverTimes = getOpponentManeuverTimes(config, userManeuverTimes);
  const opponentManeuverTimes: number[] = [];
  const opponentLaylineTackTimes = new Set<number>();
  const opponentMeetingTackTimes = new Set<number>();
  const opponentOptimizedTackTimes = new Set<number>();
  const opponentAvoidanceTimes: number[] = [];
  const opponentDecisions: OpponentDecision[] = [];
  const separation = clamp(config.leverageBoatLengths, 2, 22) * BOAT_LENGTH_PX;
  const initialY = config.leg === "upwind" ? 105 : 405;
  let userPosition: Point = { x: 275 + separation / 2, y: initialY };
  let opponentPosition: Point = { x: 275 - separation / 2, y: initialY };
  const baseSpeed = config.leg === "upwind" ? 8.4 : 7.2;
  const maneuverRecoverySeconds = config.leg === "upwind" ? 4 : 3;
  const safeManeuverLeadSeconds = maneuverRecoverySeconds + MANEUVER_SAFETY_MARGIN_SECONDS;
  let userManeuverLoss = 0;
  let opponentManeuverLoss = 0;
  let userBlanketLoss = 0;
  let opponentBlanketLoss = 0;
  let userBlanketSeconds = 0;
  let opponentBlanketSeconds = 0;
  let opponentAvoidUntil = -1;
  let lastOpponentAvoidanceTime = -10;
  const frames: Frame[] = [];
  let markResult: MarkResult = "timeout";
  const mark = config.leg === "upwind" ? UPWIND_MARK : DOWNWIND_MARK;
  const windTimeline = getFreeWindTimeline(config);

  for (let time = 0; time <= FREE_SCENARIO_MAX_DURATION; time += 1) {
    const windAngle = getFreeWindAngle(time, config);
    const userTack = getTack(time, userManeuverTimes);
    const opponentTackBeforeManeuver = getTack(time, opponentManeuverTimes);
    const lastOpponentManeuverTime = opponentManeuverTimes[opponentManeuverTimes.length - 1] ?? -10;
    const scheduledManeuver = time - lastOpponentManeuverTime >= maneuverRecoverySeconds
      && scheduledOpponentManeuverTimes.includes(time);
    const laylineManeuver = time - lastOpponentManeuverTime >= 4
      && hasReachedMarkLayline(
        opponentPosition,
        opponentTackBeforeManeuver,
        windAngle,
        config.leg,
        mark,
      );
    const favoredOpponentTack = getFavoredTack(config.leg, windAngle);
    const optimizedManeuver = config.opponentMode === "optimize"
      && time - lastOpponentManeuverTime >= maneuverRecoverySeconds
      && Math.abs(windAngle) >= 4
      && favoredOpponentTack !== null
      && favoredOpponentTack !== opponentTackBeforeManeuver
      && !laylineManeuver;
    const didPlannedManeuver = scheduledManeuver || laylineManeuver || optimizedManeuver;
    if (didPlannedManeuver) {
      opponentManeuverTimes.push(time);
      if (laylineManeuver) opponentLaylineTackTimes.add(time);
      if (optimizedManeuver) opponentOptimizedTackTimes.add(time);
    }
    let opponentTack = getTack(time, opponentManeuverTimes);
    let userSpeed = getSpeed(time, userManeuverTimes, config.leg);
    let opponentSpeed = getSpeed(time, opponentManeuverTimes, config.leg);
    const userHeading = getHeading(userTack, windAngle, config.leg);
    let opponentCourseHeading = getHeading(opponentTack, windAngle, config.leg);
    // RRS 10 requires the port-tack boat to keep clear. Under RRS 13, a boat that
    // has passed head to wind must also keep clear until she is close-hauled. The
    // model therefore acts early only when the predicted crossing leaves the
    // educational maneuver-recovery window plus one second of safety margin.
    // The downwind gybe window is a teaching-model assumption, not a Rule 13 rule.
    // Source: https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf
    const meetingPrediction = userTack === "starboard"
      && opponentTack === "port"
      ? getMeetingPrediction(
        userPosition,
        opponentPosition,
        userSpeed,
        opponentSpeed,
        userHeading,
        opponentCourseHeading,
        12,
      )
      : null;
    const canTackForMeeting = !didPlannedManeuver
      && time - lastOpponentManeuverTime >= 4
      && (meetingPrediction?.secondsToClosestApproach ?? 0) >= safeManeuverLeadSeconds;
    if (meetingPrediction && canTackForMeeting) {
      opponentManeuverTimes.push(time);
      opponentMeetingTackTimes.add(time);
      opponentDecisions.push(makeOpponentDecision(
        time,
        "tack",
        meetingPrediction,
        maneuverRecoverySeconds,
      ));
      opponentTack = getTack(time, opponentManeuverTimes);
      opponentSpeed = getSpeed(time, opponentManeuverTimes, config.leg);
      opponentCourseHeading = getHeading(opponentTack, windAngle, config.leg);
    }
    const isNewAvoidance = meetingPrediction
      && !canTackForMeeting
      && time - lastOpponentAvoidanceTime >= 6;
    if (isNewAvoidance) {
      opponentAvoidUntil = time + 2;
      lastOpponentAvoidanceTime = time;
      opponentAvoidanceTimes.push(time);
      opponentDecisions.push(makeOpponentDecision(
        time,
        "duck",
        meetingPrediction,
        maneuverRecoverySeconds,
      ));
    }
    const opponentHeading = time <= opponentAvoidUntil
      ? getBearAwayHeading(opponentTack, windAngle, config.leg)
      : opponentCourseHeading;
    const userCleanSpeed = userSpeed;
    const opponentCleanSpeed = opponentSpeed;
    const userBlanket = getBlanketState({
      source: "opponent",
      target: "user",
      sourcePosition: opponentPosition,
      targetPosition: userPosition,
      sourceTack: opponentTack,
      targetTack: userTack,
      sourceHeading: opponentHeading,
      sourceSpeed: opponentCleanSpeed,
      targetCleanSpeed: userCleanSpeed,
      windAngle,
      baseSpeed,
    });
    const opponentBlanket = getBlanketState({
      source: "user",
      target: "opponent",
      sourcePosition: userPosition,
      targetPosition: opponentPosition,
      sourceTack: userTack,
      targetTack: opponentTack,
      sourceHeading: userHeading,
      sourceSpeed: userCleanSpeed,
      targetCleanSpeed: opponentCleanSpeed,
      windAngle,
      baseSpeed,
    });
    const blanket = !userBlanket
      ? opponentBlanket
      : !opponentBlanket || userBlanket.strength >= opponentBlanket.strength
        ? userBlanket
        : opponentBlanket;
    if (blanket?.affected === "user") userSpeed *= blanket.speedMultiplier;
    if (blanket?.affected === "opponent") opponentSpeed *= blanket.speedMultiplier;

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
      ...(blanket ? { blanket } : {}),
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

    userManeuverLoss += baseSpeed - userCleanSpeed;
    opponentManeuverLoss += baseSpeed - opponentCleanSpeed;
    userBlanketLoss += userCleanSpeed - userSpeed;
    opponentBlanketLoss += opponentCleanSpeed - opponentSpeed;
    if (blanket?.affected === "user") userBlanketSeconds += 1;
    if (blanket?.affected === "opponent") opponentBlanketSeconds += 1;
    userPosition = moveBoat(userPosition, userSpeed, userHeading);
    opponentPosition = moveBoat(opponentPosition, opponentSpeed, opponentHeading);
  }

  const finalFrame = frames[frames.length - 1];
  const direction = config.shiftAngle < 0 ? "左" : "右";
  const oppositeDirection = config.shiftAngle < 0 ? "右" : "左";
  const maneuver = config.leg === "upwind" ? "タック" : "ジャイブ";
  const events: ScenarioEvent[] = [{
    time: windTimeline.shiftStart,
    kind: "shift",
    label: config.shiftAngle === 0 ? "平均風向のまま" : `${direction}振れが始まる`,
  }];

  if (config.windPattern === "oscillating") {
    const quarterCycle = windTimeline.peak - windTimeline.shiftStart;
    for (let index = 1; ; index += 1) {
      const eventTime = windTimeline.shiftStart + quarterCycle * index;
      if (eventTime > finalFrame.time) break;
      if (index % 2 === 1) {
        const peakDirection = index % 4 === 1 ? direction : oppositeDirection;
        events.push({
          time: eventTime,
          kind: "peak",
          label: config.shiftAngle === 0
            ? "風向変化なし"
            : `${peakDirection}振れ 最大${Math.abs(config.shiftAngle)}°`,
        });
      } else {
        const nextDirection = index % 4 === 2 ? oppositeDirection : direction;
        events.push({
          time: eventTime,
          kind: "mean",
          label: config.shiftAngle === 0 ? "平均風向のまま" : `平均を越えて${nextDirection}へ`,
        });
      }
    }
  } else {
    events.push({
      time: windTimeline.peak,
      kind: "peak",
      label: config.shiftAngle === 0 ? "風向変化なし" : `${direction}振れ 最大${Math.abs(config.shiftAngle)}°`,
    });
  }

  if (config.windPattern !== "hold" && config.windPattern !== "oscillating") {
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
    events.push({
      time,
      kind: "opponent-tack",
      label: opponentLaylineTackTimes.has(time)
        ? `相手がレイラインで${maneuver}`
        : opponentOptimizedTackTimes.has(time)
          ? `相手が最適化判断で${maneuver}`
        : opponentMeetingTackTimes.has(time)
          ? `相手がミート前に${maneuver}`
        : `相手が${maneuver}`,
    });
  }
  for (const time of opponentAvoidanceTimes) {
    events.push({
      time,
      kind: "avoid",
      label: "相手がタックできず、下って避ける",
    });
  }
  let previousBlanketTarget: BlanketState["affected"] | null = null;
  for (const frame of frames) {
    const currentTarget = frame.blanket?.affected ?? null;
    if (currentTarget === previousBlanketTarget) continue;
    if (previousBlanketTarget === "user" && currentTarget !== "user") {
      events.push({
        time: frame.time,
        kind: "blanket",
        label: "自艇がクリーンエアへ戻る",
      });
    }
    if (previousBlanketTarget === "opponent" && currentTarget !== "opponent") {
      events.push({
        time: frame.time,
        kind: "blanket",
        label: "相手がクリーンエアへ戻る",
      });
    }
    if (currentTarget === "user") {
      events.push({ time: frame.time, kind: "blanket", label: "相手のブランケットに入る" });
    }
    if (currentTarget === "opponent") {
      events.push({ time: frame.time, kind: "blanket", label: "相手をブランケットする" });
    }
    previousBlanketTarget = currentTarget;
  }
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
    userBlanketLoss: userBlanketLoss / BOAT_LENGTH_PX,
    opponentBlanketLoss: opponentBlanketLoss / BOAT_LENGTH_PX,
    userBlanketSeconds,
    opponentBlanketSeconds,
    finalRelativeGain,
    gainChange: finalRelativeGain - firstGain,
    maxRelativeGain: Math.max(...gains),
    minRelativeGain: Math.min(...gains),
    endTime: finalFrame.time,
    markResult,
    markDistance: getMarkDistance(finalFrame.user, config.leg) / BOAT_LENGTH_PX,
    opponentDecisions,
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

export function analyzeShiftTimingChoice(config: FreeScenarioConfig): ShiftTimingAnalysis {
  const timeline = getFreeWindTimeline(config);
  // At shiftStart the model is still on the mean wind direction. One second
  // later is the first visible change a sailor can actually react to.
  const onsetTime = Math.min(timeline.shiftStart + 1, timeline.peak);
  const onsetReplay = runFreeScenario(config, [onsetTime]);
  const peakReplay = runFreeScenario(config, [timeline.peak]);
  const comparisonTime = Math.min(
    timeline.returnStart,
    onsetReplay.endTime,
    peakReplay.endTime,
  );

  const toTrial = (
    choice: ShiftTimingChoice,
    maneuverTime: number,
    replay: FreeScenarioReplay,
  ): ShiftTimingTrial => ({
    choice,
    maneuverTime,
    windAngle: getFreeWindAngle(maneuverTime, config),
    relativeGain: replay.frames[comparisonTime].relativeGain / BOAT_LENGTH_PX,
    maneuverLoss: replay.userManeuverLoss,
    markResult: replay.markResult,
    endTime: replay.endTime,
    markDistance: replay.markDistance,
  });

  const onset = toTrial("onset", onsetTime, onsetReplay);
  const peak = toTrial("peak", timeline.peak, peakReplay);
  const gainDifference = onset.relativeGain - peak.relativeGain;
  const favoredTack = getFavoredTack(config.leg, onset.windAngle);
  const initialTack = getTack(0, []);
  const recommendation: ShiftTimingRecommendation = favoredTack === null || favoredTack === initialTack
    ? "hold"
    : Math.abs(gainDifference) < 0.3
      ? "close"
      : gainDifference > 0
        ? "onset"
        : "peak";

  return { onset, peak, comparisonTime, gainDifference, recommendation };
}

const getFavoredTack = (
  leg: CourseLeg,
  windAngle: number,
): Tack | null => {
  if (Math.abs(windAngle) < 1.5) return null;
  if (leg === "upwind") return windAngle > 0 ? "starboard" : "port";
  return windAngle > 0 ? "port" : "starboard";
};

const getSailingShiftState = (
  tack: Tack,
  leg: CourseLeg,
  windAngle: number,
): SailingShiftState => {
  const favoredTack = getFavoredTack(leg, windAngle);
  if (favoredTack === null) return "neutral";
  return tack === favoredTack ? "favored" : "unfavored";
};

export function getWindDecisionSnapshot(
  config: FreeScenarioConfig,
  time: number,
  tack: Tack,
): WindDecisionSnapshot {
  const windAngle = getFreeWindAngle(time, config);
  const earlierWindAngle = getFreeWindAngle(Math.max(0, time - 1), config);
  const change = windAngle - earlierWindAngle;
  const windTrend: WindTrend = change > 0.5 ? "right" : change < -0.5 ? "left" : "steady";
  return {
    windAngle,
    windTrend,
    tack,
    state: getSailingShiftState(tack, config.leg, windAngle),
  };
}

export function analyzeManeuverPoints(
  config: FreeScenarioConfig,
  userManeuverTimes: number[],
  reasonCalls: ManeuverReasonCall[] = [],
): ManeuverPointReview[] {
  const normalizedTimes = normalizeManeuverTimes(userManeuverTimes);
  const replay = runFreeScenario(config, normalizedTimes);
  return normalizedTimes.map((time, index) => {
    const tackBefore = getTack(time - 1, normalizedTimes);
    const tackAfter = getTack(time, normalizedTimes);
    const beforeSnapshot = getWindDecisionSnapshot(config, time, tackBefore);
    const afterSnapshot = getWindDecisionSnapshot(config, time, tackAfter);
    const frame = replay.frames[Math.min(time, replay.frames.length - 1)];
    const mark = config.leg === "upwind" ? UPWIND_MARK : DOWNWIND_MARK;
    const separationBoatLengths = Math.hypot(
      frame.user.x - frame.opponent.x,
      frame.user.y - frame.opponent.y,
    ) / BOAT_LENGTH_PX;
    const meetingDecision = replay.opponentDecisions.find((decision) =>
      Math.abs(decision.time - time) <= 2
    );
    const markSupported = hasReachedMarkLayline(
      frame.user,
      tackBefore,
      frame.windAngle,
      config.leg,
      mark,
    );
    const opponentSupported = Boolean(frame.blanket)
      || Boolean(meetingDecision)
      || separationBoatLengths <= 4;
    const windSupported = beforeSnapshot.state === "unfavored";
    const tacticalCues: Record<ManeuverReason, TacticalCueEvidence> = {
      wind: {
        supported: windSupported,
        observation: beforeSnapshot.state === "unfavored"
          ? `${config.leg === "upwind" ? "ヘダー側" : "風下へ向きにくい側"}から、返すと有利側へ移る`
          : beforeSnapshot.state === "favored"
            ? `${config.leg === "upwind" ? "リフト側" : "風下へ向ける側"}を走っていた`
            : "平均風向付近で、風だけでは返す根拠が弱い",
      },
      opponent: {
        supported: opponentSupported,
        observation: frame.blanket
          ? `${frame.blanket.affected === "user" ? "自艇" : "相手"}がブランケットの影にいる`
          : meetingDecision
            ? `約${meetingDecision.secondsToMeeting}秒先のミート判断がある`
            : `相手まで${separationBoatLengths.toFixed(1)}艇身${opponentSupported ? "で、位置関係を優先できる" : "。急いで返す材料は弱い"}`,
      },
      mark: {
        supported: markSupported,
        observation: markSupported
          ? "反対タックでマークを狙えるレイラインに来た"
          : "まだレイライン前で、マークだけを理由に返す段階ではない",
      },
    };
    // RYA's three-hats model asks sailors to identify which priority is driving
    // the decision. This trainer adapts it to wind, opponent and mark/layline.
    // Source: https://www.rya.org.uk/racing/tactics-for-winning-on-the-water/
    const strongestCue: ManeuverReason | null = markSupported
      ? "mark"
      : opponentSupported
        ? "opponent"
        : windSupported
          ? "wind"
          : null;
    const declaredReason = reasonCalls.find((call) => call.time === time)?.reason ?? null;
    const reasonVerdict: ManeuverReasonVerdict = declaredReason === null
      ? "unrecorded"
      : tacticalCues[declaredReason].supported
        ? "supported"
        : strongestCue
          ? "reconsider"
          : "unclear";
    const trials = ([-4, 0, 4] as TimingOffset[]).map((offset): TimingTrial => {
      const previousTime = normalizedTimes[index - 1];
      const nextTime = normalizedTimes[index + 1];
      const earliestTime = previousTime === undefined ? 1 : previousTime + 1;
      const latestTime = nextTime === undefined ? FREE_SCENARIO_MAX_DURATION : nextTime - 1;
      const maneuverTime = clamp(time + offset, earliestTime, latestTime);
      const maneuverTimes = normalizeManeuverTimes(
        normalizedTimes.map((item, itemIndex) => itemIndex === index ? maneuverTime : item),
      );
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

    return {
      maneuverNumber: index + 1,
      time,
      windAngle: beforeSnapshot.windAngle,
      windTrend: beforeSnapshot.windTrend,
      tackBefore,
      tackAfter,
      stateBefore: beforeSnapshot.state,
      stateAfter: afterSnapshot.state,
      secondsSincePrevious: index === 0 ? null : time - normalizedTimes[index - 1],
      declaredReason,
      strongestCue,
      reasonVerdict,
      tacticalCues,
      bestOffset: bestTrial.offset,
      trials,
    };
  });
}

const WINNING_MARGIN_BOAT_LENGTHS = 0.1;
const WINNING_ROUTE_BEAM_WIDTH = 8;
const WINNING_ROUTE_SEARCH_ROUNDS = 3;
const WINNING_ROUTE_MAX_MANEUVERS = 7;
const WINNING_ROUTE_MIN_SPACING_SECONDS = 4;

interface WinningRouteCandidate {
  result: WinningRouteResult;
  replay: FreeScenarioReplay;
}

const toWinningRouteResult = (replay: FreeScenarioReplay): WinningRouteResult => ({
  maneuverTimes: replay.userManeuverTimes,
  markResult: replay.markResult,
  endTime: replay.endTime,
  markDistance: replay.markDistance,
  relativeGain: replay.finalRelativeGain,
});

const isWinningRoute = (result: WinningRouteResult) =>
  result.markResult === "reached" && result.relativeGain > WINNING_MARGIN_BOAT_LENGTHS;

const compareWinningRouteCandidates = (
  left: WinningRouteCandidate,
  right: WinningRouteCandidate,
) => {
  const winningDifference = Number(isWinningRoute(right.result)) - Number(isWinningRoute(left.result));
  if (winningDifference !== 0) return winningDifference;

  const markDifference = MARK_RESULT_PRIORITY[right.result.markResult]
    - MARK_RESULT_PRIORITY[left.result.markResult];
  if (markDifference !== 0) return markDifference;

  if (left.result.markResult === "reached" && left.result.endTime !== right.result.endTime) {
    if (Math.abs(left.result.relativeGain - right.result.relativeGain) >= 0.05) {
      return right.result.relativeGain - left.result.relativeGain;
    }
    return left.result.endTime - right.result.endTime;
  }
  if (left.result.markResult !== "reached"
    && Math.abs(left.result.markDistance - right.result.markDistance) >= 0.05) {
    return left.result.markDistance - right.result.markDistance;
  }
  if (Math.abs(left.result.relativeGain - right.result.relativeGain) >= 0.05) {
    return right.result.relativeGain - left.result.relativeGain;
  }
  if (left.result.maneuverTimes.length !== right.result.maneuverTimes.length) {
    return left.result.maneuverTimes.length - right.result.maneuverTimes.length;
  }
  return left.result.maneuverTimes.join(",").localeCompare(right.result.maneuverTimes.join(","));
};

const hasSafeManeuverSpacing = (times: number[]) =>
  times.every((time, index) => index === 0
    || time - times[index - 1] >= WINNING_ROUTE_MIN_SPACING_SECONDS);

const getWinningRouteDecisionTimes = (
  config: FreeScenarioConfig,
  replay: FreeScenarioReplay,
) => {
  const timeline = getFreeWindTimeline(config);
  const horizon = Math.min(
    84,
    Math.max(replay.endTime + 12, timeline.returnEnd + 12),
  );
  const times = Array.from(
    { length: Math.floor(horizon / 2) },
    (_, index) => (index + 1) * 2,
  );
  if (config.windPattern === "oscillating") {
    const quarterCycle = timeline.peak - timeline.shiftStart;
    for (let time = timeline.shiftStart; time <= horizon; time += quarterCycle) {
      times.push(time);
    }
  } else {
    times.push(timeline.shiftStart, timeline.peak, timeline.returnStart, timeline.returnEnd);
  }
  return normalizeManeuverTimes(times).filter((time) => time >= 1 && time <= horizon);
};

const getWinningRouteMutations = (
  schedule: number[],
  decisionTimes: number[],
) => {
  const mutations: number[][] = [];
  if (schedule.length < WINNING_ROUTE_MAX_MANEUVERS) {
    for (const time of decisionTimes) {
      mutations.push([...schedule, time]);
    }
  }
  for (let index = 0; index < schedule.length; index += 1) {
    mutations.push(schedule.filter((_, itemIndex) => itemIndex !== index));
    for (const offset of [-8, -4, -2, 2, 4, 8]) {
      mutations.push(schedule.map((time, itemIndex) => itemIndex === index ? time + offset : time));
    }
  }
  return mutations
    .map(normalizeManeuverTimes)
    .filter((times) => times.length <= WINNING_ROUTE_MAX_MANEUVERS)
    .filter(hasSafeManeuverSpacing);
};

/**
 * Re-runs the same wind and opponent configuration with nearby maneuver plans.
 * A model win means reaching the mark while finishing at least 0.1 boat lengths ahead.
 */
export function analyzeWinningRoute(
  config: FreeScenarioConfig,
  userManeuverTimes: number[],
): WinningRouteAnalysis {
  const currentReplay = runFreeScenario(config, userManeuverTimes);
  const currentCandidate: WinningRouteCandidate = {
    result: toWinningRouteResult(currentReplay),
    replay: currentReplay,
  };
  if (isWinningRoute(currentCandidate.result)) {
    return {
      status: "already-winning",
      current: currentCandidate.result,
      recommended: currentCandidate.result,
      exploredRoutes: 1,
    };
  }

  const seen = new Set([currentCandidate.result.maneuverTimes.join(",")]);
  let exploredRoutes = 1;
  let bestCandidate = currentCandidate;
  let beam = [currentCandidate];

  const emptyKey = "";
  if (!seen.has(emptyKey)) {
    const replay = runFreeScenario(config, []);
    const candidate = { result: toWinningRouteResult(replay), replay };
    seen.add(emptyKey);
    exploredRoutes += 1;
    beam.push(candidate);
    if (compareWinningRouteCandidates(candidate, bestCandidate) < 0) bestCandidate = candidate;
  }

  for (let round = 0; round < WINNING_ROUTE_SEARCH_ROUNDS; round += 1) {
    const roundCandidates: WinningRouteCandidate[] = [];
    for (const candidate of beam) {
      const decisionTimes = getWinningRouteDecisionTimes(config, candidate.replay);
      for (const maneuverTimes of getWinningRouteMutations(
        candidate.result.maneuverTimes,
        decisionTimes,
      )) {
        const key = maneuverTimes.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const replay = runFreeScenario(config, maneuverTimes);
        roundCandidates.push({ result: toWinningRouteResult(replay), replay });
        exploredRoutes += 1;
      }
    }
    if (roundCandidates.length === 0) break;
    roundCandidates.sort(compareWinningRouteCandidates);
    if (compareWinningRouteCandidates(roundCandidates[0], bestCandidate) < 0) {
      bestCandidate = roundCandidates[0];
    }
    beam = roundCandidates.slice(0, WINNING_ROUTE_BEAM_WIDTH);
    if (isWinningRoute(bestCandidate.result)) break;
  }

  return {
    status: isWinningRoute(bestCandidate.result) ? "win-found" : "best-improvement",
    current: currentCandidate.result,
    recommended: bestCandidate.result,
    exploredRoutes,
  };
}
