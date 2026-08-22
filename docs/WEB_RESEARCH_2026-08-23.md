# SHIFT｜420 TACTICS Web調査メモ

調査日: 2026-08-23

## 調査の問い

高校・大学の420チームが陸上で戦術判断を練習するとき、既存サービスより選ばれるためにSHIFTへ何を足すべきか。

公開ページと一次資料を対象に、次の4点を比較した。

- セーリングコーチングで推奨される練習の流れ
- シミュレーターと実艇リプレイ製品の強み
- モータースポーツ系ゲームの反復練習設計
- 予想、フィードバック、自己説明に関する学習科学

## 一次資料から得た基準

| 出典 | 確認した内容 | SHIFTへの判断 |
| --- | --- | --- |
| [World Sailing Technical Courses for Coaches](https://www.sailing.org/inside-world-sailing/activities-services/training-development/instructor-coach-programmes/technical-courses-for-coaches/) | Level 2は、スピード・戦術・戦略について構造化したレーストレーニングを計画、実施するコーチを対象にする | 自由操作だけでなく、目的を絞ったドリル入口を用意する |
| [World Sailing Level 1 Coach Syllabus](https://www.sailing.org/tools/documents/ISAFLevel1TechnicalCourse324.05.13-%5B15060%5D.pdf) | 練習を `Plan – Do – Review` として組み、brief、実施、debriefをつなぐ | 操作前の予定時刻、実行時刻、リプレイを一続きにする |
| [World Sailing Level 2 Coach Syllabus](https://www.sailing.org/tools/documents/ISAFLevel2TechnicalCourseSyllabus-%5B18133%5D.pdf) | 目的、学習成果、陸上ドリル、対話型理論、recap/debrief、映像資源を組み合わせる | 各プリセットに「何を見る練習か」を明記し、結果だけで終わらせない |
| [International 420 Class online training resource](https://www.sailing.org/2015/05/05/international-420-class-launches-new-online-training-resource/) | 420向けExercise e-Bookは、選んだ練習を段階化し、目的、必要物、評価、動画・アニメーション、debrief notes、progress benchmarkをまとめている | 420専用ドリルと振り返り問いを製品の中心に置く |
| [World Sailing Racing Rules](https://www.sailing.org/inside-world-sailing/rules-regulations/racingrules/) | 現行ルールは2025–2028版。Case Bookなど、事例で判断を学ぶ公式資料がある | 将来の航路権モードは現行ルールと公式事例を根拠に別モジュール化する |

## 類似サービス・ゲームの比較

| サービス | 公開情報から確認した強み | SHIFTが取る位置 |
| --- | --- | --- |
| [SailPro Sim](https://www.sailpro.app/racing-simulator) | スタート有利、レイライン、風の振れ、フリート戦術まで扱う本格シミュレーター。PC、ノートPC、TV、大画面を推奨 | スマホで短く反復できる420専用の学習導線で差別化 |
| [Week to Regatta](https://regatta.icoffio.com/?lang=en) | インストール不要、多言語、短いシナリオ、操作後の説明、5分単位の入門構成 | 基礎一般ではなく、振れ戻り・レバレッジ・対艇ゲインを深く扱う |
| [Sail Tactician](https://apps.apple.com/us/app/sail-tactician/id6741540409) | ガイド付きドリル、カスタムワークアウト、リプレイスクラバー、タック／ジャイブ評価、複数艇比較 | GPSや購読なしで、海に出る前の仮説練習を提供する |
| [RaceQs](https://raceqs.com/race-analytics/) | GPSの3Dフリートリプレイ、艇同士の比較、タック時間・角度・ロス、共有とdebrief | 同じ海面URLと仮想航跡比較を、チーム導入の基本機能にする |
| [Sailmon Relive](https://sailmon.com/support-articles/relive-your-activity/) / [Hubs](https://sailmon.com/hubs/) | 同一レグの選手比較、テレメトリ選択、イベント・コース・リプレイ・ランキングの共有 | ランキングより、コーチが同条件を配り選手同士で判断理由を比べる用途を優先 |
| [SailingMetrics](https://sailingmetrics.com/) | 複数選手のGPS重ね合わせ、タック／ジャイブ分析、速度ヒートマップ | 実艇ログ連携は後段とし、現在は判断の因果を単純な教育モデルで見せる |
| [RegaTTac](https://regattac.com/) | コーチがシナリオを組み、GPS、動画、マーク、リプレイを一つの画面で扱う | まずURLだけで配れる再現可能な海面を完成させる |
| [F1 22 Time Trial](https://www.ea.com/able/resources/f1-22/steam/time-trial) | 自己ベストやライバルのゴーストと、同条件で反復比較できる | 操作なし、今回、前後4秒の仮想試走を同じ海面のゴーストとして重ねる |

## 学習科学から得た設計判断

| 出典 | 確認した知見 | 実装への反映 |
| --- | --- | --- |
| [Retrieval Practice: Feedback](https://www.retrievalpractice.org/strategies/2018/5/25/feedback) | 正誤だけより説明を含むフィードバックが転移を助け、低い緊張で行うことが推奨される | 点数を付けず、操作なしとの差と理由を文章で説明する |
| [Retrieval Practice summary](https://www.retrievalpractice.org/summary) | 低リスクの想起、説明的フィードバック、メタ認知を組み合わせる | 走る前の予定を外化し、終わった後にその変更理由を問う |
| [Prediction before feedback study](https://pubmed.ncbi.nlm.nih.gov/34634998/) | 内容を見る前に予測を試みた条件で、読むだけより保持が向上した研究 | リプレイ前ではなく、スタート前に最初の操作時刻を決める |
| [Self-explanation and worked examples review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8379662/) | 自己説明は概念の統合や転移を支えうるが、複雑すぎる例には適切な促しが必要 | 「何を見て予定を変えたか」を風・相手・マークの3候補に絞る |

## 実装した優先事項

1. 目的が分かる4つの420向けコーチドリルを、自由設定より先に置く。
2. スタート前に最初のタック／ジャイブ予定を宣言する。
3. リプレイで `PLAN → DO → REVIEW` を表示し、予定どおりかと戦術的に有利かを分ける。
4. 風、レグ、振れ戻り、速度、艇間距離、相手の反応をURLへ保存し、登録なしで共有する。
5. Web Shareが使えない端末ではClipboard、さらに失敗した場合は手動コピーへ段階的に戻す。

## 独自ポジション

SHIFTは、GPS解析製品や大画面向け総合シミュレーターの縮小版を目指さない。

`420専用 × スマホ優先 × 登録不要 × 海に出る前 × 予定と理由を振り返る`

この組み合わせを核にする。数値モデルは単純であることを明示し、複雑な実海面の再現よりも、判断の因果を説明できることを優先する。

## 次に検証すること

- 420部員とコーチが共有URLだけで同じ練習を開始できるか
- 予定時刻を先に決めることで、リプレイ中の発話と説明が具体的になるか
- 320px幅で、プリセット選択からスタートまで迷わず進めるか
- チーム内で、操作なし・自分・前後4秒の3航跡を説明に使えるか
- 次段階として、端末内の試行記録を書き出す価値があるか

## 調査上の制約

比較は各サービスの公開ページとストア記載を対象にした。すべての有料機能を実機評価した比較ではないため、価格、搭載機能、対応端末は実装判断のたびに再確認する。
