import { useEffect, useMemo, useState } from "react";
import { CourseBoard, type CourseComparison } from "./CourseBoard";
import { BOAT_LENGTH_PX } from "../domain/simulation";
import {
  DEFAULT_FREE_CONFIG,
  analyzeFirstManeuverTiming,
  evaluateManeuverPlan,
  getFreeWindTimeline,
  getRelativeGainDifferenceAtCommonTime,
  parseFreeScenarioConfig,
  runFreeScenario,
  serializeFreeScenarioConfig,
  type CourseLeg,
  type FreeScenarioConfig,
  type OpponentMode,
  type TimingAnalysis,
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
  { value: "hold", label: "レイライン判断", note: "ミートならタック、前ならベア" },
  { value: "fixed", label: "18秒で先に返す", note: "その後もレイラインを守る" },
  { value: "cover", label: "2秒後にカバー", note: "追従後もレイラインを守る" },
];

const LEG_OPTIONS: Array<{ value: CourseLeg; label: string; action: string }> = [
  { value: "upwind", label: "上り", action: "タック" },
  { value: "downwind", label: "下り", action: "ジャイブ" },
];

const FREE_DRILL_PRESETS: FreeDrillPreset[] = [
  {
    id: "oscillating-return",
    label: "振れ戻りを待つ",
    focus: "暫定ゲインが消え始める合図を探す",
    tag: "上り・振れ戻り",
    config: {
      leg: "upwind",
      shiftAngle: 12,
      windPattern: "return",
      windTempo: "standard",
      leverageBoatLengths: 14,
      opponentMode: "hold",
    },
    planCue: "returnStart",
  },
  {
    id: "persistent-shift",
    label: "振れが残る海面",
    focus: "戻る風と戻らない風で判断を分ける",
    tag: "上り・パーシステント",
    config: {
      leg: "upwind",
      shiftAngle: -12,
      windPattern: "hold",
      windTempo: "quick",
      leverageBoatLengths: 12,
      opponentMode: "hold",
    },
    planCue: "peak",
  },
  {
    id: "cover-response",
    label: "カバーとの間合い",
    focus: "相手が2秒後に追うときの差を見る",
    tag: "上り・2艇比較",
    config: {
      leg: "upwind",
      shiftAngle: 8,
      windPattern: "return",
      windTempo: "slow",
      leverageBoatLengths: 8,
      opponentMode: "cover",
    },
    planCue: "peak",
  },
  {
    id: "downwind-reversal",
    label: "下りの有利側逆転",
    focus: "平均を越す振れ戻りでジャイブを比べる",
    tag: "下り・ジャイブ",
    config: {
      leg: "downwind",
      shiftAngle: -14,
      windPattern: "return-past",
      windTempo: "standard",
      leverageBoatLengths: 16,
      opponentMode: "hold",
    },
    planCue: "returnStart",
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
  WIND_PATTERNS.find((option) => option.value === pattern)?.label ?? "平均へ戻る";

const getOpponentLabel = (mode: OpponentMode) =>
  OPPONENT_MODES.find((option) => option.value === mode)?.label ?? "レイライン判断";

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
) => {
  const side = config.shiftAngle < 0 ? "左" : config.shiftAngle > 0 ? "右" : "左右どちらにも";
  const action = config.leg === "upwind" ? "タック" : "ジャイブ";
  const timeline = getFreeWindTimeline(config);
  if (opponentTackedAtMeeting) {
    return "まだレイライン前です。自艇が後ろなので、相手はミート前にタックしてレイライン側へ返します。";
  }
  if (opponentIsAvoiding) {
    return `自艇はスターボードで、前後のゲインもあります。相手は前へタックできないため、${config.leg === "upwind" ? "ベアして" : "さらに下って"}自艇の後ろを通ります。`;
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
  const cues = [
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
      <h3>最初の{maneuverLabel}を、何秒に予定する？</h3>
      <p>正解当てではありません。先に予定を置くと、風や相手を見て変えた判断をリプレイで説明できます。</p>
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

function TimingLab({
  analysis,
  maneuverLabel,
}: {
  analysis: TimingAnalysis;
  maneuverLabel: string;
}) {
  const currentTrial = analysis.trials.find((trial) => trial.offset === 0)!;
  const bestTrial = analysis.trials.find((trial) => trial.offset === analysis.bestOffset)!;
  const advice = analysis.bestOffset === 0
    ? `前後4秒にずらした試走の中では、今回の${currentTrial.maneuverTime}秒が最もよい結果でした。`
    : analysis.bestOffset < 0
      ? `この3試走では、${bestTrial.maneuverTime}秒まで${maneuverLabel}を早めると結果が改善しました。`
      : `この3試走では、${bestTrial.maneuverTime}秒まで待ってから${maneuverLabel}すると結果が改善しました。`;
  const multipleManeuverNote = currentTrial.maneuverTimes.length > 1
    ? " 2回目以降も操作間隔を保ったまま、全体を4秒ずらしています。"
    : "";

  return (
    <section className="free-timing-lab" aria-labelledby="free-timing-heading">
      <div className="section-kicker">TIMING LAB / 前後4秒を比べる</div>
      <h3 id="free-timing-heading">最初の{maneuverLabel}は適切だった？</h3>
      <p>{advice} マーク到達を優先し、外した場合はマークまでの距離、到達した場合は到達秒、その後に相手との差を比べています。{multipleManeuverNote}</p>
      <div className="free-timing-ruler" role="table" aria-label={`${maneuverLabel}時刻の比較`}>
        {analysis.trials.map((trial) => (
          <div
            key={trial.offset}
            className={`free-timing-trial${trial.offset === 0 ? " is-current" : ""}${trial.offset === analysis.bestOffset ? " is-best" : ""}`}
            role="row"
          >
            <span role="cell">
              <small>{trial.offset === 0 ? "今回" : trial.offset < 0 ? "4秒早く" : "4秒遅く"}</small>
              <strong>{trial.maneuverTime}秒</strong>
            </span>
            <span role="cell">
              <small>マーク</small>
              <strong>{getMarkResultLabel(trial.markResult)}</strong>
              <em>{trial.markResult === "reached" ? `${trial.endTime}秒` : `残り${trial.markDistance.toFixed(1)}艇身`}</em>
            </span>
            <span role="cell">
              <small>終了時の差</small>
              <strong>{formatBoatDifference(trial.relativeGain)}</strong>
            </span>
            <span role="cell" className="free-timing-trial__best" aria-label={trial.offset === analysis.bestOffset ? "3試走の中で最良" : undefined}>
              {trial.offset === analysis.bestOffset ? "BEST" : ""}
            </span>
          </div>
        ))}
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
      <div className="section-kicker">SET SEA / 海面をつくる</div>
      <h2 id="free-setup-heading">今日、何を見分ける？</h2>

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
        <legend>4　その後の風</legend>
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
          共通動作：レイライン前のミートでは、相手はまずタックしてレイライン側へ返します。ただし、自艇が前にいるときはベアして後ろを通ります。ミートがなければレイラインで返します。
        </p>
      </fieldset>

      <ManeuverPlan
        config={config}
        plannedTime={plannedTime}
        onChange={onPlanTimeChange}
      />

      <ShareScenario config={config} loadedFromSharedLink={loadedFromSharedLink} />

      <div className="free-start-note">
        <strong>正解の秒数は表示しません。</strong>
        <p>予定と実行が違っても失敗ではありません。「何を見て変えたか」を操作なしの航跡と比べます。</p>
      </div>
      <button type="button" className="primary-action" onClick={onStart}>
        この海面で走る <span aria-hidden="true">→</span>
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
  const timingAnalysis = useMemo(
    () => analyzeFirstManeuverTiming(activeConfig, userManeuverTimes),
    [activeConfig, userManeuverTimes],
  );
  const bestTimingReplay = useMemo(() => {
    if (!timingAnalysis || timingAnalysis.bestOffset === 0) return null;
    const bestTrial = timingAnalysis.trials.find((trial) => trial.offset === timingAnalysis.bestOffset)!;
    return runFreeScenario(activeConfig, bestTrial.maneuverTimes);
  }, [activeConfig, timingAnalysis]);
  const comparisons = useMemo<CourseComparison[]>(
    () => phase === "replay"
      ? [
          { replay: baseline, variant: "no-tack", label: "自艇操作なし" } as CourseComparison,
          ...(bestTimingReplay
            ? [{
                replay: bestTimingReplay,
                variant: "coach" as const,
                label: timingAnalysis?.bestOffset === -4 ? "4秒早い試走" : "4秒遅い試走",
              }]
            : []),
        ]
      : [],
    [baseline, bestTimingReplay, phase, timingAnalysis?.bestOffset],
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
  const currentExplanation = getExplanation(
    displayTime,
    displayConfig,
    gain,
    userManeuverTimes.length,
    opponentIsAvoiding,
    opponentTackedAtMeeting,
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
          <div className="section-kicker">OPEN WATER / FREE SAIL</div>
          <h1>海面を、<br />自分でつくる。</h1>
        </div>
        <p>風と相手の条件を変え、タックやジャイブを何度でも試します。点数ではなく、操作なしとの差から考えます。</p>
      </section>

      <FreeWindStrip config={displayConfig} time={displayTime} windAngles={windAngles} />

      <div className="free-workspace">
        <div className="free-workspace__course">
          <CourseBoard
            frame={currentFrame}
            replay={displayReplay}
            comparisons={comparisons}
            leg={displayConfig.leg}
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
                aria-label="フリーシミュレーションのリプレイ時刻"
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
              <dl className="free-live-data free-live-data--replay">
                <div><dt>現在の差</dt><dd>{formatBoatDifference(gain)}</dd></div>
                <div><dt>最も有利</dt><dd>{formatBoatDifference(replay.maxRelativeGain)}</dd></div>
                <div><dt>最も不利</dt><dd>{formatBoatDifference(replay.minRelativeGain)}</dd></div>
                <div><dt>{maneuverLabel}の艇速ロス</dt><dd>{formatManeuverLoss(replay.userManeuverLoss)}</dd></div>
              </dl>
              <div className="coach-note free-coach-note">
                <span className="coach-note__tape">この時点</span>
                <p>{currentExplanation}</p>
              </div>
              {timingAnalysis ? (
                <TimingLab analysis={timingAnalysis} maneuverLabel={maneuverLabel} />
              ) : null}
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
