import type { Frame, Point, ScenarioReplay } from "../domain/simulation";
import { BOAT_LENGTH_PX } from "../domain/simulation";

interface CourseBoardProps {
  frame: Frame;
  replay: ScenarioReplay;
  coachReplay: ScenarioReplay;
  noTackReplay: ScenarioReplay;
  showGhosts: boolean;
}

const screenPoint = (point: Point) => ({
  x: 275 + (point.x - 275) * 0.82,
  y: 525 - (point.y - 90) * 1.35,
});

const polylinePoints = (replay: ScenarioReplay, until: number) =>
  replay.frames
    .slice(0, until + 1)
    .map((item) => screenPoint(item.user))
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

function Boat({
  point,
  heading,
  label,
  variant,
}: {
  point: Point;
  heading: number;
  label: string;
  variant: "user" | "opponent";
}) {
  const position = screenPoint(point);
  return (
    <g transform={`translate(${position.x} ${position.y})`}>
      <g transform={`rotate(${heading})`}>
        <path className={`boat boat--${variant}`} d="M 0 -18 L 8 14 L 0 9 L -8 14 Z" />
        <line className="boat__mast" x1="0" y1="-10" x2="0" y2="10" />
      </g>
      <rect className={`boat-label boat-label--${variant}`} x="-23" y="20" width="46" height="18" />
      <text className="boat-label__text" x="0" y="33" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

export function CourseBoard({
  frame,
  replay,
  coachReplay,
  noTackReplay,
  showGhosts,
}: CourseBoardProps) {
  const userPosition = screenPoint(frame.user);
  const opponentPosition = screenPoint(frame.opponent);
  const gain = frame.relativeGain / BOAT_LENGTH_PX;

  return (
    <section className="course-board" aria-label="コース上の自艇と相手艇">
      <div className="course-board__readout">
        <span className="readout-label">相手との差</span>
        <strong className={gain >= 0 ? "gain-positive" : "gain-negative"}>
          {gain >= 0 ? "+" : ""}
          {gain.toFixed(1)}艇身
        </strong>
      </div>

      <svg className="course-map" viewBox="0 0 550 560" role="img" aria-labelledby="course-title course-desc">
        <title id="course-title">420二艇の航跡とラダーラング</title>
        <desc id="course-desc">
          オレンジが自艇、紺色が相手艇です。横線は現在の風向に合わせて回転します。
        </desc>
        <defs>
          <pattern id="chart-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" className="chart-grid" fill="none" />
          </pattern>
          <marker id="gain-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" className="gain-arrow" />
          </marker>
        </defs>

        <rect width="550" height="560" className="course-map__water" />
        <rect width="550" height="560" fill="url(#chart-grid)" />

        <g className="ladder-rungs" transform={`rotate(${frame.windAngle} 275 295)`}>
          {[75, 135, 195, 255, 315, 375, 435, 495].map((y) => (
            <line key={y} x1="-80" y1={y} x2="630" y2={y} />
          ))}
        </g>

        <g className="course-mark" transform="translate(275 45)">
          <path d="M 0 -19 L 17 14 L -17 14 Z" />
          <line x1="-27" y1="22" x2="27" y2="22" />
          <text x="0" y="40" textAnchor="middle">風上マーク</text>
        </g>

        <g className="mean-wind-axis">
          <line x1="275" y1="82" x2="275" y2="530" />
          <text x="284" y="105">平均風向</text>
        </g>

        {showGhosts ? (
          <g className="ghost-tracks" aria-label="比較航跡">
            <polyline className="track track--coach" points={polylinePoints(coachReplay, frame.time)} />
            <polyline className="track track--no-tack" points={polylinePoints(noTackReplay, frame.time)} />
          </g>
        ) : null}

        <polyline className="track track--opponent" points={replay.frames.slice(0, frame.time + 1).map((item) => screenPoint(item.opponent)).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} />
        <polyline className="track track--user" points={polylinePoints(replay, frame.time)} />

        <line
          className="relative-gain-line"
          x1={opponentPosition.x}
          y1={opponentPosition.y}
          x2={userPosition.x}
          y2={userPosition.y}
          markerStart="url(#gain-arrow)"
          markerEnd="url(#gain-arrow)"
        />

        <Boat point={frame.opponent} heading={frame.opponent.heading} label="相手" variant="opponent" />
        <Boat point={frame.user} heading={frame.user.heading} label="自艇" variant="user" />
      </svg>

      {showGhosts ? (
        <div className="course-legend" aria-label="航跡の凡例">
          <span><i className="legend-line legend-line--actual" />あなた</span>
          <span><i className="legend-line legend-line--coach" />コーチ例</span>
          <span><i className="legend-line legend-line--hold" />タックなし</span>
        </div>
      ) : null}
    </section>
  );
}
