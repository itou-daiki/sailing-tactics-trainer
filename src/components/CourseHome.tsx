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
}: {
  progress: CourseProgress;
  onOpenLesson: (lessonId: LessonId) => void;
}) {
  const completed = getCompletedCount(progress);
  const recommendedId = getRecommendedLessonId(progress);
  const recommended = LESSONS.find((lesson) => lesson.id === recommendedId)!;

  return (
    <div className="course-home">
      <section className="course-intro" aria-labelledby="course-title">
        <div className="section-kicker">420 TACTICAL COURSE / 自主練習</div>
        <h1 id="course-title">風と相手を、<br />同時に見る。</h1>
        <p>
          レース中の3秒を、陸で何度でも練習する。答えを覚えるのではなく、
          風向・横の距離・相手の動きから理由を説明できる状態を目指します。
        </p>
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
          始める <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="lesson-index" aria-labelledby="lesson-index-title">
        <div className="lesson-index__heading">
          <div className="section-kicker">COURSE / 段階的に学ぶ</div>
          <h2 id="lesson-index-title">5つの判断をつなげる</h2>
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
        <strong>このコースで測るもの</strong>
        <p>最終順位だけではなく、観察できた情報から再現可能な判断をしたかを評価します。</p>
      </aside>
    </div>
  );
}
