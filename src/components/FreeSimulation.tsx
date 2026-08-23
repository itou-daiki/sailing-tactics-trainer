import { useEffect, useMemo, useState } from "react";
import { CourseBoard, type CourseComparison } from "./CourseBoard";
import { BOAT_LENGTH_PX, type BlanketState } from "../domain/simulation";
import {
  DEFAULT_FREE_CONFIG,
  analyzeManeuverPoints,
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
  type OpponentDecision,
  type OpponentMode,
  type WinningRouteAnalysis,
  type WindPattern,
  type WindTempo,
} from "../domain/freeSimulation";

type FreePhase = "setup" | "playing" | "replay";

type PlanCue = "shiftStart" | "peak" | "returnStart";

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
  { value: "return", label: "平均へ戻る", note: "暫定ゲインが消える過程を見る" },
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
  { value: "optimize", label: "最適化", note: "振れ・レイライン・ミートを毎秒読む" },
  { value: "fixed", label: "18秒で先に返す", note: "その後もレイラインを守る" },
  { value: "cover", label: "2秒後にカバー", note: "追従後もレイラインを守る" },
];

const LEG_OPTIONS: Array<{ value: CourseLeg; label: string; action: string }> = [
  { value: "upwind", label: "上り", action: "タック" },
  { value: "downwind", label: "下り", action: "ジャイブ" },
];

const FREE_DRILL_PRESETS: FreeDrillPreset[] = [
  {
    id: "oscillating-upwind",
    label: "連続するヘダーを返す",
    focus: "右→左→右の振れで、タックする窓を繰り返し探す",
    tag: "上り・連続タック",
    config: {
      leg: "upwind",
      shiftAngle: 12,
      windPattern: "oscillating",
      windTempo: "standard",
      leverageBoatLengths: 14,
      opponentMode: "hold",
    },
    planCue: "shiftStart",
  },
  {
    id: "oscillating-downwind",
    label: "下りのジャイブ窓",
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
    planCue: "shiftStart",
  },
  {
    id: "single-return",
    label: "1回の振れ戻りを分解",
    focus: "振れ始め・最大・戻り始めのどこで返すか比べる",
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
    label: "戻らない風を見抜く",
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

const getPresetPlanTime = (preset: FreeDrillPreset) =>
  getFreeWindTimeline(preset.config)[preset.planCue];

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
  return `${angle > 0 ? "右" : "左"}${Math.abs(angle)}°`;
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
          <h3 id="free-drills-heading">見分けたい場面から選ぶ。</h3>
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
  const cues = config.windPattern === "oscillating"
    ? [
        { label: "最初の振れ始め", time: timeline.shiftStart },
        { label: "最初の最大振れ", time: timeline.peak },
        { label: "平均を反対へ通過", time: timeline.shiftStart + quarterCycle * 2 },
      ]
    : [
        { label: "振れ始め", time: timeline.shiftStart },
        { label: "最大振れ", time: timeline.peak },
        ...(config.windPattern === "hold"
          ? []
          : [{ label: "戻り始め", time: timeline.returnStart }]),
      ];

  return (
    <fieldset className="free-plan">
      <legend>7　走る前のプラン</legend>
      <div className="free-plan__tape" aria-hidden="true">PLAN → DO → REVIEW</div>
      <h3>最初の{maneuverLabel}判断を、どこに置く？</h3>
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
        <h3 id="free-share-heading">設定をURLにして共有。</h3>
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
      <h3 id="free-plan-review-heading">予定と実行を分けて見る。</h3>
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
    ? "この走りは、前でマークへ。"
    : foundWin
      ? "この操作列なら、前でマークへ。"
      : "勝ち切れない。まず、この案まで直す。";
  const recommendedLabel = foundWin ? "勝ち筋の仮想試走" : isAlreadyWinning ? "今回" : "最も改善した仮想試走";
  const nextAction = isAlreadyWinning
    ? `次は画面の秒数を隠すつもりで、同じ風の合図から${maneuverLabel}を再現する。`
    : getWinningRouteFirstChange(analysis, maneuverLabel);

  return (
    <section className={`free-winning-route free-winning-route--${analysis.status}`} aria-labelledby="free-winning-route-heading">
      <div className="section-kicker">NEXT RUN / どうすれば勝てた？</div>
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
    ? "両艇が、きれいな風を奪い合った。"
    : hadUserBlanket
      ? `相手の影で、${replay.userBlanketSeconds}秒減速。`
      : hadOpponentBlanket
        ? `相手を、${replay.opponentBlanketSeconds}秒減速させた。`
        : "今回は、クリーンエアを保った。";
  const nextCall = hadUserBlanket
    ? "次走：見かけの風の後ろから、横へ約1艇身外れる進路を先に探す。"
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
  return leg === "upwind" ? "リフト側を手放した" : "風下へ向ける側を手放した";
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
      <h3 id="free-maneuver-lab-heading">すべての{maneuverLabel}ポイントを見る。</h3>
      <p>各操作だけを前後4秒へ動かした仮想航跡と比べます。BESTはこの3試走内の結果で、唯一の正解ではありません。</p>
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
              <div className="free-maneuver-point__trials" aria-label={`${review.maneuverNumber}回目の${maneuverLabel}を前後4秒で比較`}>
                {review.trials.map((trial) => (
                  <span key={trial.offset} className={`${trial.offset === 0 ? "is-current " : ""}${trial.offset === review.bestOffset ? "is-best" : ""}`}>
                    <small>{getTrialPositionLabel(review.time, trial.maneuverTime, trial.offset === 0)}</small>
                    <strong>{trial.maneuverTime}秒</strong>
                    <em>{getMarkResultLabel(trial.markResult)}｜{formatBoatDifference(trial.relativeGain)}</em>
                  </span>
                ))}
              </div>
              <p className="free-maneuver-point__call">この3試走の焦点：<strong>{bestLabel}</strong></p>
              {review.secondsSincePrevious !== null && review.secondsSincePrevious <= 5 ? (
                <p className="free-maneuver-point__warning">回復直後の連続操作です。小さな振れを追い過ぎていないか確認します。</p>
              ) : null}
              <button type="button" onClick={() => onJump(review.time)}>このポイントをリプレイ</button>
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
    ? "次の動きを待つ"
    : snapshot.state === "favored"
      ? "細かな振れを追わず維持"
      : `今、${config.leg === "upwind" ? "タック" : "ジャイブ"}する根拠あり`;
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
      <div className="section-kicker">SET SHIFT / 判断窓をつくる</div>
      <h2 id="free-setup-heading">どの振れで返す？</h2>

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
        <strong>1回目だけで終わりません。</strong>
        <p>風が次に反対へ動いたら、もう一度、今の走りが有利かを判断します。リプレイは全操作を残します。</p>
      </div>
      <button type="button" className="primary-action" onClick={onStart}>
        判断点を探しに出る <span aria-hidden="true">→</span>
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
  const replay = useMemo(
    () => runFreeScenario(activeConfig, userManeuverTimes),
    [activeConfig, userManeuverTimes],
  );
  const setupReplay = useMemo(() => runFreeScenario(draftConfig, []), [draftConfig]);
  const baseline = useMemo(() => runFreeScenario(activeConfig, []), [activeConfig]);
  const maneuverReviews = useMemo(
    () => analyzeManeuverPoints(activeConfig, userManeuverTimes),
    [activeConfig, userManeuverTimes],
  );
  const winningRouteAnalysis = useMemo(
    () => phase === "replay" ? analyzeWinningRoute(activeConfig, userManeuverTimes) : null,
    [activeConfig, phase, userManeuverTimes],
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
  const comparisons = useMemo<CourseComparison[]>(
    () => phase === "replay"
      ? [
          { replay: baseline, variant: "no-tack", label: "自艇操作なし" } as CourseComparison,
          ...(winningRouteReplay
            ? [{
                replay: winningRouteReplay,
                variant: "coach" as const,
                label: winningRouteAnalysis?.status === "win-found" ? "勝ち筋の仮想航跡" : "改善案の仮想航跡",
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

  const start = (config = draftConfig, plannedTime = draftPlannedTime) => {
    setActiveConfig({ ...config });
    setActivePlannedTime(plannedTime);
    setTime(0);
    setUserManeuverTimes([]);
    setIsPaused(false);
    setIsReplayPlaying(false);
    setPhase("playing");
  };

  const maneuver = () => {
    const lastTime = userManeuverTimes[userManeuverTimes.length - 1] ?? -10;
    if (time < 1 || time - lastTime < 4) return;
    setUserManeuverTimes((current) => [...current, time]);
  };

  const changeConditions = () => {
    setDraftConfig(activeConfig);
    setDraftPlannedTime(activePlannedTime);
    setTime(0);
    setIsReplayPlaying(false);
    setPhase("setup");
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
          <h1>風が動く。<br />どこで返す？</h1>
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
              <div className="play-clock">
                <strong>{time}</strong><span>秒</span>
                <p>{isPaused ? `停止中。${currentExplanation}` : currentExplanation}</p>
              </div>
              <button type="button" className="pause-action" onClick={() => setIsPaused((current) => !current)}>
                {isPaused ? "再開" : "一時停止"}
              </button>
              <button type="button" className="tack-action" onClick={maneuver} disabled={!canManeuver}>
                <span>今、{maneuverLabel}</span>
                <small>{userManeuverTimes.length}回実行</small>
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
              <h2 id="free-watch-heading">差が動く理由を探す。</h2>
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
              <h2 id="free-replay-heading">何が差をつくった？</h2>
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
              <div className="free-replay-actions">
                <button type="button" className="primary-action" onClick={() => start(activeConfig, activePlannedTime)}>同じ条件でもう一度</button>
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
