import { useState } from "react";
import { ConceptDiagram } from "./ConceptDiagram";
import { DiagnosticQuestion, type DiagnosticResponse } from "./DiagnosticQuestion";
import { getNextLessonId, type Confidence, type LessonDefinition, type LessonId } from "../domain/lessons";

export function ConceptLesson({
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
  const [response, setResponse] = useState<DiagnosticResponse | null>(null);
  const [angle, setAngle] = useState(lesson.diagram === "return" || lesson.diagram === "downwind" ? 10 : 0);
  const nextId = getNextLessonId(lesson.id);

  const submit = (nextResponse: DiagnosticResponse) => {
    setResponse(nextResponse);
    onRecord(
      lesson.id,
      nextResponse.evaluation.score,
      nextResponse.confidence,
      nextResponse.evaluation.diagnosis,
    );
  };

  const retry = () => setResponse(null);

  return (
    <>
      <section className="lesson-heading lesson-heading--compact">
        <div>
          <div className="section-kicker">{lesson.eyebrow}</div>
          <h1>{lesson.title.split("\n").map((line, index) => <span key={line}>{index > 0 ? <br /> : null}{line}</span>)}</h1>
        </div>
        <p>{lesson.summary}</p>
      </section>

      <div className="concept-workspace">
        <section className="concept-visual" aria-label="考えるための図">
          <ConceptDiagram kind={lesson.diagram} angle={angle} revealed={response !== null} />
          {response && lesson.diagram !== "cover" ? (
            <div className="wind-control">
              <label htmlFor="wind-angle">風向を動かして確かめる</label>
              <input
                id="wind-angle"
                type="range"
                min="0"
                max="10"
                value={angle}
                onChange={(event) => setAngle(Number(event.target.value))}
              />
              <output htmlFor="wind-angle">右 {angle}°</output>
            </div>
          ) : null}
        </section>

        <aside className="concept-question-panel">
          {!response ? (
            <DiagnosticQuestion lesson={lesson} mode="reveal" onSubmit={submit} />
          ) : (
            <section className="answer-feedback" aria-live="polite">
              <div className={response.evaluation.correct ? "feedback-mark feedback-mark--correct" : "feedback-mark"}>
                {response.evaluation.correct ? "✓" : "↺"}
              </div>
              <div className="section-kicker">COACH RESPONSE / 考え方を確認</div>
              <h2>{response.evaluation.headline}</h2>
              <p className="answer-feedback__main">{response.evaluation.feedback}</p>
              {response.evaluation.showScaffold ? (
                <div className="scaffold-note">
                  <strong>まず見る基準</strong>
                  <p>{lesson.keyIdea}</p>
                </div>
              ) : null}
              <p className="answer-feedback__next">{response.evaluation.nextInstruction}</p>

              <div className="feedback-actions">
                {!response.evaluation.correct ? (
                  <button type="button" className="primary-action" onClick={retry}>図を見て、もう一度答える</button>
                ) : nextId ? (
                  <button type="button" className="primary-action" onClick={() => onOpenLesson(nextId)}>
                    次のレッスンへ <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <button type="button" className="primary-action" onClick={onBack}>コースを確認する</button>
                )}
                <button type="button" className="secondary-action" onClick={onBack}>コース一覧へ</button>
              </div>
            </section>
          )}
        </aside>
      </div>

      <section className="lesson-objective-strip">
        <div><span>学ぶ判断</span><strong>{lesson.objective}</strong></div>
        <div><span>キーワード</span><strong>{lesson.vocabulary}</strong></div>
      </section>
    </>
  );
}
