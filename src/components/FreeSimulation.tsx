import { useEffect, useMemo, useState } from "react";
import { CourseBoard, type CourseComparison } from "./CourseBoard";
import { BOAT_LENGTH_PX } from "../domain/simulation";
import {
  DEFAULT_FREE_CONFIG,
  FREE_SCENARIO_DURATION,
  runFreeScenario,
  type CourseLeg,
  type FreeScenarioConfig,
  type OpponentMode,
  type WindPattern,
} from "../domain/freeSimulation";

type FreePhase = "setup" | "playing" | "replay";

const WIND_PATTERNS: Array<{ value: WindPattern; label: string; note: string }> = [
  { value: "return", label: "平均へ戻る", note: "暫定ゲインが消える過程を見る" },
  { value: "hold", label: "振れたまま", note: "パーシステントシフトを試す" },
  { value: "return-past", label: "反対まで戻る", note: "有利側が逆転する場面を見る" },
];

const OPPONENT_MODES: Array<{ value: OpponentMode; label: string; note: string }> = [
  { value: "hold", label: "そのまま走る", note: "自艇の判断だけを比べる" },
  { value: "fixed", label: "18秒で反応", note: "決まったタイミングで操作する" },
  { value: "cover", label: "2秒後にカバー", note: "あなたの動きへ追従する" },
];

const LEG_OPTIONS: Array<{ value: CourseLeg; label: string; action: string }> = [
  { value: "upwind", label: "上り", action: "タック" },
  { value: "downwind", label: "下り", action: "ジャイブ" },
];

const getShiftLabel = (angle: number) => {
  if (angle === 0) return "振れなし 0°";
  return `${angle > 0 ? "右" : "左"}${Math.abs(angle)}°`;
};

const getPatternLabel = (pattern: WindPattern) =>
  WIND_PATTERNS.find((option) => option.value === pattern)?.label ?? "平均へ戻る";

const getOpponentLabel = (mode: OpponentMode) =>
  OPPONENT_MODES.find((option) => option.value === mode)?.label ?? "そのまま走る";

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
) => {
  const side = config.shiftAngle < 0 ? "左" : config.shiftAngle > 0 ? "右" : "左右どちらにも";
  const action = config.leg === "upwind" ? "タック" : "ジャイブ";
  if (time <= 4) {
    return `まず${config.leverageBoatLengths}艇身の横の距離を確認。風が振れる前は、2艇の前後差はほぼありません。`;
  }
  if (time < 10) {
    if (config.shiftAngle === 0) {
      return "風向は平均のままです。風の助けがないとき、操作による艇速ロスが差へどう表れるかを見ます。";
    }
    return `${side}へ風が振れています。相手との差が${relativeGain >= 0 ? "プラス" : "マイナス"}へ動く速さを見ます。`;
  }
  if (time <= 16) {
    return `振れは最大付近です。${action}するなら、艇速ロスと相手とのクロスを同時に見ます。`;
  }
  if (config.windPattern === "hold") {
    return `風は振れた位置に留まっています。${maneuverCount > 0 ? "操作後の位置関係" : "横の距離による差"}が残るか確認します。`;
  }
  if (time < 30) {
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
  const points = windAngles
    .map((value, index) => `${(index / FREE_SCENARIO_DURATION) * 100},${24 - value * 1.05}`)
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
          <line className="free-wind-cursor" x1={(time / FREE_SCENARIO_DURATION) * 100} y1="2" x2={(time / FREE_SCENARIO_DURATION) * 100} y2="46" />
        </svg>
      </div>
      <dl className="free-wind-strip__facts">
        <div><dt>レグ</dt><dd>{config.leg === "upwind" ? "上り" : "下り"}</dd></div>
        <div><dt>横の距離</dt><dd>{config.leverageBoatLengths}艇身</dd></div>
        <div><dt>相手</dt><dd>{getOpponentLabel(config.opponentMode)}</dd></div>
      </dl>
    </section>
  );
}

function FreeSetup({
  config,
  onChange,
  onStart,
}: {
  config: FreeScenarioConfig;
  onChange: (config: FreeScenarioConfig) => void;
  onStart: () => void;
}) {
  return (
    <section className="free-setup" aria-labelledby="free-setup-heading">
      <div className="section-kicker">SET SEA / 海面をつくる</div>
      <h2 id="free-setup-heading">何を変えて試す？</h2>

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
        <legend>3　その後の風</legend>
        <ChoiceButtons
          name="その後の風"
          options={WIND_PATTERNS}
          value={config.windPattern}
          onChange={(windPattern) => onChange({ ...config, windPattern })}
        />
      </fieldset>

      <fieldset className="free-control-group">
        <legend>4　最初の横の距離</legend>
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
        <legend>5　相手の動き</legend>
        <ChoiceButtons
          name="相手の動き"
          options={OPPONENT_MODES}
          value={config.opponentMode}
          onChange={(opponentMode) => onChange({ ...config, opponentMode })}
        />
      </fieldset>

      <div className="free-start-note">
        <strong>正解は表示しません。</strong>
        <p>条件を1つずつ変え、「なぜ差が変わったか」を操作なしの航跡と比べます。</p>
      </div>
      <button type="button" className="primary-action" onClick={onStart}>
        この海面で走る <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}

export function FreeSimulation({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<FreePhase>("setup");
  const [draftConfig, setDraftConfig] = useState<FreeScenarioConfig>(DEFAULT_FREE_CONFIG);
  const [activeConfig, setActiveConfig] = useState<FreeScenarioConfig>(DEFAULT_FREE_CONFIG);
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [userManeuverTimes, setUserManeuverTimes] = useState<number[]>([]);
  const replay = useMemo(
    () => runFreeScenario(activeConfig, userManeuverTimes),
    [activeConfig, userManeuverTimes],
  );
  const setupReplay = useMemo(() => runFreeScenario(draftConfig, []), [draftConfig]);
  const baseline = useMemo(() => runFreeScenario(activeConfig, []), [activeConfig]);
  const comparisons = useMemo<CourseComparison[]>(
    () => phase === "replay" ? [{ replay: baseline, variant: "no-tack", label: "自艇操作なし" }] : [],
    [baseline, phase],
  );

  useEffect(() => {
    if (phase !== "playing" || isPaused) return;
    if (time >= FREE_SCENARIO_DURATION) {
      setPhase("replay");
      return;
    }
    const timer = window.setTimeout(() => setTime((current) => current + 1), 720);
    return () => window.clearTimeout(timer);
  }, [isPaused, phase, time]);

  const start = (config = draftConfig) => {
    setActiveConfig({ ...config });
    setTime(0);
    setUserManeuverTimes([]);
    setIsPaused(false);
    setPhase("playing");
  };

  const maneuver = () => {
    const lastTime = userManeuverTimes[userManeuverTimes.length - 1] ?? -10;
    if (time < 1 || time - lastTime < 4) return;
    setUserManeuverTimes((current) => [...current, time]);
  };

  const finish = () => {
    setTime(FREE_SCENARIO_DURATION);
    setIsPaused(false);
    setPhase("replay");
  };

  const changeConditions = () => {
    setDraftConfig(activeConfig);
    setTime(0);
    setPhase("setup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const displayConfig = phase === "setup" ? draftConfig : activeConfig;
  const displayReplay = phase === "setup" ? setupReplay : replay;
  const displayTime = phase === "setup" ? 0 : time;
  const currentFrame = displayReplay.frames[displayTime];
  const gain = currentFrame.relativeGain / BOAT_LENGTH_PX;
  const choiceGain = replay.finalRelativeGain - baseline.finalRelativeGain;
  const maneuverLabel = activeConfig.leg === "upwind" ? "タック" : "ジャイブ";
  const lastManeuverTime = userManeuverTimes[userManeuverTimes.length - 1] ?? -10;
  const canManeuver = phase === "playing" && time >= 1 && time - lastManeuverTime >= 4;
  const windAngles = displayReplay.frames.map((frame) => frame.windAngle);

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
                <p>{isPaused ? "停止中。風向と相手との差を確認できます。" : getExplanation(time, activeConfig, gain, userManeuverTimes.length)}</p>
              </div>
              <button type="button" className="pause-action" onClick={() => setIsPaused((current) => !current)}>
                {isPaused ? "再開" : "一時停止"}
              </button>
              <button type="button" className="tack-action" onClick={maneuver} disabled={!canManeuver}>
                <span>今、{maneuverLabel}</span>
                <small>{userManeuverTimes.length}回実行</small>
              </button>
              <button type="button" className="text-action" onClick={finish}>リプレイへ進む</button>
            </div>
          ) : null}
        </div>

        <aside className="free-workspace__controls">
          {phase === "setup" ? (
            <FreeSetup config={draftConfig} onChange={setDraftConfig} onStart={() => start()} />
          ) : null}

          {phase === "playing" ? (
            <section className="free-watch" aria-labelledby="free-watch-heading">
              <div className="section-kicker">OBSERVE / 比べる</div>
              <h2 id="free-watch-heading">差が動く理由を探す。</h2>
              <p>{getExplanation(time, activeConfig, gain, userManeuverTimes.length)}</p>
              <dl className="free-live-data">
                <div><dt>相手との差</dt><dd>{gain >= 0 ? "+" : ""}{gain.toFixed(1)}艇身</dd></div>
                <div><dt>現在の横距離</dt><dd>{(currentFrame.leverage / BOAT_LENGTH_PX).toFixed(1)}艇身</dd></div>
                <div><dt>操作回数</dt><dd>{userManeuverTimes.length}回</dd></div>
                <div><dt>相手の操作</dt><dd>{replay.opponentManeuverTimes.filter((eventTime) => eventTime <= time).length}回</dd></div>
              </dl>
              <button type="button" className="secondary-action free-reset-action" onClick={() => start(activeConfig)}>
                同じ条件で最初から
              </button>
            </section>
          ) : null}

          {phase === "replay" ? (
            <section className="free-replay" aria-labelledby="free-replay-heading">
              <div className="section-kicker">COMPARE / 操作なしと比べる</div>
              <h2 id="free-replay-heading">何が差をつくった？</h2>
              <div className="free-result-number">
                <span>自艇操作なしとの差</span>
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
                    ? `今回の${maneuverLabel}により、自艇を操作しない場合より前で終えました。艇速ロスを払っても残ったゲインです。`
                    : `今回の${maneuverLabel}では、自艇を操作しない場合より後ろで終えました。風の戻りと艇速ロスを時間軸で確認します。`}
              </p>

              <input
                className="timeline-slider"
                type="range"
                min="0"
                max={FREE_SCENARIO_DURATION}
                step="1"
                value={time}
                aria-label="フリーシミュレーションのリプレイ時刻"
                onChange={(event) => setTime(Number(event.target.value))}
              />
              <div className="event-strip" aria-label="重要な出来事">
                {replay.events.map((event, index) => (
                  <button
                    key={`${event.kind}-${event.time}-${index}`}
                    type="button"
                    className={time === event.time ? "event-chip event-chip--active" : "event-chip"}
                    onClick={() => setTime(event.time)}
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
                <p>{getExplanation(time, activeConfig, gain, userManeuverTimes.length)}</p>
              </div>
              <div className="free-replay-actions">
                <button type="button" className="primary-action" onClick={() => start(activeConfig)}>同じ条件でもう一度</button>
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
