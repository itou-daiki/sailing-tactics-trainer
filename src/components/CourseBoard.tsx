import type { Frame, Point } from "../domain/simulation";
import {
  BOAT_LENGTH_PX,
  getMarkDistance,
  MARK_REACH_RADIUS_PX,
} from "../domain/simulation";

interface TrackReplay {
  frames: Frame[];
}

export interface CourseComparison {
  replay: TrackReplay;
  variant: "coach" | "no-tack";
  label: string;
}

interface CourseBoardProps {
  frame: Frame;
  replay: TrackReplay;
  comparisons?: CourseComparison[];
  leg?: "upwind" | "downwind";
  meetingForecast?: {
    point: Point;
    seconds: number;
  };
}

const screenPoint = (point: Point) => ({
  x: 275 + (point.x - 275) * 0.82,
  y: 525 - (point.y - 90) * 1.35,
});

const polylinePoints = (replay: TrackReplay, until: number) =>
  replay.frames
    .slice(0, until + 1)
    .map((item) => screenPoint(item.user))
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

const getBlanketWakePoints = (frame: Frame) => {
  if (!frame.blanket) return "";
  const source = frame.blanket.source === "user" ? frame.user : frame.opponent;
  const radians = frame.blanket.wakeHeading * Math.PI / 180;
  const direction = { x: Math.sin(radians), y: Math.cos(radians) };
  const perpendicular = { x: direction.y, y: -direction.x };
  const startWidth = 5;
  const endWidth = 18;
  const length = 90;
  return [
    { x: source.x + perpendicular.x * startWidth, y: source.y + perpendicular.y * startWidth },
    { x: source.x + direction.x * length + perpendicular.x * endWidth, y: source.y + direction.y * length + perpendicular.y * endWidth },
    { x: source.x + direction.x * length - perpendicular.x * endWidth, y: source.y + direction.y * length - perpendicular.y * endWidth },
    { x: source.x - perpendicular.x * startWidth, y: source.y - perpendicular.y * startWidth },
  ].map(screenPoint).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
};

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
  comparisons = [],
  leg = "upwind",
  meetingForecast,
}: CourseBoardProps) {
  const userPosition = screenPoint(frame.user);
  const opponentPosition = screenPoint(frame.opponent);
  const gain = frame.relativeGain / BOAT_LENGTH_PX;
  const markDistance = getMarkDistance(frame.user, leg) / BOAT_LENGTH_PX;
  const isAtMark = markDistance <= MARK_REACH_RADIUS_PX / BOAT_LENGTH_PX;
  const meetingForecastPoint = meetingForecast ? screenPoint(meetingForecast.point) : null;
  const blanketTarget = frame.blanket
    ? screenPoint(frame.blanket.affected === "user" ? frame.user : frame.opponent)
    : null;

  return (
    <section className={isAtMark ? "course-board course-board--at-mark" : "course-board"} aria-label="コース上の自艇と相手艇">
      <div className="course-board__readout">
        <span className="readout-label">相手との差</span>
        <strong className={gain >= 0 ? "gain-positive" : "gain-negative"}>
          {gain >= 0 ? "+" : ""}
          {gain.toFixed(1)}艇身
        </strong>
        <small>マークまで {markDistance.toFixed(1)}艇身</small>
      </div>

      <svg className="course-map" viewBox="0 0 550 560" role="img" aria-labelledby="course-title course-desc">
        <title id="course-title">420二艇の航跡とラダーラング</title>
        <desc id="course-desc">
          オレンジが自艇、紺色が相手艇です。横線は現在の風向に合わせて回転します。
          {meetingForecast ? `破線は約${meetingForecast.seconds}秒先の予測ミート点です。` : ""}
          {frame.blanket ? `${frame.blanket.affected === "user" ? "自艇" : "相手艇"}がブランケットで減速しています。` : ""}
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

        {frame.blanket && blanketTarget ? (
          <g className="blanket-wake" aria-label={`${frame.blanket.affected === "user" ? "自艇" : "相手艇"}がブランケットで${Math.round((1 - frame.blanket.speedMultiplier) * 100)}%減速`}>
            <polygon points={getBlanketWakePoints(frame)} />
            <text x={blanketTarget.x + 18} y={blanketTarget.y - 22}>DIRTY AIR</text>
            <text x={blanketTarget.x + 18} y={blanketTarget.y - 10}>−{Math.round((1 - frame.blanket.speedMultiplier) * 100)}%</text>
          </g>
        ) : null}

        <g className="ladder-rungs" transform={`rotate(${frame.windAngle} 275 295)`}>
          {[75, 135, 195, 255, 315, 375, 435, 495].map((y) => (
            <line key={y} x1="-80" y1={y} x2="630" y2={y} />
          ))}
        </g>

        <g className="course-mark" transform={`translate(275 ${leg === "upwind" ? 45 : 515})`}>
          <circle className="mark-reach-zone" cx="0" cy="0" r="42" />
          <path d={leg === "upwind" ? "M 0 -19 L 17 14 L -17 14 Z" : "M 0 19 L 17 -14 L -17 -14 Z"} />
          <line
            x1="-27"
            y1={leg === "upwind" ? 22 : -22}
            x2="27"
            y2={leg === "upwind" ? 22 : -22}
          />
          <text x="0" y={leg === "upwind" ? 40 : -30} textAnchor="middle">
            {leg === "upwind" ? "風上マーク" : "風下マーク"}
          </text>
        </g>

        <g className="mean-wind-axis">
          <line x1="275" y1="82" x2="275" y2="530" />
          <text x="284" y="105">平均風向</text>
        </g>

        {comparisons.length > 0 ? (
          <g className="ghost-tracks" aria-label="比較航跡">
            {comparisons.map((comparison) => (
              <polyline
                key={`${comparison.variant}-${comparison.label}`}
                className={`track track--${comparison.variant}`}
                points={polylinePoints(comparison.replay, frame.time)}
              />
            ))}
          </g>
        ) : null}

        <polyline className="track track--opponent" points={replay.frames.slice(0, frame.time + 1).map((item) => screenPoint(item.opponent)).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} />
        <polyline className="track track--user" points={polylinePoints(replay, frame.time)} />

        {meetingForecast && meetingForecastPoint ? (
          <g className="meeting-forecast" aria-label={`約${meetingForecast.seconds}秒先の予測ミート点`}>
            <line x1={userPosition.x} y1={userPosition.y} x2={meetingForecastPoint.x} y2={meetingForecastPoint.y} />
            <line x1={opponentPosition.x} y1={opponentPosition.y} x2={meetingForecastPoint.x} y2={meetingForecastPoint.y} />
            <circle cx={meetingForecastPoint.x} cy={meetingForecastPoint.y} r="15" />
            <path d={`M ${meetingForecastPoint.x - 6} ${meetingForecastPoint.y - 6} L ${meetingForecastPoint.x + 6} ${meetingForecastPoint.y + 6} M ${meetingForecastPoint.x + 6} ${meetingForecastPoint.y - 6} L ${meetingForecastPoint.x - 6} ${meetingForecastPoint.y + 6}`} />
            <text x={meetingForecastPoint.x + 20} y={meetingForecastPoint.y - 8}>予測ミート</text>
            <text x={meetingForecastPoint.x + 20} y={meetingForecastPoint.y + 5}>約{meetingForecast.seconds}秒先</text>
          </g>
        ) : null}

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

      {comparisons.length > 0 ? (
        <div className="course-legend" aria-label="航跡の凡例">
          <span><i className="legend-line legend-line--actual" />あなた</span>
          {comparisons.map((comparison) => (
            <span key={`${comparison.variant}-${comparison.label}`}>
              <i className={`legend-line legend-line--${comparison.variant === "coach" ? "coach" : "hold"}`} />
              {comparison.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
