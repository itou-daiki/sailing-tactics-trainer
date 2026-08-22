import { useEffect, useMemo, useState } from "react";
import { CourseBoard } from "./CourseBoard";
import { DiagnosticQuestion, type DiagnosticResponse } from "./DiagnosticQuestion";
import { ReplayPanel } from "./ReplayPanel";
import { WindStrip } from "./WindStrip";
import {
  COACH_TACK_TIME,
  runScenario,
  SCENARIO_DURATION,
  type ScenarioReplay,
} from "../domain/simulation";
import {
  LESSON_BY_ID,
  type Confidence,
  type LessonDefinition,
  type LessonId,
} from "../domain/lessons";

type Phase = "predict" | "playing" | "replay";

const getPlayPrompt = (time: number, hasTacked: boolean) => {
  if (hasTacked) return "タック完了。風が戻るまで、相手との差を見てください。";
  if (time < 4) return "まずは横の距離と、相手の位置を確認。";
  if (time < 10) return "右へ振れています。タックする？ もう少し見る？";
  if (time <= 16) return "右振れは最大付近。クロスできる時間は残っている？";
  return "風が戻り始めました。暫定ゲインはどうなる？";
};

function ResultSummary({
  replay,
  prediction,
  overallScore,
  onRetry,
  onOpenLesson,
  onBack,
}: {
  replay: ScenarioReplay;
  prediction: DiagnosticResponse;
  overallScore: number;
  onRetry: () => void;
  onOpenLesson: (lessonId: LessonId) => void;
  onBack: () => void;
}) {
  const [shareLabel, setShareLabel] = useState("結果を共有");
  const finalGain = replay.finalRelativeGain;
  const recommendedId: LessonId = prediction.evaluation.diagnosis
    ? "ladder-rungs"
    : replay.decision.score < 70
      ? "shift-cross"
      : "shift-return";
  const recommended = LESSON_BY_ID.get(recommendedId)!;

  const share = async () => {
    const shareData = {
      title: "SHIFT｜420 TACTICS",
      text: `420戦術トレーニング「振れをクロスに変える」判断スコア ${overallScore}/100`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareLabel("共有しました");
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        setShareLabel("リンクをコピーしました");
      }
    } catch {
      setShareLabel("共有を中止しました");
    }
  };

  return (
    <section className="result-summary" aria-labelledby="result-heading">
      <div className="result-stamp">
        <span>総合判断</span>
        <strong>{overallScore}</strong>
        <small>/ 100</small>
      </div>
      <div className="result-copy">
        <div className="section-kicker">COACH CHECK / 判断と結果を分ける</div>
        <h2 id="result-heading">{replay.decision.rating}</h2>
        <p>{replay.decision.summary}</p>
      </div>

      <dl className="result-breakdown">
        <div>
          <dt>事前の予想</dt>
          <dd className={prediction.evaluation.correct ? "gain-positive" : "gain-negative"}>
            {prediction.evaluation.correct ? "考え方が一致" : "要復習"}
          </dd>
        </div>
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

      {prediction.evaluation.showScaffold ? (
        <div className="prediction-review">
          <strong>予想から見えたこと</strong>
          <p>{prediction.evaluation.feedback}</p>
        </div>
      ) : null}

      <div className="next-try">
        <span>次におすすめ</span>
        <p>{recommended.number.toString().padStart(2, "0")}　{recommended.shortTitle}</p>
        <small>{recommended.objective}</small>
      </div>

      <div className="result-actions">
        {recommendedId === "shift-cross" ? (
          <button type="button" className="primary-action" onClick={onRetry}>同じ海面でもう一度</button>
        ) : (
          <button type="button" className="primary-action" onClick={() => onOpenLesson(recommendedId)}>
            おすすめへ進む <span aria-hidden="true">→</span>
          </button>
        )}
        <button type="button" className="secondary-action" onClick={share}>{shareLabel}</button>
        <button type="button" className="text-action" onClick={onBack}>コース一覧へ</button>
      </div>
    </section>
  );
}

export function SimulationLesson({
  lesson,
  onRecord,
  onOpenLesson,
  onBack,
}: {
  lesson: LessonDefinition;
  onRecord: (lessonId: LessonId, score: number, confidence: Confidence, diagnosis?: string) => void;
  onOpenLesson: (lessonId: LessonId) => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("predict");
  const [time, setTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [userTackTime, setUserTackTime] = useState<number | null>(null);
  const [didChooseTack, setDidChooseTack] = useState(false);
  const [prediction, setPrediction] = useState<DiagnosticResponse | null>(null);
  const [recorded, setRecorded] = useState(false);
  const replay = useMemo(() => runScenario(didChooseTack ? userTackTime : null), [didChooseTack, userTackTime]);
  const coachReplay = useMemo(() => runScenario(COACH_TACK_TIME), []);
  const noTackReplay = useMemo(() => runScenario(null), []);
  const overallScore = prediction
    ? Math.round(prediction.evaluation.score * 0.25 + replay.decision.score * 0.75)
    : replay.decision.score;

  useEffect(() => {
    if (phase !== "playing" || isPaused) return;
    if (time >= SCENARIO_DURATION) {
      setPhase("replay");
      return;
    }
    const timer = window.setTimeout(() => setTime((current) => current + 1), 720);
    return () => window.clearTimeout(timer);
  }, [phase, time, isPaused]);

  useEffect(() => {
    if (phase !== "replay" || !prediction || recorded) return;
    onRecord(
      lesson.id,
      overallScore,
      prediction.confidence,
      prediction.evaluation.diagnosis,
    );
    setRecorded(true);
  }, [lesson.id, onRecord, overallScore, phase, prediction, recorded]);

  const start = (nextPrediction: DiagnosticResponse) => {
    setPrediction(nextPrediction);
    setTime(0);
    setUserTackTime(null);
    setDidChooseTack(false);
    setIsPaused(false);
    setPhase("playing");
  };

  const retry = () => {
    setTime(0);
    setUserTackTime(null);
    setDidChooseTack(false);
    setPrediction(null);
    setRecorded(false);
    setIsPaused(false);
    setPhase("predict");
  };

  const tack = () => {
    if (didChooseTack) return;
    setUserTackTime(time);
    setDidChooseTack(true);
  };

  const finishNow = () => {
    setTime(SCENARIO_DURATION);
    setIsPaused(false);
    setPhase("replay");
  };

  const currentFrame = replay.frames[time];

  return (
    <div className={`simulation-lesson simulation-lesson--${phase}`}>
      <section className="lesson-heading lesson-heading--compact">
        <div>
          <div className="section-kicker">{lesson.eyebrow}</div>
          <h1>右振れを、<br />クロスに変える。</h1>
        </div>
        <p>{lesson.summary}</p>
      </section>

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
                <p>{isPaused ? "停止中。風向と相手の位置を確認できます。" : getPlayPrompt(time, didChooseTack)}</p>
              </div>
              <button type="button" className="pause-action" onClick={() => setIsPaused((current) => !current)}>
                {isPaused ? "再開" : "一時停止"}
              </button>
              <button type="button" className="tack-action" onClick={tack} disabled={didChooseTack}>
                <span>{didChooseTack ? "タック済み" : "今、タック"}</span>
                <small>{didChooseTack ? `${userTackTime}秒で実行` : "TACK NOW"}</small>
              </button>
              <button type="button" className="text-action" onClick={finishNow}>リプレイへ進む</button>
            </div>
          ) : null}
        </div>

        <aside className="workspace__lesson">
          {phase === "predict" ? (
            <div className="simulation-prediction">
              <DiagnosticQuestion lesson={lesson} mode="predict" onSubmit={start} />
              <dl className="known-facts">
                <div><dt>艇</dt><dd>同じ速さの420</dd></div>
                <div><dt>横の距離</dt><dd>12艇身</dd></div>
                <div><dt>操作</dt><dd>タックは1回</dd></div>
                <div><dt>目標</dt><dd>相手より前をクロス</dd></div>
              </dl>
            </div>
          ) : null}

          {phase === "playing" ? (
            <section className="watch-list" aria-labelledby="watch-heading">
              <div className="section-kicker">LOOK / 見るポイント</div>
              <h2 id="watch-heading">
                {prediction?.evaluation.showScaffold ? "基準線を使って見る。" : "風だけでなく、相手も見る。"}
              </h2>
              {prediction?.evaluation.showScaffold ? (
                <div className="live-scaffold" aria-live="polite">
                  <strong>予想に合わせたヒント</strong>
                  <p>横の点線がラダーラングです。風が右へ振れたとき、どちらの艇が上の線へ移るか見てください。</p>
                </div>
              ) : null}
              <ol>
                <li><span>1</span><p><strong>風向</strong>右への振れは大きくなっている？</p></li>
                <li><span>2</span><p><strong>横の距離</strong>離れているほど、振れの影響は大きい。</p></li>
                <li><span>3</span><p><strong>クロス</strong>今タックしたら、相手の前を通れる？</p></li>
              </ol>
            </section>
          ) : null}

          {phase === "replay" ? <ReplayPanel replay={replay} time={time} onTimeChange={setTime} /> : null}
        </aside>
      </div>

      {phase === "replay" && prediction ? (
        <ResultSummary
          replay={replay}
          prediction={prediction}
          overallScore={overallScore}
          onRetry={retry}
          onOpenLesson={onOpenLesson}
          onBack={onBack}
        />
      ) : null}
    </div>
  );
}
