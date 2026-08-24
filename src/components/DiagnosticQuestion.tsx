import { useState } from "react";
import {
  evaluateAnswer,
  type AnswerEvaluation,
  type Confidence,
  type LessonDefinition,
} from "../domain/lessons";

export interface DiagnosticResponse {
  optionId: string;
  confidence: Confidence;
  evaluation: AnswerEvaluation;
}

const confidenceOptions: { id: Confidence; label: string }[] = [
  { id: "sure", label: "根拠があり確信" },
  { id: "thinking", label: "たぶんそう" },
  { id: "guessing", label: "まだ推測" },
];

export function DiagnosticQuestion({
  lesson,
  mode,
  onSubmit,
}: {
  lesson: LessonDefinition;
  mode: "reveal" | "predict";
  onSubmit: (response: DiagnosticResponse) => void;
}) {
  const [optionId, setOptionId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  const submit = () => {
    if (!optionId || !confidence) return;
    onSubmit({ optionId, confidence, evaluation: evaluateAnswer(lesson, optionId, confidence) });
  };

  return (
    <section className="diagnostic-question" aria-labelledby="diagnostic-title">
      <div className="section-kicker">PREDICT / 先に考える</div>
      <h2 id="diagnostic-title">{lesson.question.prompt}</h2>
      <p className="diagnostic-situation">{lesson.question.situation}</p>

      <div className="answer-options" role="group" aria-label="回答を選ぶ">
        {lesson.question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={optionId === option.id}
            className={optionId === option.id ? "answer-option answer-option--selected" : "answer-option"}
            onClick={() => setOptionId(option.id)}
          >
            <span aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>

      <fieldset className="confidence-field">
        <legend>どのくらい自信がありますか？</legend>
        <div>
          {confidenceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={confidence === option.id}
              className={confidence === option.id ? "confidence-choice confidence-choice--selected" : "confidence-choice"}
              onClick={() => setConfidence(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" className="primary-action" onClick={submit} disabled={!optionId || !confidence}>
        {mode === "predict" ? "予想を記録してシミュレーションを始める" : "回答を確認する"}
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
