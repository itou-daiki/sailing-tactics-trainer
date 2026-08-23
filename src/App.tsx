import { useCallback, useEffect, useState } from "react";
import { ConceptLesson } from "./components/ConceptLesson";
import { CourseHome } from "./components/CourseHome";
import { FreeSimulation } from "./components/FreeSimulation";
import { RaceSimulation } from "./components/RaceSimulation";
import { SimulationLesson } from "./components/SimulationLesson";
import {
  LESSON_BY_ID,
  type Confidence,
  type LessonId,
} from "./domain/lessons";
import {
  PROGRESS_STORAGE_KEY,
  parseProgress,
  recordAttempt,
  type CourseProgress,
} from "./domain/progress";

type AppRoute = LessonId | "free-sail" | "race-lab" | null;

const getRouteFromHash = (): AppRoute => {
  if (window.location.hash === "#free-sail") return "free-sail";
  if (window.location.hash === "#race-lab") return "race-lab";
  const match = window.location.hash.match(/^#lesson-(.+)$/);
  const id = match?.[1] as LessonId | undefined;
  return id && LESSON_BY_ID.has(id) ? id : null;
};

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash());
  const [progress, setProgress] = useState<CourseProgress>(() =>
    parseProgress(window.localStorage.getItem(PROGRESS_STORAGE_KEY)),
  );
  const lesson = route && route !== "free-sail" && route !== "race-lab"
    ? LESSON_BY_ID.get(route) ?? null
    : null;
  const isFreeSimulation = route === "free-sail";
  const isRaceSimulation = route === "race-lab";

  useEffect(() => {
    const updateFromHash = () => setRoute(getRouteFromHash());
    window.addEventListener("hashchange", updateFromHash);
    return () => window.removeEventListener("hashchange", updateFromHash);
  }, []);

  const openLesson = useCallback((lessonId: LessonId) => {
    window.location.hash = `lesson-${lessonId}`;
    setRoute(lessonId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openFreeSimulation = useCallback(() => {
    window.location.hash = "free-sail";
    setRoute("free-sail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openRaceSimulation = useCallback(() => {
    window.location.hash = "race-lab";
    setRoute("race-lab");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openCourse = useCallback(() => {
    window.history.pushState(null, "", window.location.pathname);
    setRoute(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const saveAttempt = useCallback((
    lessonId: LessonId,
    score: number,
    confidence: Confidence,
    diagnosis?: string,
  ) => {
    setProgress((current) => {
      const next = recordAttempt(current, lessonId, score, confidence, diagnosis);
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <main id="main-content" className="app">
        <header className="site-header">
          <div className="brand-lockup">
            <button type="button" className="brand" onClick={openCourse}>
              <span className="brand__signal" aria-hidden="true" />
              <strong>SHIFT</strong>
              <small>420 TACTICS</small>
            </button>
            <span className="header-credit">Created by Dit-Lab.</span>
          </div>
          {lesson || isFreeSimulation || isRaceSimulation ? (
            <div className="header-lesson-tools">
              <button type="button" className="back-to-course" onClick={openCourse}>← コース</button>
              <div className={isFreeSimulation || isRaceSimulation ? "lesson-number lesson-number--free" : "lesson-number"}>
                <span>{isFreeSimulation || isRaceSimulation ? "MODE" : "LESSON"}</span>
                <strong>{isRaceSimulation ? "RACE" : isFreeSimulation ? "SHIFT" : lesson?.number.toString().padStart(2, "0")}</strong>
              </div>
            </div>
          ) : (
            <div className="lesson-number lesson-number--course">
              <span>COURSE</span>
              <strong>05</strong>
            </div>
          )}
        </header>

        {!lesson && !isFreeSimulation && !isRaceSimulation ? (
          <CourseHome
            progress={progress}
            onOpenLesson={openLesson}
            onOpenFreeSimulation={openFreeSimulation}
            onOpenRaceSimulation={openRaceSimulation}
          />
        ) : null}

        {lesson?.kind === "concept" ? (
          <ConceptLesson
            key={lesson.id}
            lesson={lesson}
            onRecord={saveAttempt}
            onOpenLesson={openLesson}
            onBack={openCourse}
          />
        ) : null}

        {lesson?.kind === "simulation" ? (
          <SimulationLesson
            key={lesson.id}
            lesson={lesson}
            onRecord={saveAttempt}
            onOpenLesson={openLesson}
            onBack={openCourse}
          />
        ) : null}

        {isFreeSimulation ? <FreeSimulation onBack={openCourse} /> : null}
        {isRaceSimulation ? <RaceSimulation onBack={openCourse} /> : null}

        <footer className="site-footer">
          <div className="site-footer__notes">
            <p>420教育用モデル v0.4　｜　1艇身 = 4.2m</p>
            <p>判断の練習用です。実際の海面では波・潮・艇速差も考えます。</p>
          </div>
          <p className="site-credit">Created by Dit-Lab.</p>
        </footer>
      </main>
    </>
  );
}
