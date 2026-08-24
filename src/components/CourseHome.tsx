import { LESSONS, type LessonId } from "../domain/lessons";
import {
  getCompletedCount,
  getMasteryLabel,
  getRecommendedLessonId,
  type CourseProgress,
} from "../domain/progress";

export function CourseHome({
  progress,
  onOpenLesson,
  onOpenFreeSimulation,
  onOpenRaceSimulation,
}: {
  progress: CourseProgress;
  onOpenLesson: (lessonId: LessonId) => void;
  onOpenFreeSimulation: () => void;
  onOpenRaceSimulation: () => void;
}) {
  const completed = getCompletedCount(progress);
  const recommendedId = getRecommendedLessonId(progress);
  const recommended = LESSONS.find((lesson) => lesson.id === recommendedId)!;

  return (
    <div className="course-home">
      <section className="course-intro" aria-labelledby="course-title">
        <div className="section-kicker">420 SHIFT TRAINING / 自主練習</div>
        <h1 id="course-title">タック／ジャイブの<br />タイミングを練習する。</h1>
        <p>
          風が右、左へ繰り返し振れる海面で、いつ待ち、いつタック／ジャイブするかを
          マークまで何度も練習します。
        </p>
      </section>

      <section className="free-launch free-launch--primary" aria-labelledby="free-launch-title">
        <div className="free-launch__mast" aria-hidden="true">
          <svg viewBox="0 0 42 58"><polyline points="2,29 9,8 16,29 23,50 30,29 40,8" /></svg>
        </div>
        <div className="free-launch__copy">
          <div className="section-kicker">SHIFT LAB / TACK &amp; GYBE POINT</div>
          <h2 id="free-launch-title">タック／ジャイブのタイミングを練習する</h2>
          <p>何度も振れ、振れ戻る風を再現。各タック／ジャイブを前後4秒へ動かし、ゲイン、ロス、マーク到達を個別に比べます。</p>
        </div>
        <div className="free-launch__meta">
          <span>連続する振れ</span>
          <span>全操作を分析</span>
        </div>
        <button type="button" onClick={onOpenFreeSimulation}>
          SHIFT LABを始める <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="race-launch" aria-labelledby="race-launch-title">
        <div className="race-launch__signal" aria-hidden="true">
          <span>−1:00</span>
          <i />
        </div>
        <div className="race-launch__copy">
          <div className="section-kicker">RACE LAB / 応用</div>
          <h2 id="race-launch-title">スタートから第1上マークまで練習する</h2>
          <p>SHIFT LABでタック／ジャイブのタイミングを練習したら、初級4艇／中級8艇でスタートから第1上マークまで走ります。</p>
        </div>
        <div className="race-launch__meta">
          <span>RRS 26</span>
          <span>初級 4艇 / 中級 8艇</span>
          <span>START → MARK 1</span>
        </div>
        <button type="button" onClick={onOpenRaceSimulation}>
          RACE LABを始める <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="training-log" aria-labelledby="training-log-title">
        <div className="training-log__heading">
          <div>
            <div className="section-kicker">TRAINING LOG / 進捗</div>
            <h2 id="training-log-title">{completed} / {LESSONS.length} レッスン完了</h2>
          </div>
          <span>この端末に自動保存</span>
        </div>
        <div className="progress-rail" aria-label={`${LESSONS.length}レッスン中${completed}レッスン完了`}>
          {LESSONS.map((lesson) => {
            const score = progress.lessons[lesson.id]?.bestScore;
            return (
              <span
                key={lesson.id}
                className={score === undefined ? "" : score >= 70 ? "is-complete" : "needs-review"}
                title={`${lesson.shortTitle}: ${getMasteryLabel(score)}`}
              />
            );
          })}
        </div>
      </section>

      <section className="recommended-drill" aria-labelledby="recommended-title">
        <div className="recommended-drill__flag">NEXT DRILL</div>
        <div>
          <span>次におすすめ</span>
          <h2 id="recommended-title">{recommended.number.toString().padStart(2, "0")}　{recommended.shortTitle}</h2>
          <p>{recommended.objective}</p>
        </div>
        <button type="button" onClick={() => onOpenLesson(recommended.id)}>
          このレッスンを始める <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="lesson-index" aria-labelledby="lesson-index-title">
        <div className="lesson-index__heading">
          <div className="section-kicker">COURSE / 段階的に学ぶ</div>
          <h2 id="lesson-index-title">5つの基礎レッスン</h2>
        </div>
        <ol>
          {LESSONS.map((lesson) => {
            const record = progress.lessons[lesson.id];
            return (
              <li key={lesson.id}>
                <button type="button" onClick={() => onOpenLesson(lesson.id)}>
                  <span className="lesson-index__number">{lesson.number.toString().padStart(2, "0")}</span>
                  <span className="lesson-index__copy">
                    <strong>{lesson.shortTitle}</strong>
                    <small>{lesson.summary}</small>
                  </span>
                  <span className="lesson-index__meta">
                    <small>{lesson.duration}</small>
                    <strong className={record && record.bestScore < 70 ? "needs-review-text" : ""}>
                      {getMasteryLabel(record?.bestScore)}
                    </strong>
                  </span>
                  <span className="lesson-index__arrow" aria-hidden="true">→</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="course-principle">
        <strong>評価する内容</strong>
        <p>最終順位だけではなく、観察できた情報から再現可能な判断をしたかを評価します。</p>
      </aside>
    </div>
  );
}
