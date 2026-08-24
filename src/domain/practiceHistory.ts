import type {
  FreeScenarioConfig,
  FreeScenarioReplay,
  ManeuverPointReview,
  ManeuverReason,
  WindPattern,
} from "./freeSimulation";
import type { MarkResult } from "./simulation";

export const PRACTICE_HISTORY_STORAGE_KEY = "shift-420-practice-history-v1";
export const PRACTICE_HISTORY_LIMIT = 8;

export interface PracticeAttempt {
  completedAt: string;
  config: FreeScenarioConfig;
  maneuverCount: number;
  recordedCallCount: number;
  supportedCallCount: number;
  focusReason: ManeuverReason | null;
  markResult: MarkResult;
  relativeGain: number;
}

export interface PracticeHistory {
  version: 1;
  attempts: PracticeAttempt[];
}

export interface PracticeRecommendation {
  mode: "repeat" | "transfer";
  heading: string;
  detail: string;
  buttonLabel: string;
  config: FreeScenarioConfig;
}

export const EMPTY_PRACTICE_HISTORY: PracticeHistory = { version: 1, attempts: [] };

const WIND_PATTERNS: WindPattern[] = ["oscillating", "hold", "return", "return-past"];
const WIND_PATTERN_LABELS: Record<WindPattern, string> = {
  oscillating: "何度も振れる",
  hold: "振れたまま",
  return: "平均へ戻る",
  "return-past": "反対まで戻る",
};
const NEXT_WIND_PATTERN: Record<WindPattern, WindPattern> = {
  oscillating: "return-past",
  "return-past": "return",
  return: "hold",
  hold: "oscillating",
};
const REASON_LABELS: Record<ManeuverReason, string> = {
  wind: "風の振れ",
  opponent: "相手",
  mark: "マーク",
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isFreeScenarioConfig = (value: unknown): value is FreeScenarioConfig => {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Partial<FreeScenarioConfig>;
  return (config.leg === "upwind" || config.leg === "downwind")
    && isFiniteNumber(config.shiftAngle)
    && WIND_PATTERNS.includes(config.windPattern as WindPattern)
    && ["quick", "standard", "slow"].includes(config.windTempo ?? "")
    && isFiniteNumber(config.leverageBoatLengths)
    && ["hold", "optimize", "fixed", "cover"].includes(config.opponentMode ?? "");
};

const isPracticeAttempt = (value: unknown): value is PracticeAttempt => {
  if (typeof value !== "object" || value === null) return false;
  const attempt = value as Partial<PracticeAttempt>;
  return typeof attempt.completedAt === "string"
    && isFreeScenarioConfig(attempt.config)
    && Number.isInteger(attempt.maneuverCount)
    && (attempt.maneuverCount ?? -1) >= 0
    && Number.isInteger(attempt.recordedCallCount)
    && (attempt.recordedCallCount ?? -1) >= 0
    && (attempt.recordedCallCount ?? 1) <= (attempt.maneuverCount ?? 0)
    && Number.isInteger(attempt.supportedCallCount)
    && (attempt.supportedCallCount ?? -1) >= 0
    && (attempt.supportedCallCount ?? 1) <= (attempt.recordedCallCount ?? 0)
    && (attempt.focusReason === null || ["wind", "opponent", "mark"].includes(attempt.focusReason ?? ""))
    && ["reached", "missed", "timeout"].includes(attempt.markResult ?? "")
    && isFiniteNumber(attempt.relativeGain);
};

export function parsePracticeHistory(raw: string | null): PracticeHistory {
  if (!raw) return EMPTY_PRACTICE_HISTORY;

  try {
    const parsed = JSON.parse(raw) as Partial<PracticeHistory>;
    if (parsed.version !== 1 || !Array.isArray(parsed.attempts)) {
      return EMPTY_PRACTICE_HISTORY;
    }
    return {
      version: 1,
      attempts: parsed.attempts
        .filter(isPracticeAttempt)
        .slice(-PRACTICE_HISTORY_LIMIT),
    };
  } catch {
    return EMPTY_PRACTICE_HISTORY;
  }
}

export function createPracticeAttempt(
  config: FreeScenarioConfig,
  reviews: ManeuverPointReview[],
  replay: FreeScenarioReplay,
  completedAt = new Date().toISOString(),
): PracticeAttempt {
  const reviewToReconsider = reviews.find((review) =>
    review.reasonVerdict === "reconsider" && review.strongestCue !== null
  );
  return {
    completedAt,
    config: { ...config },
    maneuverCount: reviews.length,
    recordedCallCount: reviews.filter((review) => review.declaredReason !== null).length,
    supportedCallCount: reviews.filter((review) => review.reasonVerdict === "supported").length,
    focusReason: reviewToReconsider?.strongestCue ?? null,
    markResult: replay.markResult,
    relativeGain: replay.finalRelativeGain,
  };
}

export function recordPracticeAttempt(
  history: PracticeHistory,
  attempt: PracticeAttempt,
): PracticeHistory {
  return {
    version: 1,
    attempts: [...history.attempts, attempt].slice(-PRACTICE_HISTORY_LIMIT),
  };
}

export function isSamePracticeConfig(
  left: FreeScenarioConfig,
  right: FreeScenarioConfig,
): boolean {
  return left.leg === right.leg
    && left.shiftAngle === right.shiftAngle
    && left.windPattern === right.windPattern
    && left.windTempo === right.windTempo
    && left.leverageBoatLengths === right.leverageBoatLengths
    && left.opponentMode === right.opponentMode;
}

const isConfirmedAttempt = (attempt: PracticeAttempt) =>
  attempt.maneuverCount > 0
  && attempt.markResult === "reached"
  && attempt.recordedCallCount === attempt.maneuverCount
  && attempt.supportedCallCount === attempt.maneuverCount;

export function getPracticeRecommendation(
  history: PracticeHistory,
): PracticeRecommendation | null {
  const current = history.attempts.at(-1);
  if (!current) return null;

  const repeat = (heading: string, detail: string, buttonLabel: string): PracticeRecommendation => ({
    mode: "repeat",
    heading,
    detail,
    buttonLabel,
    config: { ...current.config },
  });

  if (current.maneuverCount === 0) {
    return repeat(
      "操作を1回入れて比べる",
      "次は、風の振れ・相手・マークのどれを優先するか決めてから操作します。",
      "同じ条件で操作する",
    );
  }
  if (current.recordedCallCount < current.maneuverCount) {
    return repeat(
      "操作前のコールをそろえる",
      "すべての操作で根拠を選ぶと、判断と海面の記録を照合できます。",
      "同じ条件でコールする",
    );
  }
  if (current.supportedCallCount < current.recordedCallCount) {
    const focus = current.focusReason ? `「${REASON_LABELS[current.focusReason]}」` : "風・相手・マーク";
    return repeat(
      "根拠を見直してもう一度",
      `次は${focus}を先に確認し、同じ条件でタイミングを選び直します。`,
      "同じ条件で確かめる",
    );
  }
  if (current.markResult !== "reached") {
    return repeat(
      "マーク到達までの操作を組み直す",
      "改善案の仮想航跡を見てから、同じ条件でマークまで走ります。",
      "同じ条件で走り直す",
    );
  }

  const previous = history.attempts.at(-2);
  if (previous && isSamePracticeConfig(previous.config, current.config) && isConfirmedAttempt(previous)) {
    const windPattern = NEXT_WIND_PATTERN[current.config.windPattern];
    return {
      mode: "transfer",
      heading: "風の変化を変えて試す",
      detail: `次は「${WIND_PATTERN_LABELS[windPattern]}」。同じ判断基準が別の海面でも使えるか確認します。`,
      buttonLabel: "次の条件で走る",
      config: { ...current.config, windPattern },
    };
  }

  return repeat(
    "同じ条件でもう一度確認する",
    "同じ見方で、もう一度マークへ到達できるか確認します。2回続けてできたら風の変化を変えます。",
    "同じ条件でもう一度",
  );
}
