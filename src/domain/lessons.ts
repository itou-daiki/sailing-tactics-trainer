export type LessonId =
  | "ladder-rungs"
  | "shift-cross"
  | "shift-return"
  | "cover-or-split"
  | "downwind-reversal";

export type Confidence = "sure" | "thinking" | "guessing";
export type DiagramKind = "ladder" | "cross" | "return" | "cover" | "downwind";

export interface AnswerOption {
  id: string;
  label: string;
  isCorrect: boolean;
  feedback: string;
  diagnosis?: string;
}

export interface DiagnosticQuestion {
  prompt: string;
  situation: string;
  options: AnswerOption[];
}

export interface LessonDefinition {
  id: LessonId;
  number: number;
  kind: "concept" | "simulation";
  diagram: DiagramKind;
  eyebrow: string;
  title: string;
  shortTitle: string;
  summary: string;
  objective: string;
  duration: string;
  vocabulary: string;
  question: DiagnosticQuestion;
  keyIdea: string;
}

export interface AnswerEvaluation {
  correct: boolean;
  score: number;
  headline: string;
  feedback: string;
  nextInstruction: string;
  diagnosis?: string;
  showScaffold: boolean;
}

export const LESSONS: LessonDefinition[] = [
  {
    id: "ladder-rungs",
    number: 1,
    kind: "concept",
    diagram: "ladder",
    eyebrow: "RELATIVE GAIN / 相対ゲイン",
    title: "艇が動かなくても、\n順位は動く。",
    shortTitle: "風が振れたら、どちらが前？",
    summary: "風向に直角な線で、2艇の本当の前後関係を読みます。",
    objective: "右振れ・左振れと、左右に離れた艇のゲインを結びつける",
    duration: "約2分",
    vocabulary: "ラダーラング",
    question: {
      situation: "同じ高さを走る2艇が、左右に12艇身離れています。艇はまだ動いていません。",
      prompt: "風が右へ10°振れた瞬間、どちらが風上になりますか？",
      options: [
        {
          id: "right",
          label: "右側の艇",
          isCorrect: true,
          feedback: "ラダーラングが右へ回り、右側の艇が一段上になります。",
        },
        {
          id: "left",
          label: "左側の艇",
          isCorrect: false,
          feedback: "左右を逆に捉えています。風が来る側ではなく、回転した横線の高さを見ます。",
          diagnosis: "shift-side-reversal",
        },
        {
          id: "same",
          label: "まだ同じ",
          isCorrect: false,
          feedback: "艇が動かなくても、風向の基準線が回るため前後関係は変わります。",
          diagnosis: "position-only-thinking",
        },
      ],
    },
    keyIdea: "前後はマークまでの直線距離ではなく、現在の風向に直角な線で比べる。",
  },
  {
    id: "shift-cross",
    number: 2,
    kind: "simulation",
    diagram: "cross",
    eyebrow: "OSCILLATING WIND / 振れ戻る風",
    title: "右振れを、\nクロスに変える。",
    shortTitle: "振れをクロスに変える",
    summary: "一時的なゲインを、相手より前を通る位置関係へ変えます。",
    objective: "ヘダーを確認し、振れが戻る前にタックしてクロスを狙う",
    duration: "約3分",
    vocabulary: "クロス・暫定ゲイン",
    question: {
      situation: "自艇は相手より右にいます。2艇は同じ速さで、風は右へ振れ始めます。",
      prompt: "右振れの直後、最初に起きることは？",
      options: [
        {
          id: "user-gains",
          label: "右側の自艇がゲインする",
          isCorrect: true,
          feedback: "右側の自艇が暫定ゲインを得ます。次は、いつクロスへ変えるかです。",
        },
        {
          id: "opponent-gains",
          label: "左側の相手艇がゲインする",
          isCorrect: false,
          feedback: "右振れでは右側の艇が上のラダーラングへ移ります。",
          diagnosis: "shift-side-reversal",
        },
        {
          id: "speed-only",
          label: "艇速が同じなので変わらない",
          isCorrect: false,
          feedback: "艇速が同じでも、風向が変われば相対的な前後は変わります。",
          diagnosis: "speed-only-thinking",
        },
      ],
    },
    keyIdea: "暫定ゲインは、相手をクロスできるうちに取り込む。",
  },
  {
    id: "shift-return",
    number: 3,
    kind: "concept",
    diagram: "return",
    eyebrow: "WIND RETURN / 振れ戻り",
    title: "得した3艇身は、\nまだ確定ではない。",
    shortTitle: "風が戻るとゲインはどうなる？",
    summary: "横に離れたまま風が戻ると、暫定ゲインがどう変わるかを読みます。",
    objective: "現在のゲインと、クロスして取り込んだゲインを区別する",
    duration: "約2分",
    vocabulary: "振れ戻り・レバレッジ",
    question: {
      situation: "右振れで自艇が3艇身ゲインしましたが、相手とはまだ横に14艇身離れています。",
      prompt: "風が平均風向へ戻り始めると、起きやすいことは？",
      options: [
        {
          id: "shrinks",
          label: "暫定ゲインが小さくなる",
          isCorrect: true,
          feedback: "ラダーラングが元へ戻るため、横に離れたことで得た差は小さくなります。",
        },
        {
          id: "grows",
          label: "ゲインがさらに大きくなる",
          isCorrect: false,
          feedback: "右振れで得た差は、同じ風が続く間の暫定的な差です。戻れば縮みます。",
          diagnosis: "gain-is-permanent",
        },
        {
          id: "unchanged",
          label: "3艇身のまま変わらない",
          isCorrect: false,
          feedback: "クロスして位置関係へ変えていない差は、風向が戻ると変化します。",
          diagnosis: "gain-is-permanent",
        },
      ],
    },
    keyIdea: "風による差は暫定。クロスで取り込めた差と分けて考える。",
  },
  {
    id: "cover-or-split",
    number: 4,
    kind: "concept",
    diagram: "cover",
    eyebrow: "FLEET POSITION / 他艇との位置",
    title: "リード艇は守る。\n追走艇は揺さぶる。",
    shortTitle: "カバーする？ 分かれる？",
    summary: "順位によって、取るべきレバレッジとリスクが変わることを学びます。",
    objective: "リード時はレバレッジを減らし、追走時は逆転機会を作る",
    duration: "約2分",
    vocabulary: "ルーズカバー・スプリット",
    question: {
      situation: "あなたは2艇身リード。次の振れは左右どちらか分かりません。相手が右へ離れ始めました。",
      prompt: "リードを守る基本判断は？",
      options: [
        {
          id: "loose-cover",
          label: "同じ側へ寄せ、横の距離を減らす",
          isCorrect: true,
          feedback: "ルーズカバーで相手とのレバレッジを減らすと、大きな逆転を受けにくくなります。",
        },
        {
          id: "opposite-corner",
          label: "反対側へ離れて勝負する",
          isCorrect: false,
          feedback: "それは追走艇が逆転を狙う選択です。リード艇には不要な振れ幅を増やします。",
          diagnosis: "leader-takes-trailer-risk",
        },
        {
          id: "mark-distance",
          label: "相手を見ず、マークへ近い方だけ走る",
          isCorrect: false,
          feedback: "リードを守る場面では、絶対位置だけでなく相手との横の距離が重要です。",
          diagnosis: "ignores-opponent",
        },
      ],
    },
    keyIdea: "先行艇は相手との横の距離を減らし、追走艇は逆転のために距離を作る。",
  },
  {
    id: "downwind-reversal",
    number: 5,
    kind: "concept",
    diagram: "downwind",
    eyebrow: "DOWNWIND / ジャイブ判断",
    title: "下りでは、\nラダーラングが逆になる。",
    shortTitle: "下りの振れとジャイブ",
    summary: "アップウインドの感覚をそのまま使わず、下りの相対ゲインを読みます。",
    objective: "ダウンウインドではシフトによる左右のゲインが逆になると理解する",
    duration: "約2分",
    vocabulary: "ジャイブ・ダウンウインド",
    question: {
      situation: "2艇がランニングで左右に離れています。風が右へ振れました。",
      prompt: "アップウインドとは逆に、ゲインするのはどちら？",
      options: [
        {
          id: "left",
          label: "左側の艇",
          isCorrect: true,
          feedback: "下りでは効果が逆になり、右振れでは左側の艇が風下方向へゲインします。",
        },
        {
          id: "right",
          label: "右側の艇",
          isCorrect: false,
          feedback: "それは上りの読み方です。下りではラダーラングの有利側が逆になります。",
          diagnosis: "upwind-rule-downwind",
        },
        {
          id: "same",
          label: "下りでは差が出ない",
          isCorrect: false,
          feedback: "下りでも風向と横の距離で相対ゲインは変わります。",
          diagnosis: "no-downwind-shift-effect",
        },
      ],
    },
    keyIdea: "上りの左右関係をそのまま使わない。下りでは有利側が逆になる。",
  },
];

export const LESSON_BY_ID = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));

export function evaluateAnswer(
  lesson: LessonDefinition,
  optionId: string,
  confidence: Confidence,
): AnswerEvaluation {
  const option = lesson.question.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Unknown option: ${optionId}`);

  if (option.isCorrect) {
    const score = confidence === "sure" ? 100 : confidence === "thinking" ? 86 : 72;
    return {
      correct: true,
      score,
      headline: confidence === "sure" ? "考え方まで合っています" : "正解。理由を固めよう",
      feedback: option.feedback,
      nextInstruction:
        confidence === "sure"
          ? "図の基準線を動かして確かめたら、次のレッスンへ進めます。"
          : "正解でも自信が低いときは、図とキーワードを確認してから次へ進みましょう。",
      showScaffold: confidence !== "sure",
    };
  }

  return {
    correct: false,
    score: confidence === "sure" ? 28 : confidence === "thinking" ? 40 : 52,
    headline: confidence === "sure" ? "思い込みを修正するチャンス" : "基準線から考え直そう",
    feedback: option.feedback,
    nextInstruction: `「${lesson.keyIdea}」を図で確認し、同じ問いにもう一度答えてみましょう。`,
    diagnosis: option.diagnosis,
    showScaffold: true,
  };
}

export function getNextLessonId(currentId: LessonId): LessonId | null {
  const index = LESSONS.findIndex((lesson) => lesson.id === currentId);
  return LESSONS[index + 1]?.id ?? null;
}
