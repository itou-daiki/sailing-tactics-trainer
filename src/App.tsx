import { useEffect, useMemo, useState } from "react";
import { CourseBoard } from "./components/CourseBoard";
import { ReplayPanel } from "./components/ReplayPanel";
import { WindStrip } from "./components/WindStrip";
import {
  COACH_TACK_TIME,
  runScenario,
  SCENARIO_DURATION,
  type ScenarioReplay,
} from "./domain/simulation";

type Phase = "briefing" | "playing" | "replay";

const getPlayPrompt = (time: number, hasTacked: boolean) => {
  if (hasTacked) return "タック完了。風が戻るまで、相手との差を見てください。";
  if (time < 4) return "まずは横の距離と、相手の位置を確認。";
  if (time < 10) return "右へ振れています。タックする？ もう少し見る？";
  if (time <= 16) return "右振れは最大付近。クロスできる時間は残っている？";
  return "風が戻り始めました。暫定ゲインはどうなる？";
};

function ResultSummary({ replay, onRetry }: { replay: ScenarioReplay; onRetry: () => void }) {
  const finalGain = replay.finalRelativeGain;
  return (
    <section className="result-summary" aria-labelledby="result-heading">
      <div className="result-stamp">
        <span>判断</span>
        <strong>{replay.decision.score}</strong>
        <small>/ 100</small>
      </div>
      <div className="result-copy">
        <div className="section-kicker">COACH CHECK / 判断と結果を分ける</div>
        <h2 id="result-heading">{replay.decision.rating}</h2>
        <p>{replay.decision.summary}</p>
      </div>

      <dl className="result-breakdown">
        <div>
          <dt>あなたのタック</dt>
          <dd>{replay.userTackTime === null ? "なし" : `${replay.userTackTime}秒`}</dd>
        </div>
        <div>
          <dt>コーチ例</dt>
          <dd>{COACH_TACK_TIME}秒</dd>
        </div>
        <div>
          <dt>タック中のロス</dt>
          <dd>−{replay.userManeuverLoss.toFixed(1)}艇身</dd>
        </div>
        <div>
          <dt>風が戻った後の差</dt>
          <dd className={finalGain >= 0 ? "gain-positive" : "gain-negative"}>
            {finalGain >= 0 ? "+" : ""}{finalGain.toFixed(1)}艇身
          </dd>
        </div>
      </dl>

      <div className="next-try">
        <span>次に試すこと</span>
        <p>{replay.decision.nextTry}</p>
      </div>
      <button type="button" className="secondary-action" onClick={onRetry}>もう一度やる</button>
    </section>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("briefing");
  const [time, setTime] = useState(0);
  const [userTackTime, setUserTackTime] = useState<number | null>(null);
  const [didChooseTack, setDidChooseTack] = useState(false);
  const replay = useMemo(() => runScenario(didChooseTack ? userTackTime : null), [didChooseTack, userTackTime]);
  const coachReplay = useMemo(() => runScenario(COACH_TACK_TIME), []);
  const noTackReplay = useMemo(() => runScenario(null), []);

  useEffect(() => {
    if (phase !== "playing") return;
    if (time >= SCENARIO_DURATION) {
      setPhase("replay");
      return;
    }

    const timer = window.setTimeout(() => setTime((current) => current + 1), 720);
    return () => window.clearTimeout(timer);
  }, [phase, time]);

  const start = () => {
    setTime(0);
    setUserTackTime(null);
    setDidChooseTack(false);
    setPhase("playing");
  };

  const tack = () => {
    if (didChooseTack) return;
    setUserTackTime(time);
    setDidChooseTack(true);
  };

  const finishNow = () => {
    setTime(SCENARIO_DURATION);
    setPhase("replay");
  };

  const currentFrame = replay.frames[time];

  return (
    <main className={`app app--${phase}`}>
      <header className="site-header">
        <a className="brand" href="./" aria-label="SHIFT 420 TACTICS ホーム">
          <span className="brand__signal" aria-hidden="true" />
          <strong>SHIFT</strong>
          <small>420 TACTICS</small>
        </a>
        <div className="lesson-number">
          <span>LESSON</span>
          <strong>01</strong>
        </div>
      </header>

      <div className="lesson-heading">
        <div>
          <div className="section-kicker">OSCILLATING WIND / 振れ戻る風</div>
          <h1>右振れを、<br className="mobile-break" />クロスに変える。</h1>
        </div>
        <p>同じ速さの420が2艇。風が戻る前に、相手より前へ出るタックを考えます。</p>
      </div>

      <WindStrip time={time} />

      <div className="workspace">
        <div className="workspace__course">
          <CourseBoard
            frame={currentFrame}
            replay={replay}
            coachReplay={coachReplay}
            noTackReplay={noTackReplay}
            showGhosts={phase === "replay"}
          />

          {phase === "playing" ? (
            <div className="action-dock">
              <div className="play-clock">
                <strong>{time}</strong><span>秒</span>
                <p>{getPlayPrompt(time, didChooseTack)}</p>
              </div>
              <button
                type="button"
                className="tack-action"
                onClick={tack}
                disabled={didChooseTack}
              >
                <span>{didChooseTack ? "タック済み" : "今、タック"}</span>
                <small>{didChooseTack ? `${userTackTime}秒で実行` : "TACK NOW"}</small>
              </button>
              <button type="button" className="text-action" onClick={finishNow}>リプレイへ進む</button>
            </div>
          ) : null}
        </div>

        <aside className="workspace__lesson">
          {phase === "briefing" ? (
            <section className="briefing" aria-labelledby="briefing-heading">
              <div className="section-kicker">MISSION / 今回の課題</div>
              <h2 id="briefing-heading">いつタックすれば、相手をクロスできる？</h2>
              <p className="briefing__lead">風は右へ10°振れたあと、平均風向へ戻ります。未来の風は、プレイ中には見えません。</p>
              <button type="button" className="primary-action" onClick={start}>
                練習を始める <span aria-hidden="true">→</span>
              </button>
              <dl className="known-facts">
                <div><dt>艇</dt><dd>同じ速さの420</dd></div>
                <div><dt>横の距離</dt><dd>12艇身</dd></div>
                <div><dt>操作</dt><dd>タックは1回</dd></div>
                <div><dt>目標</dt><dd>相手より前をクロス</dd></div>
              </dl>
              <div className="plain-word-note">
                <strong>クロスとは？</strong>
                <p>反対タックの相手と交差するとき、相手より前を通ることです。</p>
              </div>
            </section>
          ) : null}

          {phase === "playing" ? (
            <section className="watch-list" aria-labelledby="watch-heading">
              <div className="section-kicker">LOOK / 見るポイント</div>
              <h2 id="watch-heading">風だけでなく、相手も見る。</h2>
              <ol>
                <li><span>1</span><p><strong>風向</strong>右への振れは大きくなっている？</p></li>
                <li><span>2</span><p><strong>横の距離</strong>離れているほど、振れの影響は大きい。</p></li>
                <li><span>3</span><p><strong>クロス</strong>今タックしたら、相手の前を通れる？</p></li>
              </ol>
            </section>
          ) : null}

          {phase === "replay" ? (
            <ReplayPanel replay={replay} time={time} onTimeChange={setTime} />
          ) : null}
        </aside>
      </div>

      {phase === "replay" ? <ResultSummary replay={replay} onRetry={start} /> : null}

      <footer className="site-footer">
        <p>420教育用モデル v0.1　｜　1艇身 = 4.2m</p>
        <p>判断の練習用です。実際の海面では波・潮・艇速差も考えます。</p>
      </footer>
    </main>
  );
}
