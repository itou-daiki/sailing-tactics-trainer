import { LESSONS, type Confidence, type LessonId } from "./lessons";

export const PROGRESS_STORAGE_KEY = "shift-420-progress-v1";

export interface LessonProgress {
  attempts: number;
  bestScore: number;
  lastScore: number;
  confidence: Confidence;
  diagnosis?: string;
  completedAt: string;
}

export interface CourseProgress {
  version: 1;
  lessons: Partial<Record<LessonId, LessonProgress>>;
}

export const EMPTY_PROGRESS: CourseProgress = { version: 1, lessons: {} };

const lessonIds = new Set(LESSONS.map((lesson) => lesson.id));

export function parseProgress(raw: string | null): CourseProgress {
  if (!raw) return EMPTY_PROGRESS;

  try {
    const parsed = JSON.parse(raw) as Partial<CourseProgress>;
    if (parsed.version !== 1 || typeof parsed.lessons !== "object" || parsed.lessons === null) {
      return EMPTY_PROGRESS;
    }

    const lessons: CourseProgress["lessons"] = {};
    for (const [id, value] of Object.entries(parsed.lessons)) {
      if (!lessonIds.has(id as LessonId) || typeof value !== "object" || value === null) continue;
      const record = value as Partial<LessonProgress>;
      if (
        typeof record.attempts !== "number" ||
        typeof record.bestScore !== "number" ||
        typeof record.lastScore !== "number" ||
        !["sure", "thinking", "guessing"].includes(record.confidence ?? "") ||
        typeof record.completedAt !== "string"
      ) continue;

      lessons[id as LessonId] = record as LessonProgress;
    }
    return { version: 1, lessons };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function recordAttempt(
  progress: CourseProgress,
  lessonId: LessonId,
  score: number,
  confidence: Confidence,
  diagnosis?: string,
  completedAt = new Date().toISOString(),
): CourseProgress {
  const previous = progress.lessons[lessonId];
  return {
    version: 1,
    lessons: {
      ...progress.lessons,
      [lessonId]: {
        attempts: (previous?.attempts ?? 0) + 1,
        bestScore: Math.max(previous?.bestScore ?? 0, score),
        lastScore: score,
        confidence,
        diagnosis,
        completedAt,
      },
    },
  };
}

export function getCompletedCount(progress: CourseProgress): number {
  return LESSONS.filter((lesson) => (progress.lessons[lesson.id]?.bestScore ?? 0) >= 70).length;
}

export function getRecommendedLessonId(progress: CourseProgress): LessonId {
  const firstIncomplete = LESSONS.find(
    (lesson) => (progress.lessons[lesson.id]?.bestScore ?? 0) < 70,
  );
  if (firstIncomplete) return firstIncomplete.id;

  let weakest = LESSONS[0];
  for (const lesson of LESSONS.slice(1)) {
    if (
      (progress.lessons[lesson.id]?.bestScore ?? 0) <
      (progress.lessons[weakest.id]?.bestScore ?? 0)
    ) {
      weakest = lesson;
    }
  }
  return weakest.id;
}

export function getMasteryLabel(score: number | undefined): string {
  if (score === undefined) return "未実施";
  if (score >= 90) return "定着";
  if (score >= 70) return "理解中";
  return "要復習";
}
