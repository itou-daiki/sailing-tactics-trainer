import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RACE_CONFIG,
  getRaceTackLabel,
  runRaceScenario,
  type FirstBeatPlan,
  type RaceActionType,
  type RaceCondition,
  type RaceScenarioConfig,
  type StartEnd,
} from "../domain/raceSimulation";
import {
  getRaceCoachStop,
  getRaceLearningFeedback,
  type RaceCoachStop,
  type RaceLearningFocus,
} from "../domain/raceLearning";
import { RaceCourseBoard } from "./RaceCourseBoard";

type RacePhase = "setup" | "running" | "replay";
type TrainingLevel = "guided" | "challenge";

const TRAINING_LEVELS: Array<{
  value: TrainingLevel;
  label: string;
  sublabel: string;
  description: string;
}> = [
  {
    value: "guided",
    label: "初級｜コーチ付き",
    sublabel: "4艇・基本海面",
    description: "見る順番を3つに絞り、判断する時刻で自動停止します。",
  },
  {
    value: "challenge",
    label: "中級｜自分で組む",
    sublabel: "8艇・3つの海面",
    description: "潮、ブロー、スタート位置、最初に使う海面を自分で決めます。",
  },
];

const COACH_STOPS: Record<RaceCoachStop, { title: string; instruction: string }> = {
  thirty: {
    title: "残り30秒｜時間と距離",
    instruction: "ラインまで何艇身か、潮がどちらへ押すかを声に出します。早ければ減速します。",
  },
  start: {
    title: "スタート｜成立したか",
    instruction: "X旗とバウ位置を確認します。OCSなら、順位より先にライン下へ戻ります。",
  },
  "dirty-air": {
    title: "スタート後｜風が走れるか",
    instruction: "前方2艇身を見ます。乱れた風なら、ベアかタックでクリーンなレーンへ移ります。",
  },
  zone: {
    title: "マーク5艇身前｜ゾーンの準備",
    instruction: "3艇身ゾーンへ入る前に、内・外、オーバーラップ、次のレグを順にコールします。",
  },
};

const REFLECTION_OPTIONS: Array<{ value: RaceLearningFocus; label: string }> = [
  { value: "start", label: "スタートの時間・距離" },
  { value: "lane", label: "乱れた風から抜ける" },
  { value: "shift", label: "振れに合うタック" },
  { value: "rights", label: "権利艇への早い対応" },
  { value: "integrate", label: "2つの情報を同時に確認" },
];

const CONDITIONS: Array<{
  value: RaceCondition;
  title: string;
  weather: string;
  briefing: string;
}> = [
  {
    value: "oscillating",
    title: "振れ＋艇団",
    weather: "9kt｜左右7°｜微弱な横潮",
    briefing: "左右へ戻る風。スタート後は、艇団の乱れた風を抜けながらリフトをつなぎます。",
  },
  {
    value: "current-push",
    title: "上げ潮スタート",
    weather: "8kt｜ライン方向0.2kt｜ピン寄り",
    briefing: "潮がラインへ押します。残り30秒でバウ位置を見直し、OCSを避けて加速します。",
  },
  {
    value: "right-pressure",
    title: "右奥のブロー",
    weather: "10kt｜右へ最大12°｜右奥に濃い風",
    briefing: "右海面のブローが残る想定。スタートの有利端だけでなく、最初に使う海面を優先します。",
  },
];

const START_ENDS: Array<{ value: StartEnd; label: string; call: string }> = [
  { value: "pin", label: "ピン寄り", call: "左のスペース" },
  { value: "middle", label: "中央", call: "両側を残す" },
  { value: "committee", label: "本部艇寄り", call: "右の展開" },
];

const BEAT_PLANS: Array<{ value: FirstBeatPlan; label: string; call: string }> = [
  { value: "left", label: "左海面", call: "スターボードで出る" },
  { value: "middle", label: "中央を保つ", call: "端へ早く行かない" },
  { value: "right", label: "右海面", call: "ポートへ返す" },
];

const formatRaceTime = (time: number) => {
  const sign = time < 0 ? "−" : "+";
  const absolute = Math.abs(time);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
};

const getLiveCall = (
  time: number,
  cleanAir: boolean,
  lineDelta: number,
  markDistance: number,
  isOcsOutstanding: boolean,
) => {
  if (isOcsOutstanding) return "OCS。最短でライン下へ戻り、再スタート。";
  if (time < -30) return "有利端より先に、出たい海面と潮を確認。";
  if (time < 0) {
    if (lineDelta < 0) return "ラインを越えています。下げて戻る。";
    return `ラインまで${lineDelta.toFixed(1)}艇身。時間と距離をセットでコール。`;
  }
  if (markDistance <= 3) return "3艇身ゾーン。内外とオーバーラップを声に出す。";
  if (!cleanAir) return "乱れた風です。2艇身先のクリーンなレーンへ移動します。";
  return "風向、次のクロス、マークへの長いタックを順に確認。";
};

function RaceGlossary() {
  return (
    <details className="race-glossary">
      <summary>用語を確認する</summary>
      <dl>
        <div><dt>ライン</dt><dd>ピンと本部艇を結ぶ、スタートの線。</dd></div>
        <div><dt>OCS</dt><dd>スタート時にラインのコース側へ出ている状態。ライン下へ戻って再スタートする。</dd></div>
        <div><dt>クリーンエア</dt><dd>前の艇に乱されていない、走りやすい風。</dd></div>
        <div><dt>リフト</dt><dd>今のタックのまま、よりマーク方向へ向ける風の振れ。</dd></div>
        <div><dt>3艇身ゾーン</dt><dd>マークから3艇身の範囲。内外とオーバーラップを確認する。</dd></div>
      </dl>
    </details>
  );
}

function RaceSetup({
  config,
  level,
  onChange,
  onLevelChange,
  onStart,
}: {
  config: RaceScenarioConfig;
  level: TrainingLevel;
  onChange: (config: RaceScenarioConfig) => void;
  onLevelChange: (level: TrainingLevel) => void;
  onStart: () => void;
}) {
  const condition = CONDITIONS.find((item) => item.value === config.condition)!;
  return (
    <section className="race-setup" aria-labelledby="race-setup-title">
      <div className="section-kicker">RACE LAB / START → MARK 1</div>
      <h1 id="race-setup-title">スタートから<br />第1上マークまで練習する。</h1>
      <p className="race-setup__lead">
        {level === "guided"
          ? "初めは、ライン、走れる風、マークでの相手関係の3つだけを順に見ます。残り60秒から第1上マークまで、確認する時刻に自動停止しながら走ります。"
          : "実戦で見る主要な情報を一つの海面に置き、残り60秒から第1上マークまでを走ります。ライン、潮、ブロー、権利、クリーンエアを同時に見ます。"}
      </p>

      <fieldset className="race-level-choice">
        <legend>自分に合う練習を選ぶ</legend>
        <div>
          {TRAINING_LEVELS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={level === item.value}
              className={level === item.value ? "is-selected" : ""}
              onClick={() => onLevelChange(item.value)}
            >
              <span>{item.sublabel}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="race-briefing" aria-label="レース委員会からの情報">
        <div className="race-briefing__flag" aria-hidden="true">RC</div>
        <div>
          <span>COURSE BOARD / 本日の海面</span>
          <strong>{condition.title}</strong>
          <p>{condition.weather}</p>
        </div>
        <dl>
          <div><dt>コース</dt><dd>START → MARK 1</dd></div>
          <div><dt>艇団</dt><dd>{config.fleetSize}艇</dd></div>
          <div><dt>ルール表示</dt><dd>RRS 10 / 18</dd></div>
        </dl>
      </div>

      {level === "guided" ? (
        <section className="race-guided-plan" aria-labelledby="guided-plan-title">
          <div className="section-kicker">COACH PLAN / 見る順番</div>
          <h2 id="guided-plan-title">1回に、1つずつ判断する。</h2>
          <ol>
            <li><span>−0:30</span><strong>ラインまで何艇身？</strong></li>
            <li><span>START後</span><strong>前の艇の風？ クリーン？</strong></li>
            <li><span>マーク5艇身前</span><strong>内・外、オーバーラップは？</strong></li>
          </ol>
          <p>この3か所で自動停止します。OCSならスタートでも止まります。声に出してから再開してください。</p>
          <RaceGlossary />
        </section>
      ) : (
        <>
          <fieldset className="race-choice">
            <legend>1　海面を選ぶ</legend>
            <div className="race-condition-list">
              {CONDITIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={item.value === config.condition ? "is-selected" : ""}
                  aria-pressed={item.value === config.condition}
                  onClick={() => onChange({ ...config, condition: item.value })}
                >
                  <strong>{item.title}</strong>
                  <span>{item.weather}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="race-choice">
            <legend>2　スタート位置を決める</legend>
            <div className="race-plan-grid">
              {START_ENDS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={item.value === config.startEnd ? "is-selected" : ""}
                  aria-pressed={item.value === config.startEnd}
                  onClick={() => onChange({ ...config, startEnd: item.value })}
                >
                  <strong>{item.label}</strong><span>{item.call}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="race-choice">
            <legend>3　最初に使う海面を決める</legend>
            <div className="race-plan-grid">
              {BEAT_PLANS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={item.value === config.firstBeatPlan ? "is-selected" : ""}
                  aria-pressed={item.value === config.firstBeatPlan}
                  onClick={() => onChange({ ...config, firstBeatPlan: item.value })}
                >
                  <strong>{item.label}</strong><span>{item.call}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <aside className="race-transfer-note">
        <strong>走る前のコール</strong>
        <p>{condition.briefing}</p>
        <span>「{START_ENDS.find((item) => item.value === config.startEnd)?.label}から出て、{BEAT_PLANS.find((item) => item.value === config.firstBeatPlan)?.label}」</span>
      </aside>

      <button type="button" className="race-start-action" onClick={onStart}>
        {level === "guided" ? "コーチ付き練習を始める" : "レース練習を始める"} <span aria-hidden="true">→</span>
      </button>
      <p className="race-model-note">
        信号時刻・権利表示・3艇身ゾーンはRRS 2025–2028を参照。艇速、ブロー、潮、相手艇AIは判断練習用の簡略モデルで、審問の代わりにはなりません。
      </p>
    </section>
  );
}

function SignalBoard({ time }: { time: number }) {
  const signals = [
    { time: -300, flag: "CLASS", label: "予告" },
    { time: -240, flag: "P", label: "準備" },
    { time: -60, flag: "↓P", label: "1分" },
    { time: 0, flag: "GO", label: "スタート" },
  ];
  return (
    <div className="race-signal-board" aria-label="RRS 26 スタート信号">
      {signals.map((signal) => (
        <div key={signal.time} className={time >= signal.time ? "is-past" : ""}>
          <span>{formatRaceTime(signal.time)}</span>
          <strong>{signal.flag}</strong>
          <small>{signal.label}</small>
        </div>
      ))}
    </div>
  );
}

export function RaceSimulation({ onBack }: { onBack: () => void }) {
  const [level, setLevel] = useState<TrainingLevel>("guided");
  const [config, setConfig] = useState<RaceScenarioConfig>({
    ...DEFAULT_RACE_CONFIG,
    fleetSize: 4,
  });
  const [phase, setPhase] = useState<RacePhase>("setup");
  const [actions, setActions] = useState<Array<{ time: number; type: RaceActionType }>>([]);
  const [time, setTime] = useState(-60);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [activeCoachStop, setActiveCoachStop] = useState<RaceCoachStop | null>(null);
  const [reflection, setReflection] = useState<RaceLearningFocus | null>(null);
  const timeRef = useRef(-60);
  const coachStopsSeenRef = useRef<Set<RaceCoachStop>>(new Set());
  const replay = useMemo(() => runRaceScenario(config, actions), [actions, config]);
  const learningFeedback = useMemo(() => getRaceLearningFeedback(replay), [replay]);
  const firstTime = replay.frames[0]?.time ?? -60;
  const lastTime = replay.frames.at(-1)?.time ?? firstTime;
  const frame = replay.frames.find((item) => item.time === time)
    ?? replay.frames.at(-1)
    ?? replay.frames[0];
  const markDistance = frame ? Math.hypot(frame.user.x - 50, frame.user.y - 125) : 0;

  // React recommends synchronizing timers in an Effect and clearing them in cleanup.
  // Source: https://react.dev/reference/react/useEffect#connecting-to-an-external-system
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (phase !== "running" || paused) return undefined;
    const timer = window.setInterval(() => {
      const current = timeRef.current;
      if (current >= lastTime) {
        window.clearInterval(timer);
        setPhase("replay");
        return;
      }

      const nextTime = Math.min(lastTime, current + 1);
      const nextFrame = replay.frames.find((item) => item.time === nextTime)
        ?? replay.frames.at(-1);
      timeRef.current = nextTime;
      setTime(nextTime);

      if (level !== "guided" || !nextFrame) return;
      const nextMarkDistance = Math.hypot(
        nextFrame.user.x - 50,
        nextFrame.user.y - 125,
      );
      const stop = getRaceCoachStop({
        time: nextTime,
        cleanAir: nextFrame.cleanAir,
        isOcsOutstanding: nextFrame.isOcsOutstanding,
        markDistance: nextMarkDistance,
      });
      if (!stop || coachStopsSeenRef.current.has(stop)) return;

      coachStopsSeenRef.current.add(stop);
      setActiveCoachStop(stop);
      setPaused(true);
      window.clearInterval(timer);
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [lastTime, level, paused, phase, replay.frames, speed]);

  if (phase === "setup") {
    return (
      <div className="race-mode">
        <RaceSetup
          config={config}
          level={level}
          onChange={setConfig}
          onLevelChange={(nextLevel) => {
            setLevel(nextLevel);
            setConfig(nextLevel === "guided"
              ? { ...DEFAULT_RACE_CONFIG, fleetSize: 4 }
              : { ...DEFAULT_RACE_CONFIG, fleetSize: 8 });
          }}
          onStart={() => {
            setActions([]);
            setTime(-60);
            timeRef.current = -60;
            setPaused(false);
            setSpeed(4);
            coachStopsSeenRef.current.clear();
            setActiveCoachStop(null);
            setReflection(null);
            setPhase("running");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    );
  }

  if (!frame) return null;
  const eventToShow = phase === "running"
    ? replay.events.find((event) => event.time > time && event.time >= firstTime)
    : replay.events.filter((event) => event.time <= time).at(-1);
  const raceSeconds = Math.max(1, lastTime + 1);
  const cleanAirPercent = Math.round(replay.cleanAirSeconds / raceSeconds * 100);
  const liftedPercent = Math.round(replay.liftedTackSeconds / raceSeconds * 100);
  const positionsGained = replay.start.rank - replay.finishRank;
  const call = getLiveCall(
    time,
    frame.cleanAir,
    frame.lineDeltaBoatLengths,
    markDistance,
    frame.isOcsOutstanding,
  );

  const recordAction = (type: RaceActionType) => {
    setActions((current) => [...current, { time, type }]);
  };

  return (
    <div className="race-mode race-mode--active">
      <section className="race-live-heading" aria-labelledby="race-live-title">
        <div>
          <div className="section-kicker">RACE LAB / {level === "guided" ? "COACH ON" : "FLEET RACING"}</div>
          <h1 id="race-live-title">スタートから、<br />第1上マークへ。</h1>
        </div>
        <SignalBoard time={time} />
      </section>

      <div className="race-workspace">
        <RaceCourseBoard config={config} frame={frame} replay={replay} />

        <aside className="race-console" aria-label={phase === "running" ? "実戦操作" : "レース振り返り"}>
          <div className="race-console__clock">
            <span>{phase === "running" ? "RACE CLOCK" : "REPLAY"}</span>
            <strong>{formatRaceTime(time)}</strong>
            <small>{getRaceTackLabel(frame.user.tack)}｜風 {frame.windAngle >= 0 ? "右" : "左"}{Math.abs(frame.windAngle).toFixed(0)}°</small>
          </div>
          <p className="race-live-call">{call}</p>

          {activeCoachStop ? (
            <section className="race-coach-stop" aria-live="polite">
              <span>COACH STOP / 今は1つだけ</span>
              <strong>{COACH_STOPS[activeCoachStop].title}</strong>
              <p>{COACH_STOPS[activeCoachStop].instruction}</p>
            </section>
          ) : level === "guided" && phase === "running" ? (
            <p className="race-coach-status">COACH ON｜判断する時刻で自動停止</p>
          ) : null}

          {phase === "running" ? (
            <>
              <div className="race-controls" aria-label="自艇の操作">
                <button type="button" onClick={() => recordAction("slow")}>
                  <strong>減速</strong><span>時間をつくる</span>
                </button>
                <button type="button" className="is-primary" onClick={() => recordAction("accelerate")}>
                  <strong>加速</strong><span>ラインへ出る</span>
                </button>
                {frame.isOcsOutstanding ? (
                  <button type="button" className="is-recall" onClick={() => recordAction("return")}>
                    <strong>ライン下へ戻る</strong><span>OCSを解消</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => recordAction("bear-away")}>
                    <strong>{level === "guided" ? "下る（ベア）" : "ベア"}</strong><span>スペースをつくる</span>
                  </button>
                )}
                <button type="button" className="is-tack" onClick={() => recordAction("tack")}>
                  <strong>タック</strong><span>{actions.filter((item) => item.type === "tack").length}回</span>
                </button>
              </div>
              <div className="race-transport">
                <button type="button" onClick={() => {
                  if (paused) setActiveCoachStop(null);
                  setPaused((current) => !current);
                }}>{paused ? "確認して再開" : "一時停止"}</button>
                <div role="group" aria-label="進行速度">
                  {[2, 4, 8].map((value) => (
                    <button key={value} type="button" aria-pressed={speed === value} className={speed === value ? "is-active" : ""} onClick={() => setSpeed(value)}>{value}×</button>
                  ))}
                </div>
              </div>
              <button type="button" className="text-action" onClick={() => setPhase("setup")}>中止して条件を変える</button>
            </>
          ) : (
            <>
              <label className="race-replay-range">
                <span>時刻を戻して、判断の直前を見る</span>
                <input type="range" min={firstTime} max={lastTime} value={time} onChange={(event) => setTime(Number(event.target.value))} />
              </label>
              <div className="race-replay-events" aria-label="重要な出来事">
                {replay.events.filter((event) => event.time >= firstTime).map((event, index) => (
                  <button key={`${event.time}-${event.kind}-${index}`} type="button" className={event.time === time ? "is-active" : ""} onClick={() => setTime(event.time)}>
                    <span>{formatRaceTime(event.time)}</span>{event.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <dl className="race-live-facts">
            <div><dt>順位</dt><dd>{frame.rank} / {config.fleetSize}</dd></div>
            <div><dt>クリーンエア</dt><dd>{frame.cleanAir ? "確保" : "乱れた風"}</dd></div>
            <div><dt>{phase === "running" ? "次の出来事" : "直近の記録"}</dt><dd>{eventToShow?.label ?? "記録なし"}</dd></div>
          </dl>
          {level === "guided" ? <RaceGlossary /> : null}
        </aside>
      </div>

      {phase === "replay" ? (
        <section className="race-debrief" aria-labelledby="race-debrief-title">
          <div className="section-kicker">RACE REVIEW / レースを振り返る</div>
          <h2 id="race-debrief-title">順位が変わった理由を確認する</h2>
          <div className="race-score-line">
            <div className={replay.start.isOcs ? "is-alert" : ""}>
              <span>START</span>
              <strong>{replay.start.isOcs ? "OCS" : `${replay.start.lineDeltaSeconds.toFixed(1)}秒遅れ`}</strong>
              <small>{replay.start.isOcs
                ? replay.start.ocsCleared ? "戻って再スタート" : "未解消：記録なし"
                : `${replay.start.rank}位で通過`}</small>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>MARK 1</span>
              <strong>{replay.start.isOcs && !replay.start.ocsCleared ? "記録なし" : `${replay.finishRank}位`}</strong>
              <small>{replay.start.isOcs && !replay.start.ocsCleared
                ? "ライン下へ戻っていない"
                : replay.start.isOcs
                  ? "再スタート後の到達順位"
                : positionsGained > 0 ? `${positionsGained}艇抜いた` : positionsGained < 0 ? `${Math.abs(positionsGained)}艇失った` : "順位維持"}</small>
            </div>
          </div>
          <fieldset className="race-reflection">
            <legend>自分では、次にどこを直す？</legend>
            <p>数値を見る前に1つ選びます。選んだあと、レース記録と照らし合わせます。</p>
            <div className="race-reflection__options">
              {REFLECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={reflection === option.value}
                  className={reflection === option.value ? "is-selected" : ""}
                  onClick={() => setReflection(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {reflection ? (
              <aside className="race-next-focus" aria-live="polite">
                <span>{reflection === learningFeedback.focus ? "自己評価と記録が一致" : "記録と異なる項目を確認"}</span>
                <strong>{learningFeedback.headline}</strong>
                <p>{learningFeedback.evidence}</p>
                <div><b>次の1走</b>{learningFeedback.nextAction}</div>
              </aside>
            ) : null}
          </fieldset>
          <div className="race-metrics">
            <div><span>きれいな風で走れた</span><strong>{cleanAirPercent}%</strong><small>前に艇がいない時間</small></div>
            <div><span>リフト側を走れた</span><strong>{liftedPercent}%</strong><small>振れに対して有利なタック</small></div>
            <div><span>権利リスク</span><strong>{replay.ruleRiskCount}回</strong><small>ポート対スターボード</small></div>
          </div>
          <div className="race-water-transfer">
            <strong>次の水上練習で確認する3項目</strong>
            <ol>
              <li><span>残り30秒</span>「ラインまで何艇身、潮はどちら」</li>
              <li><span>スタート後</span>「前の艇の風か、クリーンか」</li>
              <li><span>マーク5艇身前</span>「内外、オーバーラップ、次のレグ」</li>
            </ol>
          </div>
          <div className="race-end-actions">
            <button type="button" onClick={() => {
              setActions([]);
              setTime(-60);
              timeRef.current = -60;
              setPaused(false);
              coachStopsSeenRef.current.clear();
              setActiveCoachStop(null);
              setReflection(null);
              setPhase("running");
            }}>{reflection ? `${learningFeedback.label}をもう一度` : "同じ海面でもう一度"}</button>
            <button type="button" onClick={() => {
              setReflection(null);
              setPhase("setup");
            }}>{level === "guided" ? "中級へ進む／条件を変える" : "条件を変える"}</button>
            <button type="button" onClick={onBack}>コース一覧へ</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
