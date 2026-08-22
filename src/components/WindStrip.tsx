import { getWindAngle, SCENARIO_DURATION } from "../domain/simulation";

export function WindStrip({ time }: { time: number }) {
  const angle = getWindAngle(time);
  const status = angle === 0 ? "平均風向" : angle >= 9.5 ? "右振れ 最大" : time <= 16 ? "右へ振れている" : "平均へ戻っている";
  const points = Array.from({ length: SCENARIO_DURATION + 1 }, (_, index) => {
    const x = (index / SCENARIO_DURATION) * 260;
    const y = 36 - getWindAngle(index) * 2.4;
    return `${x},${y}`;
  }).join(" ");
  const cursorX = (time / SCENARIO_DURATION) * 260;

  return (
    <section className="wind-strip" aria-label="風向の変化">
      <div className="wind-strip__instrument">
        <div className="wind-arrow" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
          <span>↓</span>
        </div>
        <div>
          <span className="readout-label">現在の風</span>
          <strong>{angle === 0 ? "中央" : `右 ${angle.toFixed(0)}°`}</strong>
        </div>
      </div>
      <div className="wind-strip__graph">
        <div className="wind-strip__status">{status}</div>
        <svg viewBox="0 0 260 44" role="img" aria-label="右振れしてから平均風向へ戻るグラフ">
          <line x1="0" y1="36" x2="260" y2="36" className="wind-mean-line" />
          <polyline points={points} className="wind-history-line" />
          <line x1={cursorX} y1="3" x2={cursorX} y2="42" className="wind-cursor" />
        </svg>
      </div>
    </section>
  );
}
