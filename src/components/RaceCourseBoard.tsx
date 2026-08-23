import {
  RACE_MARK_ZONE_RADIUS,
  RACE_START_LINE,
  RACE_WINDWARD_MARK,
  getRaceStartLineY,
  type FleetBoatState,
  type RaceFrame,
  type RaceReplay,
  type RaceScenarioConfig,
} from "../domain/raceSimulation";
import type { BoatState, Point } from "../domain/simulation";

const VIEW_HEIGHT = 138;
const screenPoint = (point: Point) => ({ x: point.x, y: VIEW_HEIGHT - point.y });

function RaceBoat({
  boat,
  user = false,
}: {
  boat: BoatState | FleetBoatState;
  user?: boolean;
}) {
  const point = screenPoint(boat);
  return (
    <g
      className={user ? "race-boat race-boat--user" : "race-boat race-boat--fleet"}
      transform={`translate(${point.x} ${point.y}) rotate(${boat.heading})`}
      aria-label={user ? "自艇" : `相手艇 ${(boat as FleetBoatState).sailNumber}`}
    >
      <path d="M 0 -3.2 L 1.7 2.6 L 0 1.8 L -1.7 2.6 Z" />
      <line x1="0" y1="-2" x2="0" y2="2.2" />
    </g>
  );
}

const toTrack = (points: Point[]) => points
  .map(screenPoint)
  .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
  .join(" ");

export function RaceCourseBoard({
  config,
  frame,
  replay,
}: {
  config: RaceScenarioConfig;
  frame: RaceFrame;
  replay: RaceReplay;
}) {
  const frameIndex = Math.max(0, replay.frames.findIndex((item) => item.time === frame.time));
  const visibleFrames = replay.frames.slice(0, frameIndex + 1);
  const mark = screenPoint(RACE_WINDWARD_MARK);
  const pinY = VIEW_HEIGHT - getRaceStartLineY(RACE_START_LINE.pin.x, config.condition);
  const committeeY = VIEW_HEIGHT - getRaceStartLineY(RACE_START_LINE.committee.x, config.condition);
  const gustIsLeft = config.condition === "current-push";
  const userLineDelta = frame.lineDeltaBoatLengths;

  return (
    <section className="race-board" aria-label="実戦レース海面">
      <div className="race-board__status" aria-live="polite">
        <span>{frame.time < 0 ? "STARTまで" : "レース経過"}</span>
        <strong>{frame.time < 0 ? `−${Math.abs(frame.time)}秒` : `${frame.time}秒`}</strong>
        <span>{frame.isOcsOutstanding
          ? "OCS：ライン下へ戻る"
          : frame.time <= 0
            ? `ライン ${userLineDelta >= 0 ? "手前" : "越え"} ${Math.abs(userLineDelta).toFixed(1)}艇身`
            : `${frame.rank} / ${config.fleetSize}位`}</span>
      </div>
      <svg
        className="race-board__chart"
        viewBox={`0 0 100 ${VIEW_HEIGHT}`}
        role="img"
        aria-labelledby="race-board-title race-board-desc"
      >
        <title id="race-board-title">420のスタートから第1上マークまでの艇団</title>
        <desc id="race-board-desc">
          オレンジが自艇、紺色が相手艇です。スタートライン、本部艇、ピン、ブロー、潮、3艇身ゾーンを表示します。
        </desc>
        <defs>
          <pattern id="race-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" />
          </pattern>
          <marker id="current-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" />
          </marker>
        </defs>
        <rect className="race-water" width="100" height={VIEW_HEIGHT} />
        <rect className="race-grid" width="100" height={VIEW_HEIGHT} fill="url(#race-grid)" />

        <g className="race-gust" aria-label={gustIsLeft ? "左海面のブロー" : "右海面のブロー"}>
          <path d={gustIsLeft
            ? "M 0 32 C 16 27, 29 33, 40 45 L 40 90 C 27 84, 12 90, 0 83 Z"
            : "M 60 45 C 72 33, 88 28, 100 34 L 100 84 C 87 90, 73 84, 60 91 Z"} />
          <text x={gustIsLeft ? 4 : 70} y="40">PRESSURE</text>
        </g>

        <g className="race-current" aria-label="潮流">
          {[28, 50, 72].map((x) => (
            <line
              key={x}
              x1={x}
              y1="112"
              x2={x + frame.current.x * 90}
              y2={112 - frame.current.y * 90}
              markerEnd="url(#current-arrow)"
            />
          ))}
          <text x="4" y="116">CURRENT</text>
        </g>

        <g className="race-mark-zone" aria-label="第1上マークの3艇身ゾーン">
          <circle cx={mark.x} cy={mark.y} r={RACE_MARK_ZONE_RADIUS} />
          <circle className="race-mark" cx={mark.x} cy={mark.y} r="1.4" />
          <text x={mark.x + 4} y={mark.y - 2}>MARK 1</text>
          <text x={mark.x + 4} y={mark.y + 2}>3 BL ZONE</text>
        </g>

        <g className="race-start-line" aria-label="スタートライン">
          <line x1={RACE_START_LINE.pin.x} y1={pinY} x2={RACE_START_LINE.committee.x} y2={committeeY} />
          <circle cx={RACE_START_LINE.pin.x} cy={pinY} r="1.5" />
          <text x={RACE_START_LINE.pin.x - 1} y={pinY + 5}>PIN</text>
          <path d={`M ${RACE_START_LINE.committee.x - 4} ${committeeY - 1.8} L ${RACE_START_LINE.committee.x + 4} ${committeeY - 1.8} L ${RACE_START_LINE.committee.x + 2.8} ${committeeY + 2} L ${RACE_START_LINE.committee.x - 3} ${committeeY + 2} Z`} />
          <line className="race-committee-mast" x1={RACE_START_LINE.committee.x} y1={committeeY - 2} x2={RACE_START_LINE.committee.x} y2={committeeY - 7} />
          <text x={RACE_START_LINE.committee.x - 3} y={committeeY + 6}>RC</text>
        </g>

        <polyline className="race-track race-track--user" points={toTrack(visibleFrames.map((item) => item.user))} />
        {frame.fleet.map((boat) => <RaceBoat key={boat.id} boat={boat} />)}
        <RaceBoat boat={frame.user} user />

        <g className="race-wind-arrow" transform={`translate(8 13) rotate(${frame.windAngle})`} aria-label={`風向 ${frame.windAngle.toFixed(0)}度`}>
          <line x1="0" y1="7" x2="0" y2="-5" />
          <path d="M -2 -2 L 0 -6 L 2 -2" />
          <text x="4" y="0">WIND</text>
        </g>
      </svg>
      <div className="race-board__legend" aria-label="海面図の凡例">
        <span><i className="is-user" />あなた</span>
        <span><i className="is-fleet" />艇団</span>
        <span><i className="is-pressure" />ブロー</span>
        <span><i className="is-zone" />3艇身ゾーン</span>
      </div>
    </section>
  );
}
