import type { ScenarioReplay } from "../domain/simulation";
import { BOAT_LENGTH_PX, SCENARIO_DURATION } from "../domain/simulation";

const phaseExplanation = (time: number) => {
  if (time < 4) return "まだ平均風向です。2艇の横の距離に注目してください。";
  if (time < 10) return "右側にいる自艇が、右振れによる暫定ゲインを得ています。";
  if (time <= 16) return "右振れは最大です。前をクロスできれば、ゲインを位置関係に変えられます。";
  if (time < 28) return "風が戻っています。横に離れたままだと、暫定ゲインも小さくなります。";
  return "風は平均へ戻りました。残った差は、航跡とタックのタイミングで生まれた差です。";
};

export function ReplayPanel({
  replay,
  time,
  onTimeChange,
}: {
  replay: ScenarioReplay;
  time: number;
  onTimeChange: (time: number) => void;
}) {
  const current = replay.frames[time];
  let maxGain = Number.NEGATIVE_INFINITY;
  for (const frame of replay.frames) {
    maxGain = Math.max(maxGain, frame.relativeGain / BOAT_LENGTH_PX);
  }

  return (
    <section className="replay-panel" aria-labelledby="replay-heading">
      <div className="section-kicker">REPLAY / 振り返る</div>
      <h2 id="replay-heading">差が動いた瞬間を見よう</h2>

      <div className="timeline-readout">
        <strong>{time}秒</strong>
        <span>{phaseExplanation(time)}</span>
      </div>

      <input
        className="timeline-slider"
        type="range"
        min="0"
        max={SCENARIO_DURATION}
        step="1"
        value={time}
        aria-label="リプレイ時刻"
        onChange={(event) => onTimeChange(Number(event.target.value))}
      />

      <div className="event-strip" aria-label="重要な出来事">
        {replay.events.map((event) => (
          <button
            key={`${event.kind}-${event.time}`}
            type="button"
            className={time === event.time ? "event-chip event-chip--active" : "event-chip"}
            onClick={() => onTimeChange(event.time)}
          >
            <span>{event.time}秒</span>
            {event.label}
          </button>
        ))}
      </div>

      <dl className="live-measures">
        <div>
          <dt>相手との差</dt>
          <dd>{current.relativeGain >= 0 ? "+" : ""}{(current.relativeGain / BOAT_LENGTH_PX).toFixed(1)}艇身</dd>
        </div>
        <div>
          <dt>横の距離</dt>
          <dd>{(current.leverage / BOAT_LENGTH_PX).toFixed(1)}艇身</dd>
        </div>
        <div>
          <dt>最大の暫定ゲイン</dt>
          <dd>+{maxGain.toFixed(1)}艇身</dd>
        </div>
      </dl>

      <div className="coach-note">
        <span className="coach-note__tape">なぜ？</span>
        <p>{phaseExplanation(time)}</p>
      </div>
    </section>
  );
}
