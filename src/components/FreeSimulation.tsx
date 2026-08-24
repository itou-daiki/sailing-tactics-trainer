import { useEffect, useMemo, useRef, useState } from "react";
import { CourseBoard, type CourseComparison } from "./CourseBoard";
import { BOAT_LENGTH_PX, type BlanketState } from "../domain/simulation";
import {
  DEFAULT_FREE_CONFIG,
  analyzeManeuverPoints,
  analyzeShiftTimingChoice,
  analyzeWinningRoute,
  evaluateManeuverPlan,
  getFreeWindAngle,
  getFreeWindTimeline,
  getRelativeGainDifferenceAtCommonTime,
  getWindDecisionSnapshot,
  parseFreeScenarioConfig,
  runFreeScenario,
  serializeFreeScenarioConfig,
  type CourseLeg,
  type FreeScenarioConfig,
  type FreeScenarioReplay,
  type ManeuverPointReview,
  type ManeuverReason,
  type ManeuverReasonCall,
  type OpponentDecision,
  type OpponentMode,
  type ShiftTimingAnalysis,
  type WinningRouteAnalysis,
  type WindPattern,
  type WindTempo,
} from "../domain/freeSimulation";
import {
  EMPTY_PRACTICE_HISTORY,
  PRACTICE_HISTORY_STORAGE_KEY,
  createPracticeAttempt,
  getPracticeRecommendation,
  parsePracticeHistory,
  recordPracticeAttempt,
  type PracticeHistory,
  type PracticeRecommendation,
} from "../domain/practiceHistory";

type FreePhase = "setup" | "playing" | "replay";

type PlanCue = "shiftObserved" | "peak" | "returnStart";

interface FreeDrillPreset {
  id: string;
  label: string;
  focus: string;
  tag: string;
  config: FreeScenarioConfig;
  planCue: PlanCue;
}

interface InitialFreeSetup {
  config: FreeScenarioConfig;
  loadedFromSharedLink: boolean;
}

const WIND_PATTERNS: Array<{ value: WindPattern; label: string; note: string }> = [
  { value: "oscillating", label: "何度も振れる", note: "右→左→右の判断を繰り返す" },
  { value: "return", label: "平均へ戻る", note: "暫定ゲインの変化を確認する" },
  { value: "hold", label: "振れたまま", note: "パーシステントシフトを試す" },
  { value: "return-past", label: "反対まで戻る", note: "有利側が逆転する場面を見る" },
];

const WIND_TEMPOS: Array<{ value: WindTempo; label: string; note: string }> = [
  { value: "quick", label: "すばやい", note: "7秒で最大振れ" },
  { value: "standard", label: "標準", note: "10秒で最大振れ" },
  { value: "slow", label: "ゆっくり", note: "14秒で最大振れ" },
];

const OPPONENT_MODES: Array<{ value: OpponentMode; label: string; note: string }> = [
  { value: "hold", label: "ミート先読み", note: "余裕があれば先にタック" },
  { value: "optimize", label: "最適化", note: "振れ・レイライン・ミートを毎秒判断" },
  { value: "fixed", label: "18秒で先に操作", note: "その後もレイラインを守る" },
  { value: "cover", label: "2秒後にカバー", note: "追従後もレイラインを守る" },
];

const LEG_OPTIONS: Array<{ value: CourseLeg; label: string; action: string }> = [
  { value: "upwind", label: "上り", action: "タック" },
  { value: "downwind", label: "下り", action: "ジャイブ" },
];

const MANEUVER_REASON_OPTIONS: Array<{
  value: ManeuverReason;
  label: string;
  note: string;
}> = [
  { value: "wind", label: "風の振れ", note: "ヘダー／振れ戻り" },
  { value: "opponent", label: "相手", note: "ミート／カバー／風の影" },
  { value: "mark", label: "マーク", note: "レイライン／進入角" },
];

const getReasonLabel = (reason: ManeuverReason | null) =>
  MANEUVER_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "記録なし";

const readPracticeHistory = (): PracticeHistory => {
  try {
    return parsePracticeHistory(window.localStorage.getItem(PRACTICE_HISTORY_STORAGE_KEY));
  } catch {
    return EMPTY_PRACTICE_HISTORY;
  }
};

const FREE_DRILL_PRESETS: FreeDrillPreset[] = [
  {
    id: "shift-onset-or-peak",
    label: "振れ始めと最大振れを比べる",
    focus: "早く返す利益と、待つ間のヘダー／操作ロスを同じ海面で比べる",
    tag: "上り・タイミング比較",
    config: {
      leg: "upwind",
      shiftAngle: 12,
      windPattern: "return",
      windTempo: "slow",
      leverageBoatLengths: 12,
      opponentMode: "fixed",
    },
    planCue: "shiftObserved",
  },
  {
    id: "oscillating-upwind",
    label: "連続するヘダーでタックする",
    focus: "右→左→右と振れる中で、タックするタイミングを判断する",
    tag: "上り・連続タック",
    config: {
      leg: "upwind",
      shiftAngle: 12,
      windPattern: "oscillating",
      windTempo: "standard",
      leverageBoatLengths: 14,
      opponentMode: "hold",
    },
    planCue: "shiftObserved",
  },
  {
    id: "oscillating-downwind",
    label: "下りのジャイブタイミング",
    focus: "上りと有利側が逆になる連続振れを読む",
    tag: "下り・連続ジャイブ",
    config: {
      leg: "downwind",
      shiftAngle: -12,
      windPattern: "oscillating",
      windTempo: "standard",
      leverageBoatLengths: 16,
      opponentMode: "hold",
    },
    planCue: "shiftObserved",
  },
  {
    id: "single-return",
    label: "1回の振れ戻りを確認する",
    focus: "振れ始め・最大・戻り始めの操作結果を比べる",
    tag: "上り・基本",
    config: {
      leg: "upwind",
      shiftAngle: 12,
      windPattern: "return",
      windTempo: "standard",
      leverageBoatLengths: 14,
      opponentMode: "hold",
    },
    planCue: "peak",
  },
  {
    id: "persistent-shift",
    label: "戻らない振れを判断する",
    focus: "振れを追い続けず、長いタックを選ぶ",
    tag: "上り・パーシステント",
    config: {
      leg: "upwind",
      shiftAngle: -14,
      windPattern: "hold",
      windTempo: "quick",
      leverageBoatLengths: 12,
      opponentMode: "hold",
    },
    planCue: "peak",
  },
];

const readInitialFreeSetup = (): InitialFreeSetup => {
  if (typeof window === "undefined") {
    return { config: DEFAULT_FREE_CONFIG, loadedFromSharedLink: false };
  }
  const sharedConfig = parseFreeScenarioConfig(window.location.search);
  return {
    config: sharedConfig ?? DEFAULT_FREE_CONFIG,
    loadedFromSharedLink: sharedConfig !== null,
  };
};

const getPresetPlanTime = (preset: FreeDrillPreset) => {
  const timeline = getFreeWindTimeline(preset.config);
  return preset.planCue === "shiftObserved"
    ? Math.min(timeline.shiftStart + 1, timeline.peak)
    : timeline[preset.planCue];
};

const isSameConfig = (left: FreeScenarioConfig, right: FreeScenarioConfig) =>
  serializeFreeScenarioConfig(left) === serializeFreeScenarioConfig(right);

const buildScenarioShareUrl = (config: FreeScenarioConfig) => {
  const currentUrl = new URL(window.location.href);
  const url = currentUrl.protocol === "file:"
    ? new URL("https://itou-daiki.github.io/sailing-tactics-trainer/")
    : currentUrl;
  url.search = serializeFreeScenarioConfig(config);
  url.hash = "free-sail";
  return url.toString();
};

const getShiftLabel = (angle: number) => {
  if (angle === 0) return "振れなし 0°";
  const absoluteAngle = Math.abs(angle);
  const displayAngle = Number.isInteger(absoluteAngle)
    ? absoluteAngle.toFixed(0)
    : absoluteAngle.toFixed(1);
  return `${angle > 0 ? "右" : "左"}${displayAngle}°`;
};

const getPatternLabel = (pattern: WindPattern) =>
  WIND_PATTERNS.find((option) => option.value === pattern)?.label ?? "何度も振れる";

const getOpponentLabel = (mode: OpponentMode) =>
  OPPONENT_MODES.find((option) => option.value === mode)?.label ?? "ミート先読み";

const getTempoLabel = (tempo: WindTempo) =>
  WIND_TEMPOS.find((option) => option.value === tempo)?.label ?? "標準";

const normalizeDisplayNumber = (value: number) => Math.abs(value) < 0.05 ? 0 : value;

const formatBoatDifference = (value: number) => {
  const normalized = normalizeDisplayNumber(value);
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)}艇身`;
};

const formatManeuverLoss = (value: number) => {
  const normalized = normalizeDisplayNumber(value);
  return `${normalized > 0 ? "−" : ""}${normalized.toFixed(1)}艇身`;
};

const getExplanation = (
  time: number,
  config: FreeScenarioConfig,
  relativeGain: number,
  maneuverCount: number,
  opponentIsAvoiding = false,
  opponentTackedAtMeeting = false,
  opponentDecision?: OpponentDecision,
  blanket?: BlanketState,
) => {
  const side = config.shiftAngle < 0 ? "左" : config.shiftAngle > 0 ? "右" : "左右どちらにも";
  const action = config.leg === "upwind" ? "タック" : "ジャイブ";
  const timeline = getFreeWindTimeline(config);
  if (blanket) {
    const speedLoss = Math.round((1 - blanket.speedMultiplier) * 100);
    return blanket.affected === "user"
      ? `相手の見かけの風の後ろに入り、艇速がクリーンエア比で${speedLoss}%低下。左右へ外れて、きれいな風を取り戻します。`
      : `相手を見かけの風の後ろに置き、相手艇速を${speedLoss}%落としています。カバーだけに集中せず、マークへの角度も確認します。`;
  }
  if (opponentTackedAtMeeting) {
    return `まだレイライン前です。相手はミートを約${opponentDecision?.secondsToMeeting ?? "数"}秒前に予測し、安全に完了できるうちにタックします。`;
  }
  if (opponentIsAvoiding) {
    return `ミートまで約${opponentDecision?.secondsToMeeting ?? "数"}秒。相手は今からタックすると安全余地がないため、${config.leg === "upwind" ? "ベアして" : "さらに下って"}自艇の後ろを通ります。`;
  }
  if (config.windPattern === "oscillating") {
    const angle = getFreeWindAngle(time, config);
    const earlierAngle = getFreeWindAngle(Math.max(0, time - 3), config);
    const trend = angle - earlierAngle > 0.5
      ? "右へ動いています"
      : angle - earlierAngle < -0.5
        ? "左へ動いています"
        : "折り返し付近です";
    if (Math.abs(angle) < 1.5) {
      return `風は平均を通過中。${trend}。1回前の振れではなく、次にどちらへ動くかを見ます。`;
    }
    return `風は${angle > 0 ? "右" : "左"}${Math.abs(angle).toFixed(0)}°、${trend}。今のタック／ジャイブが有利側かを確認します。`;
  }
  if (time <= timeline.shiftStart) {
    return `まず${config.leverageBoatLengths}艇身の横の距離を確認。風が振れる前は、2艇の前後差はほぼありません。`;
  }
  if (time < timeline.peak) {
    if (config.shiftAngle === 0) {
      return "風向は平均のままです。風の助けがないとき、操作による艇速ロスが差へどう表れるかを見ます。";
    }
    return `${side}へ風が振れています。相手との差が${relativeGain >= 0 ? "プラス" : "マイナス"}へ動く速さを見ます。`;
  }
  if (time <= timeline.returnStart) {
    return `振れは最大付近です。${action}するなら、艇速ロスと相手とのクロスを同時に見ます。`;
  }
  if (config.windPattern === "hold") {
    return `風は振れた位置に留まっています。${maneuverCount > 0 ? "操作後の位置関係" : "横の距離による差"}が残るか確認します。`;
  }
  if (time < timeline.returnEnd) {
    return "風が戻っています。横に離れたことで得た暫定ゲインが、残るか消えるかを追います。";
  }
  if (config.windPattern === "return-past") {
    return "風は平均を越えて反対側へ戻りました。先ほど有利だった側が不利へ変わる可能性があります。";
  }
  return "風は平均へ戻りました。いま残っている差は、操作のタイミングと艇速ロスで生まれた差です。";
};

function ChoiceButtons<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Array<{ value: T; label: string; note?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="free-choice-grid">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "free-choice free-choice--selected" : "free-choice"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          {option.note ? <small>{option.note}</small> : null}
          <span className="visually-hidden">：{name}</span>
        </button>
      ))}
    </div>
  );
}

function DrillIndex({
  config,
  onSelect,
}: {
  config: FreeScenarioConfig;
  onSelect: (preset: FreeDrillPreset) => void;
}) {
  return (
    <section className="free-drills" aria-labelledby="free-drills-heading">
      <div className="free-drills__heading">
        <div>
          <div className="section-kicker">COACH DRILLS / すぐ試す海面</div>
          <h3 id="free-drills-heading">練習したい場面を選ぶ</h3>
        </div>
        <span>4 DRILLS</span>
      </div>
      <ol className="free-drill-index">
        {FREE_DRILL_PRESETS.map((preset, index) => {
          const selected = isSameConfig(config, preset.config);
          return (
            <li key={preset.id}>
              <button
                type="button"
                className={selected ? "free-drill is-selected" : "free-drill"}
                aria-pressed={selected}
                onClick={() => onSelect(preset)}
              >
                <span className="free-drill__number">{String(index + 1).padStart(2, "0")}</span>
                <span className="free-drill__copy">
                  <strong>{preset.label}</strong>
                  <small>{preset.focus}</small>
                </span>
                <span className="free-drill__tag">{preset.tag}</span>
                <span className="free-drill__arrow" aria-hidden="true">→</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ManeuverPlan({
  config,
  plannedTime,
  onChange,
}: {
  config: FreeScenarioConfig;
  plannedTime: number;
  onChange: (time: number) => void;
}) {
  const timeline = getFreeWindTimeline(config);
  const maneuverLabel = config.leg === "upwind" ? "タック" : "ジャイブ";
  const quarterCycle = timeline.peak - timeline.shiftStart;
  const shiftObserved = Math.min(timeline.shiftStart + 1, timeline.peak);
  const cues = config.windPattern === "oscillating"
    ? [
        { label: "最初の振れを確認", time: shiftObserved },
        { label: "最初の最大振れ", time: timeline.peak },
        { label: "平均を反対へ通過", time: timeline.shiftStart + quarterCycle * 2 },
      ]
    : [
        { label: "振れ始めを確認", time: shiftObserved },
        { label: "最大振れ", time: timeline.peak },
        ...(config.windPattern === "hold"
          ? []
          : [{ label: "戻り始め", time: timeline.returnStart }]),
      ];

  return (
    <fieldset className="free-plan">
      <legend>7　走る前のプラン</legend>
      <div className="free-plan__tape" aria-hidden="true">PLAN → DO → REVIEW</div>
      <h3>最初の{maneuverLabel}予定を選ぶ</h3>
      <p>最初の予定は仮説です。走り始めた後は、何度も来る振れを見て、待つ／返すを判断します。</p>
      <div className="free-plan__cues" aria-label={`${maneuverLabel}予定の合図`}>
        {cues.map((cue) => (
          <button
            key={cue.label}
            type="button"
            className={plannedTime === cue.time ? "is-selected" : ""}
            aria-pressed={plannedTime === cue.time}
            onClick={() => onChange(cue.time)}
          >
            <span>{cue.label}</span>
            <strong>{cue.time}秒</strong>
          </button>
        ))}
      </div>
      <p className="free-plan__timing-note">
        振れ始めで返すとヘダーを走る時間は短くなります。ただし、振れが小さいうちに{maneuverLabel}の艇速ロスを払います。最大まで待つと振れを確認できますが、待つ間はヘダーを走ります。
      </p>
      <div className="free-plan__range">
        <label htmlFor="free-plan-time">自分で時刻を調整</label>
        <output htmlFor="free-plan-time">{plannedTime}秒</output>
        <input
          id="free-plan-time"
          type="range"
          min="1"
          max="40"
          step="1"
          value={plannedTime}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </fieldset>
  );
}

type ShareFeedback = { url: string; status: "shared" | "copied" | "manual" } | null;

function ShareScenario({
  config,
  loadedFromSharedLink,
}: {
  config: FreeScenarioConfig;
  loadedFromSharedLink: boolean;
}) {
  const [feedback, setFeedback] = useState<ShareFeedback>(null);
  const currentUrl = typeof window === "undefined" ? "" : buildScenarioShareUrl(config);
  const currentFeedback = feedback?.url === currentUrl ? feedback.status : null;

  const share = async () => {
    const shareData = {
      title: "SHIFT｜420 TACTICS 練習海面",
      text: "同じ条件で走って、最初のタック／ジャイブを比べよう。",
      url: currentUrl,
    };

    // Web Share must run directly from a user action; clipboard is the fallback.
    // Sources: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
    // https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setFeedback({ url: currentUrl, status: "shared" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(currentUrl);
      setFeedback({ url: currentUrl, status: "copied" });
    } catch {
      setFeedback({ url: currentUrl, status: "manual" });
    }
  };

  return (
    <section className="free-share" aria-labelledby="free-share-heading">
      <div>
        <span className="free-share__label">TEAM LINK / 同じ海面を配る</span>
        <h3 id="free-share-heading">この設定を共有する</h3>
        <p>{loadedFromSharedLink ? "この画面は共有URLの海面から始まっています。" : "登録なしで、今の風・距離・相手設定をそのまま送れます。"}</p>
      </div>
      <button type="button" onClick={share}>海面URLを共有</button>
      <p className="free-share__status" aria-live="polite">
        {currentFeedback === "shared" ? "共有メニューへ送りました。" : null}
        {currentFeedback === "copied" ? "URLをコピーしました。" : null}
        {currentFeedback === "manual" ? "下のURLを長押ししてコピーしてください。" : null}
      </p>
      {currentFeedback === "manual" ? (
        <input
          className="free-share__url"
          aria-label="共有する海面URL"
          readOnly
          value={currentUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
    </section>
  );
}

function ShiftTimingComparison({
  analysis,
  maneuverLabel,
  actualTime,
  onPractice,
}: {
  analysis: ShiftTimingAnalysis;
  maneuverLabel: string;
  actualTime: number | undefined;
  onPractice: (plannedTime: number) => void;
}) {
  const onsetAdvantage = analysis.gainDifference;
  const lead = Math.abs(onsetAdvantage);
  const leadLabel = lead < 0.05 ? "ほぼ0艇身" : `${lead.toFixed(1)}艇身`;
  const recommendation = analysis.recommendation === "hold"
    ? "この振れは今の走りをリフトしています。早い／遅いを比べる前に、今のタックを続けます。"
    : analysis.recommendation === "close"
      ? `差は${leadLabel}です。この海面ではほぼ互角です。風圧、波、相手、マーク位置を次の判断材料にします。`
      : analysis.recommendation === "onset"
        ? `振れを確認してすぐ返す方が、${analysis.comparisonTime}秒時点で${leadLabel}前です。ヘダーを長く走らない利益が残りました。`
        : `最大振れまで待つ方が、${analysis.comparisonTime}秒時点で${leadLabel}前です。今回は小さい振れで払う${maneuverLabel}ロスを、待つことで避けられました。`;
  const actualChoice = actualTime === undefined
    ? null
    : Math.abs(actualTime - analysis.onset.maneuverTime)
        <= Math.abs(actualTime - analysis.peak.maneuverTime)
      ? "onset"
      : "peak";

  return (
    <section className="free-shift-timing" aria-labelledby="free-shift-timing-heading">
      <div className="section-kicker">EARLY OR PEAK / いつ返す？</div>
      <div className="free-shift-timing__heading">
        <h3 id="free-shift-timing-heading">振れ始めと最大振れを直接比べる</h3>
        <span>{analysis.comparisonTime}秒で比較</span>
      </div>
      <p className="free-shift-timing__method">
        同じ風、同じ相手、同じ艇間距離で、最初の{maneuverLabel}時刻だけを変えた仮想試走です。
      </p>
      <div className="free-shift-timing__trials">
        {[analysis.onset, analysis.peak].map((trial) => {
          const isRecommended = analysis.recommendation === trial.choice;
          const isActual = actualChoice === trial.choice;
          const label = trial.choice === "onset" ? "振れ始めを確認" : "最大振れまで待つ";
          return (
            <article
              key={trial.choice}
              className={isRecommended ? "is-recommended" : ""}
              aria-label={`${label}場合の結果`}
            >
              <header>
                <span>{label}</span>
                <strong>{trial.maneuverTime}秒</strong>
              </header>
              <dl>
                <div><dt>その時の風</dt><dd>{getShiftLabel(trial.windAngle)}</dd></div>
                <div><dt>相手との差</dt><dd>{formatBoatDifference(trial.relativeGain)}</dd></div>
                <div><dt>{maneuverLabel}ロス</dt><dd>{formatManeuverLoss(trial.maneuverLoss)}</dd></div>
              </dl>
              <div className="free-shift-timing__flags">
                {isRecommended ? <span>この条件の候補</span> : null}
                {isActual ? <span>今回に近い</span> : null}
              </div>
              <button type="button" onClick={() => onPractice(trial.maneuverTime)}>
                {label}予定で再走する
              </button>
            </article>
          );
        })}
      </div>
      <div className={`free-shift-timing__call free-shift-timing__call--${analysis.recommendation}`}>
        <strong>{analysis.recommendation === "hold" ? "まず、リフトかヘダーかを確認" : "この条件の比較結果"}</strong>
        <p>{recommendation}</p>
      </div>
      <ol className="free-shift-timing__checklist">
        <li><span>1</span>今のタックはヘダーか</li>
        <li><span>2</span>振れ幅で操作ロスを回収できるか</li>
        <li><span>3</span>相手・マーク・風圧で優先が変わるか</li>
      </ol>
      <small className="free-shift-timing__model-note">
        420の教育用モデル内の比較です。実艇では波、クルーワーク、タック後の加速によって差が変わります。
      </small>
    </section>
  );
}

function PlanReview({
  plannedTime,
  maneuverTimes,
  maneuverLabel,
}: {
  plannedTime: number;
  maneuverTimes: number[];
  maneuverLabel: string;
}) {
  const review = evaluateManeuverPlan(plannedTime, maneuverTimes);
  const differenceLabel = review.delta === null
    ? "予定を変更"
    : review.rating === "on-plan"
      ? "予定どおり"
      : `${Math.abs(review.delta)}秒${review.delta < 0 ? "早い" : "遅い"}`;
  const explanation = review.rating === "not-executed"
    ? `今回は${maneuverLabel}しませんでした。予定を守らなかったこと自体ではなく、風・相手・マークのどれを見て変えたかが振り返りの中心です。`
    : review.rating === "on-plan"
      ? "予定どおり動けました。ただし、予定を守れたことと、戦術的に有利だったことは別です。下の航跡とゲインで確かめます。"
      : `${review.actualTime}秒に実行し、予定から${differenceLabel}判断でした。予定を変えた合図を、風向・相手との横距離・マーク位置から1つ選んで説明してみましょう。`;

  return (
    <section className="free-plan-review" aria-labelledby="free-plan-review-heading">
      <div className="section-kicker">PLAN → DO → REVIEW</div>
      <h3 id="free-plan-review-heading">予定と実行の違いを確認する</h3>
      <div className="free-plan-review__rail">
        <div><span>PLAN</span><strong>{review.plannedTime}秒</strong><small>走る前</small></div>
        <i aria-hidden="true">→</i>
        <div><span>DO</span><strong>{review.actualTime === null ? "実行なし" : `${review.actualTime}秒`}</strong><small>最初の{maneuverLabel}</small></div>
        <i aria-hidden="true">→</i>
        <div><span>GAP</span><strong>{differenceLabel}</strong><small>予定との差</small></div>
      </div>
      <p>{explanation}</p>
      <div className="free-plan-review__question">
        <strong>次に決めること</strong>
        <span>「予定を守る」か「見る合図を変える」か、どちらか1つ。</span>
      </div>
    </section>
  );
}

function PracticeProgress({
  history,
  recommendation,
  onStartNext,
}: {
  history: PracticeHistory;
  recommendation: PracticeRecommendation | null;
  onStartNext: () => void;
}) {
  const current = history.attempts.at(-1);
  if (!current || !recommendation) return null;

  const recentAttempts = history.attempts.slice(-3).reverse();
  return (
    <section className="free-practice-progress" aria-labelledby="free-practice-progress-heading" aria-live="polite">
      <div className="section-kicker">PRACTICE LOG / この端末の記録</div>
      <div className="free-practice-progress__heading">
        <h3 id="free-practice-progress-heading">今回の判断と次の練習</h3>
        <span>{history.attempts.length}回目</span>
      </div>
      <div className="free-practice-progress__current">
        <div>
          <span>根拠が確認できた操作</span>
          <strong>
            {current.maneuverCount === 0
              ? "操作なし"
              : <>{current.supportedCallCount}<small> / {current.maneuverCount}回</small></>}
          </strong>
        </div>
        <div>
          <span>マーク</span>
          <strong>{getMarkResultLabel(current.markResult)}</strong>
        </div>
        <div>
          <span>相手との差</span>
          <strong className={current.relativeGain >= 0 ? "gain-positive" : "gain-negative"}>
            {formatBoatDifference(current.relativeGain)}
          </strong>
        </div>
      </div>
      <ol className="free-practice-progress__history" aria-label="直近3回の練習記録">
        {recentAttempts.map((item, index) => (
          <li key={`${item.completedAt}-${index}`}>
            <span>{history.attempts.length - index}回目</span>
            <strong>{getMarkResultLabel(item.markResult)}</strong>
            <small>
              {item.maneuverCount === 0
                ? "操作なし"
                : `根拠あり ${item.supportedCallCount}/${item.maneuverCount}回`}
              {` ｜ 相手差 ${formatBoatDifference(item.relativeGain)}`}
            </small>
          </li>
        ))}
      </ol>
      <div className={`free-practice-progress__next free-practice-progress__next--${recommendation.mode}`}>
        <span>NEXT / 次に試すこと</span>
        <strong>{recommendation.heading}</strong>
        <p>{recommendation.detail}</p>
        <button type="button" className="primary-action" onClick={onStartNext}>
          {recommendation.buttonLabel}
        </button>
      </div>
      <small className="free-practice-progress__storage">練習記録はこの端末だけに最大8回保存します。名前や位置情報は記録しません。</small>
    </section>
  );
}

const schedulesMatch = (left: number[], right: number[]) =>
  left.length === right.length && left.every((time, index) => time === right[index]);

const getWinningRouteFirstChange = (
  analysis: WinningRouteAnalysis,
  maneuverLabel: string,
) => {
  const current = analysis.current.maneuverTimes;
  const recommended = analysis.recommended.maneuverTimes;
  if (schedulesMatch(current, recommended)) {
    return `今回の${maneuverLabel}列を、同じ合図で再現する。`;
  }

  const addedTime = recommended.find((time) => !current.includes(time));
  const removedTime = current.find((time) => !recommended.includes(time));
  if (addedTime !== undefined && removedTime === undefined) {
    return `最初の変更：${addedTime}秒に${maneuverLabel}を加える。`;
  }
  if (removedTime !== undefined && addedTime === undefined) {
    return `最初の変更：${removedTime}秒の${maneuverLabel}を見送る。`;
  }

  const firstDifference = Math.max(0, current.findIndex((time, index) => time !== recommended[index]));
  const from = current[firstDifference];
  const to = recommended[firstDifference];
  if (from === undefined) return `最初の変更：${to}秒に${maneuverLabel}する。`;
  if (to === undefined) return `最初の変更：${from}秒の${maneuverLabel}を見送る。`;
  return `最初の変更：${from}秒から${to}秒へ${maneuverLabel}を動かす。`;
};

const getWinningRouteCue = (
  analysis: WinningRouteAnalysis,
  config: FreeScenarioConfig,
) => {
  const recommended = analysis.recommended.maneuverTimes;
  const current = analysis.current.maneuverTimes;
  const firstRecommendedChange = recommended.find((time) => !current.includes(time))
    ?? recommended.find((time, index) => time !== current[index]);
  const firstRemovedTime = current.find((time) => !recommended.includes(time));
  const decisionTime = firstRecommendedChange ?? firstRemovedTime;
  if (decisionTime === undefined) {
    return "風向・相手・マークの3つを同じ順番で確認し、今回の判断を再現します。";
  }

  const sourceSchedule = firstRecommendedChange === undefined ? current : recommended;
  const maneuverCountBefore = sourceSchedule.filter((time) => time < decisionTime).length;
  const tackBefore = maneuverCountBefore % 2 === 0 ? "port" : "starboard";
  const snapshot = getWindDecisionSnapshot(config, decisionTime, tackBefore);
  const windMovement = snapshot.windTrend === "right"
    ? "右へ動く風"
    : snapshot.windTrend === "left"
      ? "左へ動く風"
      : "折り返し付近の風";
  if (firstRecommendedChange === undefined) {
    return `${decisionTime}秒は${windMovement}。ここでは小さな振れを追わず、次の変化とマークへの角度を待ちます。`;
  }
  if (snapshot.state === "unfavored") {
    return `${decisionTime}秒は${windMovement}で、操作前は不利側。返して有利側へ移るのが最初の合図です。`;
  }
  if (analysis.current.markResult !== "reached" && analysis.recommended.markResult === "reached") {
    return `${decisionTime}秒は${windMovement}で、操作前は風に対して有利側。それでも続けるとマークを外すため、ここは小さな振れよりレイラインへの進入角を優先して返します。`;
  }
  return `${decisionTime}秒は${windMovement}。風だけで決めず、マークへの角度と相手より前かを同時に確認します。`;
};

function WinningRouteFeedback({
  analysis,
  config,
  maneuverLabel,
  onJump,
}: {
  analysis: WinningRouteAnalysis;
  config: FreeScenarioConfig;
  maneuverLabel: string;
  onJump: (time: number) => void;
}) {
  const isAlreadyWinning = analysis.status === "already-winning";
  const foundWin = analysis.status === "win-found";
  const heading = isAlreadyWinning
    ? "相手より前でマークに到達しました"
    : foundWin
      ? "相手より前でマークに到達できる操作例"
      : "比較した中で最もよかった操作例";
  const recommendedLabel = foundWin ? "相手より前になる仮想試走" : isAlreadyWinning ? "今回" : "最もよかった仮想試走";
  const nextAction = isAlreadyWinning
    ? `次は画面の秒数を隠すつもりで、同じ風の合図から${maneuverLabel}を再現する。`
    : getWinningRouteFirstChange(analysis, maneuverLabel);

  return (
    <section className={`free-winning-route free-winning-route--${analysis.status}`} aria-labelledby="free-winning-route-heading">
      <div className="section-kicker">NEXT RUN / 次に試す操作</div>
      <div className="free-winning-route__heading">
        <h3 id="free-winning-route-heading">{heading}</h3>
        <span>{analysis.exploredRoutes} ROUTES</span>
      </div>
      <div className="free-winning-route__score" aria-label="今回と推奨する仮想試走の比較">
        <div>
          <span>今回</span>
          <strong>{getMarkResultLabel(analysis.current.markResult)}</strong>
          <small>{formatBoatDifference(analysis.current.relativeGain)}｜{analysis.current.endTime}秒</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>{recommendedLabel}</span>
          <strong>{getMarkResultLabel(analysis.recommended.markResult)}</strong>
          <small>{formatBoatDifference(analysis.recommended.relativeGain)}｜{analysis.recommended.endTime}秒</small>
        </div>
      </div>
      <div className="free-winning-route__schedule">
        <span>{isAlreadyWinning ? "再現する操作列" : "次に試す操作列"}（タップで時点へ）</span>
        <ol>
          {analysis.recommended.maneuverTimes.length > 0
            ? analysis.recommended.maneuverTimes.map((time, index) => (
                <li key={`${time}-${index}`}>
                  <button type="button" onClick={() => onJump(time)} aria-label={`${time}秒の推奨案をリプレイ`}>
                    <small>{index + 1}</small><strong>{time}秒</strong>
                  </button>
                </li>
              ))
            : <li className="is-hold"><strong>操作なし</strong></li>}
        </ol>
      </div>
      <div className="free-winning-route__call">
        <strong>{nextAction}</strong>
        <p>{getWinningRouteCue(analysis, config)}</p>
      </div>
      <p className="free-winning-route__limit">
        同じ風・相手・初期位置で最大{analysis.exploredRoutes}通りを比較。教材内の勝ちは「マーク到達＋相手より0.1艇身超前」です。実海面の勝利を保証するものではありません。
      </p>
    </section>
  );
}

function BlanketReview({ replay }: { replay: FreeScenarioReplay }) {
  const hadUserBlanket = replay.userBlanketSeconds > 0;
  const hadOpponentBlanket = replay.opponentBlanketSeconds > 0;
  const heading = hadUserBlanket && hadOpponentBlanket
    ? "両艇がブランケットの影響を受けました"
    : hadUserBlanket
      ? `自艇が相手の風下で${replay.userBlanketSeconds}秒減速しました`
      : hadOpponentBlanket
        ? `相手艇を${replay.opponentBlanketSeconds}秒減速させました`
        : "今回はブランケットの影響を受けませんでした";
  const nextCall = hadUserBlanket
    ? "次回：見かけの風の後流から横へ約1艇身外れ、クリーンエアへ移る。"
    : hadOpponentBlanket
      ? "次走：相手を影に置けても、マークへの進入角を失わない時間だけ使う。"
      : "次走：相手との前後差だけでなく、見かけの風の後ろへ重なる瞬間を声に出す。";

  return (
    <section className="free-blanket-review" aria-labelledby="free-blanket-review-heading">
      <div className="section-kicker">AIR CHECK / ブランケット</div>
      <h3 id="free-blanket-review-heading">{heading}</h3>
      <dl>
        <div>
          <dt>自艇が影にいた</dt>
          <dd>{replay.userBlanketSeconds}秒</dd>
          <small>{formatManeuverLoss(replay.userBlanketLoss)}</small>
        </div>
        <div>
          <dt>相手を影に置いた</dt>
          <dd>{replay.opponentBlanketSeconds}秒</dd>
          <small>{formatManeuverLoss(replay.opponentBlanketLoss)}</small>
        </div>
      </dl>
      <p>{nextCall}</p>
      <small className="free-blanket-review__model">
        教材モデル：同じタックで見かけの風の後流が重なる場合に、最大28%減速。後流は最大8艇身まで計算します。420実艇の測定値ではありません。
      </small>
    </section>
  );
}

const getMarkResultLabel = (result: "reached" | "missed" | "timeout") => {
  if (result === "reached") return "マーク到達";
  if (result === "missed") return "マーク外";
  return "時間切れ";
};

function ReplayTransport({
  time,
  endTime,
  isPlaying,
  speed,
  onToggle,
  onStep,
  onSpeedChange,
}: {
  time: number;
  endTime: number;
  isPlaying: boolean;
  speed: number;
  onToggle: () => void;
  onStep: (offset: number) => void;
  onSpeedChange: (speed: number) => void;
}) {
  return (
    <div className="free-replay-transport" aria-label="リプレイ操作">
      <div className="free-replay-transport__time">
        <span>REPLAY</span>
        <strong>{time}<small> / {endTime}秒</small></strong>
      </div>
      <div className="free-replay-transport__buttons">
        <button type="button" onClick={() => onStep(-1)} disabled={time <= 0} aria-label="1秒戻る">−1秒</button>
        <button type="button" className="free-replay-transport__play" onClick={onToggle}>
          {isPlaying ? "停止" : time >= endTime ? "最初から再生" : "再生"}
        </button>
        <button type="button" onClick={() => onStep(1)} disabled={time >= endTime} aria-label="1秒進む">+1秒</button>
      </div>
      <div className="free-replay-speed" aria-label="リプレイ速度">
        <span>速度</span>
        {[0.5, 1, 2].map((option) => (
          <button
            key={option}
            type="button"
            className={speed === option ? "is-active" : ""}
            aria-pressed={speed === option}
            onClick={() => onSpeedChange(option)}
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  );
}

const getManeuverPointCall = (review: ManeuverPointReview, leg: CourseLeg) => {
  if (review.stateBefore === "neutral") return "平均付近。風だけでは根拠が弱い";
  if (review.stateBefore === "unfavored" && review.stateAfter === "favored") {
    return leg === "upwind" ? "ヘダーを返してリフト側へ" : "風下へ向ける側へジャイブ";
  }
  return leg === "upwind" ? "リフト側から反対タックへ" : "風下へ向ける側から反対ジャイブへ";
};

const getReasonVerdictText = (review: ManeuverPointReview) => {
  if (review.reasonVerdict === "supported") return "宣言した根拠を、同時刻の記録でも確認。";
  if (review.reasonVerdict === "reconsider") {
    return `記録では「${getReasonLabel(review.strongestCue)}」の材料が強い。`;
  }
  if (review.reasonVerdict === "unclear") return "単独の決め手は弱い。複数の材料を比べる。";
  return "次走は、操作前に優先するものを1つコール。";
};

const getTrialPositionLabel = (
  reviewTime: number,
  trialTime: number,
  isCurrent: boolean,
) => {
  if (isCurrent) return "今回";
  const delta = trialTime - reviewTime;
  if (delta < 0) return `${Math.abs(delta)}秒早く`;
  if (delta > 0) return `${delta}秒遅く`;
  return "間隔なし";
};

function ManeuverPointLab({
  reviews,
  leg,
  maneuverLabel,
  onJump,
}: {
  reviews: ManeuverPointReview[];
  leg: CourseLeg;
  maneuverLabel: string;
  onJump: (time: number) => void;
}) {
  if (reviews.length === 0) return null;
  return (
    <section className="free-maneuver-lab" aria-labelledby="free-maneuver-lab-heading">
      <div className="section-kicker">POINT LOG / 全操作を点検</div>
      <h3 id="free-maneuver-lab-heading">すべての{maneuverLabel}を確認する</h3>
      <p>操作時にコールした「風・相手・マーク」を同時刻の記録と照合し、さらに各操作だけを前後4秒へ動かします。BESTはこの3試走内の結果で、唯一の正解ではありません。</p>
      <ol>
        {reviews.map((review) => {
          const trendLabel = review.windTrend === "right" ? "右へ変化中" : review.windTrend === "left" ? "左へ変化中" : "折り返し付近";
          const bestTrial = review.trials.find((trial) => trial.offset === review.bestOffset)!;
          const bestPosition = getTrialPositionLabel(review.time, bestTrial.maneuverTime, review.bestOffset === 0);
          const bestLabel = bestPosition.endsWith("遅く") ? bestPosition.replace("遅く", "待つ") : bestPosition;
          return (
            <li key={`${review.maneuverNumber}-${review.time}`}>
              <div className="free-maneuver-point__heading">
                <span>POINT {String(review.maneuverNumber).padStart(2, "0")}</span>
                <strong>{review.time}秒｜{getManeuverPointCall(review, leg)}</strong>
              </div>
              <dl>
                <div><dt>風</dt><dd>{getShiftLabel(Math.round(review.windAngle))}</dd></div>
                <div><dt>変化</dt><dd>{trendLabel}</dd></div>
                <div><dt>前 → 後</dt><dd>{review.tackBefore === "port" ? "ポート" : "スターボード"} → {review.tackAfter === "port" ? "ポート" : "スターボード"}</dd></div>
                <div><dt>前回から</dt><dd>{review.secondsSincePrevious === null ? "最初" : `${review.secondsSincePrevious}秒`}</dd></div>
              </dl>
              <div className={`free-maneuver-reason is-${review.reasonVerdict}`}>
                <div className="free-maneuver-reason__heading">
                  <span>YOUR CALL / 自分の根拠</span>
                  <strong>{getReasonLabel(review.declaredReason)}</strong>
                  <small>{getReasonVerdictText(review)}</small>
                </div>
                <ul aria-label={`${review.maneuverNumber}回目の${maneuverLabel}で確認した3つの材料`}>
                  {MANEUVER_REASON_OPTIONS.map((option) => {
                    const cue = review.tacticalCues[option.value];
                    return (
                      <li key={option.value} className={cue.supported ? "is-supported" : ""}>
                        <span>{cue.supported ? "根拠あり" : "要確認"}</span>
                        <strong>{option.label}</strong>
                        <small>{cue.observation}</small>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="free-maneuver-point__trials" aria-label={`${review.maneuverNumber}回目の${maneuverLabel}を前後4秒で比較`}>
                {review.trials.map((trial) => (
                  <span key={trial.offset} className={`${trial.offset === 0 ? "is-current " : ""}${trial.offset === review.bestOffset ? "is-best" : ""}`}>
                    <small>{getTrialPositionLabel(review.time, trial.maneuverTime, trial.offset === 0)}</small>
                    <strong>{trial.maneuverTime}秒</strong>
                    <em>{getMarkResultLabel(trial.markResult)}｜{formatBoatDifference(trial.relativeGain)}</em>
                  </span>
                ))}
              </div>
              <p className="free-maneuver-point__call">3試走で最もよかったタイミング：<strong>{bestLabel}</strong></p>
              {review.secondsSincePrevious !== null && review.secondsSincePrevious <= 5 ? (
                <p className="free-maneuver-point__warning">回復直後の連続操作です。小さな振れを追い過ぎていないか確認します。</p>
              ) : null}
              <button type="button" onClick={() => onJump(review.time)}>この操作からリプレイ</button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OpponentDecisionReview({
  decision,
  maneuverLabel,
}: {
  decision: OpponentDecision;
  maneuverLabel: string;
}) {
  const canTackSafely = decision.action === "tack";
  const requiredSeconds = decision.maneuverRecoverySeconds + 1;
  const actionLabel = canTackSafely ? `先に${maneuverLabel}` : "下って回避";
  const marginLabel = decision.safetyMarginSeconds >= 0
    ? `+${decision.safetyMarginSeconds}秒`
    : `${decision.safetyMarginSeconds}秒`;
  const reason = canTackSafely
    ? `この教材の${maneuverLabel}回復${decision.maneuverRecoverySeconds}秒と安全余裕1秒を確保できます。相手はミート地点まで待たず、レイライン前で${maneuverLabel}します。`
    : `この教材で必要な${requiredSeconds}秒に足りません。ここで${maneuverLabel}すると、操作中も避ける余地がなくなるため、相手は下って後ろを通ります。`;

  return (
    <section className={`free-meet-check free-meet-check--${decision.action}`} aria-labelledby="free-meet-check-heading">
      <div className="section-kicker">MEET CHECK / 相手は何を見た？</div>
      <div className="free-meet-check__heading">
        <h3 id="free-meet-check-heading">{decision.secondsToMeeting}秒前に、{actionLabel}。</h3>
        <span>{decision.time}秒の判断</span>
      </div>
      <div className="free-meet-check__ruler" aria-label={`ミートまで${decision.secondsToMeeting}秒、タックに必要な時間${requiredSeconds}秒`}>
        <div>
          <small>予測したミート</small>
          <strong>あと{decision.secondsToMeeting}秒</strong>
        </div>
        <i aria-hidden="true">−</i>
        <div>
          <small>教材基準：回復{decision.maneuverRecoverySeconds}秒＋安全1秒</small>
          <strong>必要{requiredSeconds}秒</strong>
        </div>
        <b className={decision.safetyMarginSeconds >= 0 ? "is-safe" : "is-late"}>{marginLabel}</b>
      </div>
      <p>{reason}</p>
      <dl className="free-meet-check__facts">
        <div><dt>すれ違い予測</dt><dd>{decision.closestDistanceBoatLengths.toFixed(1)}艇身</dd></div>
        <div><dt>判断の順番</dt><dd>反対タック → 秒数 → 余地</dd></div>
      </dl>
      <div className="free-meet-check__question">
        <strong>自分なら何をコールする？</strong>
        <span>「ミートまで○秒、タックできる／もう下る」を声に出してからリプレイを進めます。</span>
      </div>
    </section>
  );
}

function FreeWindStrip({
  config,
  time,
  windAngles,
}: {
  config: FreeScenarioConfig;
  time: number;
  windAngles: number[];
}) {
  const angle = windAngles[time] ?? 0;
  const duration = Math.max(1, windAngles.length - 1);
  const points = windAngles
    .map((value, index) => `${(index / duration) * 100},${24 - value * 1.05}`)
    .join(" ");
  return (
    <section className="free-wind-strip" aria-label="現在の海面設定と風向">
      <div className="free-wind-strip__live">
        <span className="free-wind-arrow" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">↑</span>
        <span><small>現在の風</small><strong>{getShiftLabel(Math.round(angle))}</strong></span>
      </div>
      <div className="free-wind-strip__graph">
        <span>{getPatternLabel(config.windPattern)}</span>
        <svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label="風向変化の予定線">
          <line x1="0" y1="24" x2="100" y2="24" />
          <polyline points={points} />
          <line className="free-wind-cursor" x1={(time / duration) * 100} y1="2" x2={(time / duration) * 100} y2="46" />
        </svg>
      </div>
      <dl className="free-wind-strip__facts">
        <div><dt>レグ</dt><dd>{config.leg === "upwind" ? "上り" : "下り"}</dd></div>
        <div><dt>風の変化</dt><dd>{getTempoLabel(config.windTempo)}</dd></div>
        <div><dt>横の距離</dt><dd>{config.leverageBoatLengths}艇身</dd></div>
        <div><dt>相手</dt><dd>{getOpponentLabel(config.opponentMode)}</dd></div>
      </dl>
    </section>
  );
}

function ShiftDecisionBar({
  config,
  time,
  tack,
}: {
  config: FreeScenarioConfig;
  time: number;
  tack: "port" | "starboard";
}) {
  const snapshot = getWindDecisionSnapshot(config, time, tack);
  const trendLabel = snapshot.windTrend === "right"
    ? "右へ動く"
    : snapshot.windTrend === "left"
      ? "左へ動く"
      : "折り返し";
  const stateLabel = snapshot.state === "neutral"
    ? "平均付近"
    : snapshot.state === "favored"
      ? config.leg === "upwind" ? "リフト側" : "風下へ向ける側"
      : config.leg === "upwind" ? "ヘダー側" : "横へ逃げる側";
  const call = snapshot.state === "neutral"
    ? "どの合図を待つ？"
    : "返す前に、優先を1つ選ぶ";
  return (
    <section className={`free-decision-bar is-${snapshot.state}`} aria-label="現在のタックまたはジャイブ判断" aria-live="polite">
      <span><small>WIND MOVE</small><strong>{trendLabel}</strong></span>
      <i aria-hidden="true">→</i>
      <span><small>NOW</small><strong>{stateLabel}</strong></span>
      <i aria-hidden="true">→</i>
      <span><small>CALL</small><strong>{call}</strong></span>
    </section>
  );
}

function ManeuverReasonPrompt({
  time,
  maneuverLabel,
  onChoose,
}: {
  time: number;
  maneuverLabel: string;
  onChoose: (reason: ManeuverReason) => void;
}) {
  return (
    <section className="free-reason-prompt" aria-labelledby="free-reason-prompt-heading" aria-live="polite">
      <div>
        <span>WHY NOW? / {time}秒のコール</span>
        <strong id="free-reason-prompt-heading">何を優先して{maneuverLabel}する？</strong>
        <small>選ぶまで時計は止まります。唯一の正解ではなく、自分の根拠を残します。</small>
      </div>
      <div className="free-reason-prompt__choices">
        {MANEUVER_REASON_OPTIONS.map((option) => (
          <button key={option.value} type="button" onClick={() => onChoose(option.value)}>
            <strong>{option.label}</strong>
            <small>{option.note}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function FreeSetup({
  config,
  plannedTime,
  loadedFromSharedLink,
  onChange,
  onPlanTimeChange,
  onStart,
}: {
  config: FreeScenarioConfig;
  plannedTime: number;
  loadedFromSharedLink: boolean;
  onChange: (config: FreeScenarioConfig) => void;
  onPlanTimeChange: (time: number) => void;
  onStart: () => void;
}) {
  const selectPreset = (preset: FreeDrillPreset) => {
    onChange({ ...preset.config });
    onPlanTimeChange(getPresetPlanTime(preset));
  };

  return (
    <section className="free-setup" aria-labelledby="free-setup-heading">
      <div className="section-kicker">SET SHIFT / 練習条件を設定</div>
      <h2 id="free-setup-heading">タック／ジャイブの練習条件</h2>

      <DrillIndex config={config} onSelect={selectPreset} />

      <div className="free-custom-divider">
        <span>CUSTOM SETUP</span>
        <strong>条件を細かく変える</strong>
      </div>

      <fieldset className="free-control-group">
        <legend>1　走るレグ</legend>
        <ChoiceButtons
          name="走るレグ"
          options={LEG_OPTIONS}
          value={config.leg}
          onChange={(leg) => onChange({ ...config, leg })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>2　最大の風の振れ</legend>
        <div className="free-range-readout">
          <span>左18°</span>
          <output htmlFor="free-shift-angle">{getShiftLabel(config.shiftAngle)}</output>
          <span>右18°</span>
        </div>
        <input
          id="free-shift-angle"
          type="range"
          min="-18"
          max="18"
          step="2"
          value={config.shiftAngle}
          aria-label="最大の風の振れ"
          onChange={(event) => onChange({ ...config, shiftAngle: Number(event.target.value) })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>3　風の変化速度</legend>
        <ChoiceButtons
          name="風の変化速度"
          options={WIND_TEMPOS}
          value={config.windTempo}
          onChange={(windTempo) => onChange({ ...config, windTempo })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>4　風は何回動く？</legend>
        <ChoiceButtons
          name="その後の風"
          options={WIND_PATTERNS}
          value={config.windPattern}
          onChange={(windPattern) => onChange({ ...config, windPattern })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>5　最初の横の距離</legend>
        <div className="free-range-readout">
          <span>近い</span>
          <output htmlFor="free-leverage">{config.leverageBoatLengths}艇身</output>
          <span>遠い</span>
        </div>
        <input
          id="free-leverage"
          type="range"
          min="4"
          max="20"
          step="2"
          value={config.leverageBoatLengths}
          aria-label="最初の横の距離"
          onChange={(event) => onChange({ ...config, leverageBoatLengths: Number(event.target.value) })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>6　相手の動き</legend>
        <ChoiceButtons
          name="相手の動き"
          options={OPPONENT_MODES}
          value={config.opponentMode}
          onChange={(opponentMode) => onChange({ ...config, opponentMode })}
        />
        <p className="free-opponent-rule-note">
          「最適化」は教育モデル内で、4°以上の振れ、操作回復、レイライン、12秒先のミートを毎秒読みます。共通して、安全に返せる余裕がなければ下って後ろを通ります。実海面の唯一の正解ではありません。
        </p>
      </fieldset>

      <ManeuverPlan
        config={config}
        plannedTime={plannedTime}
        onChange={onPlanTimeChange}
      />

      <ShareScenario config={config} loadedFromSharedLink={loadedFromSharedLink} />

      <div className="free-start-note">
        <strong>マークまで何度でも操作できます。</strong>
        <p>風が次に反対へ動いたら、もう一度、今の走りが有利かを判断します。リプレイは全操作を残します。</p>
      </div>
      <button type="button" className="primary-action" onClick={onStart}>
        この条件でシミュレーションを始める <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}

export function FreeSimulation({ onBack }: { onBack: () => void }) {
  // Lazy initialization keeps shared-link parsing to the component's initial setup.
  // Source: https://react.dev/reference/react/useState#avoiding-recreating-the-initial-state
  const [initialSetup] = useState<InitialFreeSetup>(readInitialFreeSetup);
  const [phase, setPhase] = useState<FreePhase>("setup");
  const [draftConfig, setDraftConfig] = useState<FreeScenarioConfig>(initialSetup.config);
  const [activeConfig, setActiveConfig] = useState<FreeScenarioConfig>(initialSetup.config);
  const [draftPlannedTime, setDraftPlannedTime] = useState(() =>
    getFreeWindTimeline(initialSetup.config).peak
  );
  const [activePlannedTime, setActivePlannedTime] = useState(() =>
    getFreeWindTimeline(initialSetup.config).peak
  );
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [liveSpeed, setLiveSpeed] = useState(1);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [userManeuverTimes, setUserManeuverTimes] = useState<number[]>([]);
  const [maneuverReasonCalls, setManeuverReasonCalls] = useState<ManeuverReasonCall[]>([]);
  const [reasonPromptTime, setReasonPromptTime] = useState<number | null>(null);
  const [resumeAfterReason, setResumeAfterReason] = useState(false);
  const [practiceHistory, setPracticeHistory] = useState<PracticeHistory>(readPracticeHistory);
  const activeRunId = useRef(0);
  const recordedRunId = useRef<number | null>(null);
  const replay = useMemo(
    () => runFreeScenario(activeConfig, userManeuverTimes),
    [activeConfig, userManeuverTimes],
  );
  const setupReplay = useMemo(() => runFreeScenario(draftConfig, []), [draftConfig]);
  const baseline = useMemo(() => runFreeScenario(activeConfig, []), [activeConfig]);
  const maneuverReviews = useMemo(
    () => analyzeManeuverPoints(activeConfig, userManeuverTimes, maneuverReasonCalls),
    [activeConfig, maneuverReasonCalls, userManeuverTimes],
  );
  const winningRouteAnalysis = useMemo(
    () => phase === "replay" ? analyzeWinningRoute(activeConfig, userManeuverTimes) : null,
    [activeConfig, phase, userManeuverTimes],
  );
  const shiftTimingAnalysis = useMemo(
    () => phase === "replay" ? analyzeShiftTimingChoice(activeConfig) : null,
    [activeConfig, phase],
  );
  const winningRouteReplay = useMemo(() => {
    if (!winningRouteAnalysis
      || winningRouteAnalysis.status === "already-winning"
      || schedulesMatch(
        winningRouteAnalysis.current.maneuverTimes,
        winningRouteAnalysis.recommended.maneuverTimes,
      )) return null;
    return runFreeScenario(activeConfig, winningRouteAnalysis.recommended.maneuverTimes);
  }, [activeConfig, winningRouteAnalysis]);
  const practiceRecommendation = useMemo(
    () => getPracticeRecommendation(practiceHistory),
    [practiceHistory],
  );
  const comparisons = useMemo<CourseComparison[]>(
    () => phase === "replay"
      ? [
          { replay: baseline, variant: "no-tack", label: "自艇操作なし" } as CourseComparison,
          ...(winningRouteReplay
            ? [{
                replay: winningRouteReplay,
                variant: "coach" as const,
                label: winningRouteAnalysis?.status === "win-found" ? "相手より前になる仮想航跡" : "改善案の仮想航跡",
              }]
            : []),
        ]
      : [],
    [baseline, phase, winningRouteAnalysis?.status, winningRouteReplay],
  );

  useEffect(() => {
    if (phase !== "playing" || isPaused) return;
    if (time >= replay.endTime) {
      setPhase("replay");
      return;
    }
    const timer = window.setTimeout(() => setTime((current) => current + 1), 720 / liveSpeed);
    return () => window.clearTimeout(timer);
  }, [isPaused, liveSpeed, phase, replay.endTime, time]);

  useEffect(() => {
    if (phase !== "replay" || !isReplayPlaying) return;
    if (time >= replay.endTime) {
      setIsReplayPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setTime((current) => Math.min(replay.endTime, current + 1)),
      560 / replaySpeed,
    );
    return () => window.clearTimeout(timer);
  }, [isReplayPlaying, phase, replay.endTime, replaySpeed, time]);

  useEffect(() => {
    if (phase !== "replay" || recordedRunId.current === activeRunId.current) return;
    recordedRunId.current = activeRunId.current;
    const attempt = createPracticeAttempt(activeConfig, maneuverReviews, replay);
    const nextHistory = recordPracticeAttempt(practiceHistory, attempt);
    setPracticeHistory(nextHistory);
    // localStorage is used only as an on-device practice log. Browsers may deny
    // storage, so the current session continues even when persistence fails.
    // Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
    try {
      window.localStorage.setItem(PRACTICE_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    } catch {
      // The in-memory history still supports the next practice decision.
    }
  }, [activeConfig, maneuverReviews, phase, practiceHistory, replay]);

  const start = (config = draftConfig, plannedTime = draftPlannedTime) => {
    activeRunId.current += 1;
    recordedRunId.current = null;
    setActiveConfig({ ...config });
    setActivePlannedTime(plannedTime);
    setTime(0);
    setUserManeuverTimes([]);
    setManeuverReasonCalls([]);
    setReasonPromptTime(null);
    setIsPaused(false);
    setIsReplayPlaying(false);
    setPhase("playing");
  };

  const requestManeuver = () => {
    const lastTime = userManeuverTimes[userManeuverTimes.length - 1] ?? -10;
    if (time < 1 || time - lastTime < 4) return;
    setReasonPromptTime(time);
    setResumeAfterReason(!isPaused);
    setIsPaused(true);
  };

  const maneuverWithReason = (reason: ManeuverReason) => {
    if (reasonPromptTime === null) return;
    // React state arrays are replaced rather than mutated so rapid consecutive
    // calls retain both the maneuver time and its declared reason.
    // Source: https://react.dev/learn/updating-arrays-in-state
    setUserManeuverTimes((current) => [...current, reasonPromptTime]);
    setManeuverReasonCalls((current) => [...current, { time: reasonPromptTime, reason }]);
    setReasonPromptTime(null);
    if (resumeAfterReason) setIsPaused(false);
    setResumeAfterReason(false);
  };

  const changeConditions = () => {
    setDraftConfig(activeConfig);
    setDraftPlannedTime(activePlannedTime);
    setTime(0);
    setReasonPromptTime(null);
    setIsReplayPlaying(false);
    setPhase("setup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startRecommendedPractice = () => {
    if (!practiceRecommendation) return;
    const nextConfig = practiceRecommendation.config;
    const nextPlannedTime = isSameConfig(nextConfig, activeConfig)
      ? activePlannedTime
      : getFreeWindTimeline(nextConfig).peak;
    setDraftConfig(nextConfig);
    setDraftPlannedTime(nextPlannedTime);
    start(nextConfig, nextPlannedTime);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startShiftTimingPractice = (plannedTime: number) => {
    setDraftConfig(activeConfig);
    setDraftPlannedTime(plannedTime);
    start(activeConfig, plannedTime);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const displayConfig = phase === "setup" ? draftConfig : activeConfig;
  const displayReplay = phase === "setup" ? setupReplay : replay;
  const displayTime = phase === "setup" ? 0 : time;
  const currentFrame = displayReplay.frames[displayTime];
  const gain = currentFrame.relativeGain / BOAT_LENGTH_PX;
  const commonTimeComparison = getRelativeGainDifferenceAtCommonTime(replay, baseline);
  const choiceGain = commonTimeComparison.difference;
  const maneuverLabel = activeConfig.leg === "upwind" ? "タック" : "ジャイブ";
  const lastManeuverTime = userManeuverTimes[userManeuverTimes.length - 1] ?? -10;
  const canManeuver = phase === "playing" && time >= 1 && time - lastManeuverTime >= 4;
  const windAngles = displayReplay.frames.map((frame) => frame.windAngle);
  const opponentIsAvoiding = displayReplay.events.some((event) =>
    event.kind === "avoid" && displayTime >= event.time && displayTime <= event.time + 2
  );
  const opponentTackedAtMeeting = displayReplay.events.some((event) =>
    event.kind === "opponent-tack"
      && event.label.includes("ミート前")
      && displayTime === event.time
  );
  const currentOpponentDecision = displayReplay.opponentDecisions.find((decision) =>
    displayTime >= decision.time
      && displayTime <= decision.time + (decision.action === "duck" ? 2 : 0)
  );
  const replayOpponentDecision = [...replay.opponentDecisions]
    .reverse()
    .find((decision) => decision.time <= time) ?? replay.opponentDecisions[0];
  const meetingForecast = displayReplay.opponentDecisions.find((decision) =>
    decision.time === displayTime
  );
  const currentExplanation = getExplanation(
    displayTime,
    displayConfig,
    gain,
    userManeuverTimes.length,
    opponentIsAvoiding,
    opponentTackedAtMeeting,
    currentOpponentDecision,
    currentFrame.blanket,
  );
  const toggleReplay = () => {
    if (isReplayPlaying) {
      setIsReplayPlaying(false);
      return;
    }
    if (time >= replay.endTime) setTime(0);
    setIsReplayPlaying(true);
  };
  const stepReplay = (offset: number) => {
    setIsReplayPlaying(false);
    setTime((current) => Math.min(replay.endTime, Math.max(0, current + offset)));
  };

  return (
    <div className={`free-simulation free-simulation--${phase}`}>
      <section className="lesson-heading free-heading">
        <div>
          <div className="section-kicker">SHIFT LAB / TACK &amp; GYBE POINT</div>
          <h1>風の振れに合わせて、<br />タック／ジャイブする。</h1>
        </div>
        <p>右、左、また右へ。何度も振れる海面で、待つか返すかを繰り返し判断します。リプレイでは、すべてのタック／ジャイブポイントを個別に比べます。</p>
      </section>

      <FreeWindStrip config={displayConfig} time={displayTime} windAngles={windAngles} />

      <div className="free-workspace">
        <div className="free-workspace__course">
          {phase !== "setup" ? (
            <ShiftDecisionBar config={displayConfig} time={displayTime} tack={currentFrame.user.tack} />
          ) : null}
          <CourseBoard
            frame={currentFrame}
            replay={displayReplay}
            comparisons={comparisons}
            leg={displayConfig.leg}
            meetingForecast={meetingForecast ? {
              point: meetingForecast.meetingPoint,
              seconds: meetingForecast.secondsToMeeting,
            } : undefined}
          />

          {phase === "playing" ? (
            <div className="action-dock free-action-dock">
              {reasonPromptTime !== null ? (
                <ManeuverReasonPrompt
                  time={reasonPromptTime}
                  maneuverLabel={maneuverLabel}
                  onChoose={maneuverWithReason}
                />
              ) : null}
              <div className="play-clock">
                <strong>{time}</strong><span>秒</span>
                <p>{reasonPromptTime !== null ? "時計を止めました。根拠を選ぶと同じ時刻から再開します。" : isPaused ? `停止中。${currentExplanation}` : currentExplanation}</p>
              </div>
              <button type="button" className="pause-action" onClick={() => setIsPaused((current) => !current)} disabled={reasonPromptTime !== null}>
                {isPaused ? "再開" : "一時停止"}
              </button>
              <button type="button" className="tack-action" onClick={requestManeuver} disabled={!canManeuver || reasonPromptTime !== null}>
                <span>今、{maneuverLabel}</span>
                <small>根拠をコール → 実行</small>
              </button>
              <button type="button" className="text-action" onClick={changeConditions}>中止して条件を変える</button>
            </div>
          ) : null}
        </div>

        <aside className="free-workspace__controls">
          {phase === "setup" ? (
            <FreeSetup
              config={draftConfig}
              plannedTime={draftPlannedTime}
              loadedFromSharedLink={initialSetup.loadedFromSharedLink}
              onChange={setDraftConfig}
              onPlanTimeChange={setDraftPlannedTime}
              onStart={() => start()}
            />
          ) : null}

          {phase === "playing" ? (
            <section className="free-watch" aria-labelledby="free-watch-heading">
              <div className="section-kicker">OBSERVE / 比べる</div>
              <h2 id="free-watch-heading">自艇と相手艇の差を確認する</h2>
              <p>{currentExplanation}</p>
              <dl className="free-live-data">
                <div><dt>相手との差</dt><dd>{gain >= 0 ? "+" : ""}{gain.toFixed(1)}艇身</dd></div>
                <div><dt>現在の横距離</dt><dd>{(currentFrame.leverage / BOAT_LENGTH_PX).toFixed(1)}艇身</dd></div>
                <div><dt>操作回数</dt><dd>{userManeuverTimes.length}回</dd></div>
                <div><dt>相手の状態</dt><dd>{opponentTackedAtMeeting ? "ミート前にタック" : opponentIsAvoiding ? "ベア中" : `${replay.opponentManeuverTimes.filter((eventTime) => eventTime <= time).length}回操作`}</dd></div>
                <div><dt>空気</dt><dd>{currentFrame.blanket?.affected === "user" ? `影で−${Math.round((1 - currentFrame.blanket.speedMultiplier) * 100)}%` : currentFrame.blanket?.affected === "opponent" ? `相手を−${Math.round((1 - currentFrame.blanket.speedMultiplier) * 100)}%` : "クリーン"}</dd></div>
                <div><dt>基準艇速との比</dt><dd>{Math.round(currentFrame.user.speed / (activeConfig.leg === "upwind" ? 8.4 : 7.2) * 100)}%</dd></div>
                <div><dt>最初の予定</dt><dd>{activePlannedTime}秒</dd></div>
                <div><dt>最初の実行</dt><dd>{userManeuverTimes[0] === undefined ? "まだ" : `${userManeuverTimes[0]}秒`}</dd></div>
              </dl>
              <button type="button" className="secondary-action free-reset-action" onClick={() => start(activeConfig, activePlannedTime)}>
                同じ条件で最初から
              </button>
              <div className="free-live-speed" role="group" aria-label="シミュレーションの進行速度">
                <span>進行速度</span>
                {[1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={liveSpeed === speed ? "is-active" : ""}
                    aria-pressed={liveSpeed === speed}
                    onClick={() => setLiveSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {phase === "replay" ? (
            <section className="free-replay" aria-labelledby="free-replay-heading">
              <div className="section-kicker">COMPARE / 操作なしと比べる</div>
              <h2 id="free-replay-heading">操作の結果を確認する</h2>
              <div className={`free-mark-result free-mark-result--${replay.markResult}`}>
                <span>{replay.markResult === "reached" ? "MARK REACHED" : replay.markResult === "missed" ? "MARK MISSED" : "TIME LIMIT"}</span>
                <strong>
                  {replay.markResult === "reached"
                    ? `${activeConfig.leg === "upwind" ? "風上" : "風下"}マークに到達`
                    : replay.markResult === "missed"
                      ? "マークを外して通過"
                      : "制限時間で終了"}
                </strong>
                <small>{replay.endTime}秒　｜　マークとの距離 {replay.markDistance.toFixed(1)}艇身</small>
              </div>
              <div className="free-result-number">
                <span>{commonTimeComparison.time}秒時点の<br />自艇操作なしとの差</span>
                <strong className={choiceGain >= 0 ? "gain-positive" : "gain-negative"}>
                  {formatBoatDifference(choiceGain)}
                </strong>
              </div>
              <p className="free-result-explanation">
                {userManeuverTimes.length === 0
                  ? `今回は${maneuverLabel}しませんでした。次は風向か相手の位置を合図に操作し、同じ条件で差を比べましょう。`
                  : Math.abs(choiceGain) < 0.3
                    ? "今回の操作では、自艇を操作しない場合とほぼ同じ結果でした。タイミングを前後へ動かして比べましょう。"
                  : choiceGain > 0
                    ? `今回の${maneuverLabel}により、同じ時刻の操作なし航跡より前にいました。艇速ロスを払っても残ったゲインです。`
                    : `今回の${maneuverLabel}では、同じ時刻の操作なし航跡より後ろでした。風の戻りと艇速ロスを時間軸で確認します。`}
              </p>

              {winningRouteAnalysis ? (
                <WinningRouteFeedback
                  analysis={winningRouteAnalysis}
                  config={activeConfig}
                  maneuverLabel={maneuverLabel}
                  onJump={(pointTime) => {
                    setIsReplayPlaying(false);
                    setTime(Math.min(replay.endTime, pointTime));
                  }}
                />
              ) : null}

              <BlanketReview replay={replay} />

              <PlanReview
                plannedTime={activePlannedTime}
                maneuverTimes={userManeuverTimes}
                maneuverLabel={maneuverLabel}
              />

              {shiftTimingAnalysis ? (
                <ShiftTimingComparison
                  analysis={shiftTimingAnalysis}
                  maneuverLabel={maneuverLabel}
                  actualTime={userManeuverTimes[0]}
                  onPractice={startShiftTimingPractice}
                />
              ) : null}

              <input
                className="timeline-slider"
                type="range"
                min="0"
                max={replay.endTime}
                step="1"
                value={time}
                aria-label="SHIFT LABのリプレイ時刻"
                onChange={(event) => {
                  setIsReplayPlaying(false);
                  setTime(Number(event.target.value));
                }}
              />
              <ReplayTransport
                time={time}
                endTime={replay.endTime}
                isPlaying={isReplayPlaying}
                speed={replaySpeed}
                onToggle={toggleReplay}
                onStep={stepReplay}
                onSpeedChange={setReplaySpeed}
              />
              <div className="event-strip" aria-label="重要な出来事">
                {replay.events.map((event, index) => (
                  <button
                    key={`${event.kind}-${event.time}-${index}`}
                    type="button"
                    className={time === event.time ? "event-chip event-chip--active" : "event-chip"}
                    onClick={() => {
                      setIsReplayPlaying(false);
                      setTime(event.time);
                    }}
                  >
                    <span>{event.time}秒</span>{event.label}
                  </button>
                ))}
              </div>
              {replayOpponentDecision ? (
                <OpponentDecisionReview
                  decision={replayOpponentDecision}
                  maneuverLabel={maneuverLabel}
                />
              ) : null}
              <dl className="free-live-data free-live-data--replay">
                <div><dt>現在の差</dt><dd>{formatBoatDifference(gain)}</dd></div>
                <div><dt>最も有利</dt><dd>{formatBoatDifference(replay.maxRelativeGain)}</dd></div>
                <div><dt>最も不利</dt><dd>{formatBoatDifference(replay.minRelativeGain)}</dd></div>
                <div><dt>{maneuverLabel}の艇速ロス</dt><dd>{formatManeuverLoss(replay.userManeuverLoss)}</dd></div>
                <div><dt>自艇のブランケット損失</dt><dd>{formatManeuverLoss(replay.userBlanketLoss)}</dd></div>
                <div><dt>相手のブランケット損失</dt><dd>{formatManeuverLoss(replay.opponentBlanketLoss)}</dd></div>
              </dl>
              <div className="coach-note free-coach-note">
                <span className="coach-note__tape">この時点</span>
                <p>{currentExplanation}</p>
              </div>
              <ManeuverPointLab
                reviews={maneuverReviews}
                leg={activeConfig.leg}
                maneuverLabel={maneuverLabel}
                onJump={(pointTime) => {
                  setIsReplayPlaying(false);
                  setTime(pointTime);
                }}
              />
              <PracticeProgress
                history={practiceHistory}
                recommendation={practiceRecommendation}
                onStartNext={startRecommendedPractice}
              />
              <div className="free-replay-actions">
                <button type="button" className="secondary-action" onClick={changeConditions}>条件を変える</button>
                <button type="button" className="text-action" onClick={onBack}>コース一覧へ</button>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
