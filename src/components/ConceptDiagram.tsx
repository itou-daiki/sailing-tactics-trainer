import type { DiagramKind } from "../domain/lessons";

const LadderLines = ({ angle, highlighted }: { angle: number; highlighted: boolean }) => (
  <g className={highlighted ? "concept-rungs concept-rungs--highlighted" : "concept-rungs"} transform={`rotate(${angle} 250 205)`}>
    {[95, 150, 205, 260, 315].map((y) => <line key={y} x1="35" y1={y} x2="465" y2={y} />)}
  </g>
);

const DiagramBoat = ({ x, y, label, active = false, down = false }: { x: number; y: number; label: string; active?: boolean; down?: boolean }) => (
  <g transform={`translate(${x} ${y}) rotate(${down ? 180 : 0})`}>
    <path className={active ? "concept-boat concept-boat--active" : "concept-boat"} d="M0 -18 L9 15 L0 10 L-9 15 Z" />
    <text transform={`rotate(${down ? 180 : 0})`} x="0" y={down ? 34 : 33} textAnchor="middle">{label}</text>
  </g>
);

export function ConceptDiagram({ kind, angle, revealed }: { kind: DiagramKind; angle: number; revealed: boolean }) {
  const downwind = kind === "downwind";
  const cover = kind === "cover";

  return (
    <svg className="concept-diagram" viewBox="0 0 500 390" role="img" aria-labelledby="concept-diagram-title concept-diagram-desc">
      <title id="concept-diagram-title">戦術判断の図</title>
      <desc id="concept-diagram-desc">風向に直角な線と、左右に離れた2艇の位置関係を示します。</desc>
      <defs>
        <pattern id={`concept-grid-${kind}`} width="25" height="25" patternUnits="userSpaceOnUse">
          <path d="M25 0H0V25" className="concept-grid-line" fill="none" />
        </pattern>
      </defs>
      <rect width="500" height="390" className="concept-water" />
      <rect width="500" height="390" fill={`url(#concept-grid-${kind})`} />

      {!cover ? <LadderLines angle={angle} highlighted={revealed} /> : null}

      {downwind ? (
        <g className="concept-mark" transform="translate(250 340)">
          <path d="M0 -16 L15 13 L-15 13 Z" />
          <text x="0" y="32" textAnchor="middle">風下マーク</text>
        </g>
      ) : (
        <g className="concept-mark" transform="translate(250 45)">
          <path d="M0 -16 L15 13 L-15 13 Z" />
          <text x="0" y="32" textAnchor="middle">風上マーク</text>
        </g>
      )}

      {cover ? (
        <>
          <line className="cover-line" x1="210" y1="155" x2="365" y2="240" />
          <line className="leverage-bracket" x1="210" y1="285" x2="365" y2="285" />
          <text className="diagram-note" x="288" y="310" textAnchor="middle">横の距離を小さくする</text>
          <DiagramBoat x={210} y={155} label="自艇・先行" active />
          <DiagramBoat x={365} y={240} label="相手" />
        </>
      ) : (
        <>
          <DiagramBoat x={145} y={downwind ? 165 : 265} label="左艇" active={revealed && downwind} down={downwind} />
          <DiagramBoat x={355} y={downwind ? 165 : 265} label="右艇" active={revealed && !downwind} down={downwind} />
        </>
      )}

      <g className="diagram-wind" transform={`translate(54 50) rotate(${angle})`}>
        <line x1="0" y1="-22" x2="0" y2="24" />
        <path d="M-7 15 L0 25 L7 15" />
      </g>
      <text className="diagram-wind-label" x="27" y="90">風 {angle === 0 ? "中央" : `右${angle}°`}</text>

      {kind === "return" ? (
        <g className="return-arrow">
          <path d="M390 65 C435 90 435 125 405 145" />
          <path d="M399 134 L404 146 L416 142" />
          <text x="390" y="58">平均風向へ戻る</text>
        </g>
      ) : null}
    </svg>
  );
}
