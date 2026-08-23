# SHIFT｜420 TACTICS Web調査メモ

調査日: 2026-08-23
追補調査日: 2026-08-24

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
| [World Sailing: Picture Perfect Start To Key West 2010](https://www.sailing.org/2010/01/19/picture-perfect-start-to-key-west-2010/) | 7〜10ktのオシレーティングな風で、選手報告の振れ幅は5〜50°。複数回のシフトごとにゲイン／ロスの機会があり、シフトを拾った回数が戦術結果に結びついた | 1回だけ振れて静止する標準海面をやめ、右 → 左 → 右の振れをマーク到達まで反復する。最初の操作だけでなく全操作を評価する |
| [World Sailing: 420 Class Launches Online Training Video](https://www.sailing.org/2011/06/02/420-class-launches-online-training-video/) | 初心者と経験者の両方を対象に、異なる風・海面でマニューバー時に考える点を示し、視聴・実践・レビューの反復を勧める | SHIFT LABを `観察 → 操作 → 全ポイントのレビュー → 再試行` の短い循環にする。総合得点より、各マニューバーの根拠を分解する |
| [World Sailing Racing Rules](https://www.sailing.org/inside-world-sailing/rules-regulations/racingrules/) / [2025–2028 RRS with Changes and Corrections](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf) | 現行ルールは2025–2028版。Rule 10ではポート艇がスターボード艇を避け、Rule 13ではタック中の艇がクローズホールドになるまで他艇を避け続ける | 「前後ゲインがプラスならベア」とは解釈しない。ミートを早期予測し、タック中も避けられる時間があれば先にタック、安全余地がない場合だけベアする |
| [2025–2028 RRS with Changes and Corrections](https://media.sailing.org/sailing/wp-content/uploads/2025/07/29083752/2025-2028-RRS-with-Changes-and-Corrections.pdf) | Rule 26は予告5分、準備4分、1分、スタート0分の信号系列。Rule 29.1はスタート時にコース側の艇があればX旗で個別リコールを知らせる。Rule 18のゾーンは艇長3艇身 | RACE LABを最後の60秒から開始して既に進行中の信号系列を見せ、スタート時のライン越えをX旗とリプレイに残す。上マークは3艇身ゾーンを可視化する |
| [World Sailing Race Management Manual](https://www.sailing.org/tools/documents/RaceManagementManualJuly2019-%5B25256%5D.pdf) | レース運営では、風と潮流に合わせたコース調整、スタート手順、風上・風下コースやオリンピック・トラペゾイドの設営を扱う | マークだけの抽象画面ではなく、RC艇、ピン、スタートライン、風向、潮流、風上マークを一つの海面として読む。ただし初版は第1上マークまでに絞る |
| [2024 International 420 Asian & Oceanian Championships Sailing Instructions](https://2024aoc.420sailing.org/uploaded_files/Document_92518_20240428110051_en.pdf) | 予告信号時までにコースと第1レグのコンパス方位を示し、オレンジ旗の間をスタートラインとする。マーク1、2、3s/p、4s/pを使うコースと、45分のターゲットタイムを定める | 420のレース画面にはコース情報、RC艇、ピン、上マークを置く。全コースを薄く再現せず、最初の実践課題をスタートからMark 1までと明示する |
| [2025 International 420 North American Championships Sailing Instructions](https://www.regattanetwork.com/clubmgmt/regatta_uploads/28946/I420.2025.SI.pdf) | RRS 26によるスタート、RC艇とピン、コース方位・距離、OCS艇の通知、マーク・フィニッシュ、45分のターゲットタイムを規定する | 大会ごとのSIで詳細が変わることを前提に、RACE LABは共通して読める信号・ライン・第1レグに限定する。OCS音声通知などを普遍的ルールとは扱わない |
| [US Sailing Match Racing Quiz — Black Diamond](https://www.ussailing.org/wp-content/uploads/2021/07/Match-Racing-Quiz-Black-Diamond-July-2021-Answers.pdf) | 反対タックで収束する場面について、相手のラインへ達する直前のタックや、相手の反応を見越した早い判断を具体例で扱う | ミート地点で反応するAIではなく、収束を予測して数秒前に判断するAIにする |
| [North U: Upwind Tactics One on One](https://www.northsails.com/en-us/blogs/north-sails-blog/north-u-upwind-tactics-one-on-one-bill-gladstone) | レイライン付近の1対1でも、lee-bow、cross & tack、継続、delayed tackという複数の選択肢がある | 単一の「正解」を規則から演繹しない。今回は初心者向け基本反応を実装し、発展戦術は別ドリルに分ける |
| [Sailing World: Controlling the Cross](https://www.sailingworld.com/how-to/controlling-the-cross/) | ポート艇にはcross、duck、lee-bowがあり、ダックは右側へ進み続けたい戦略では有効だが距離を失う。遅い判断はリスクを上げる | ベアを「前にいるから」ではなく、「タックを安全に完了する時間が残らない」近距離の回避として扱う |

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
| [SAILSHIFT](https://xgl100.itch.io/sailshift) | 複数の風の振れと、自動／手動の相手艇を切り替え、タック時刻で2艇を競わせる | 相手AIを単なる固定時刻ではなく、風・艇間距離・予測ミートに反応させる |
| [ABC Tools Sailing & Tacking Simulator](https://abc.tools/sim/sailing-simulator/) | 風の場、ポーラ、VMG、レイライン、最適ルーターとの比較をブラウザ内で表示する | 物理量を増やすだけでなく、「どの情報から判断したか」をリプレイで言葉にする点を差別化にする |
| [Tactical Sailing Simulator](https://tss.boats/) | コーチと選手が同じ端末で前進／タックを選び、保存した試走を後から分析できる | スマホ1台で声に出して判断し、URL共有とリプレイでチームの対話につなげる |

## 学習科学から得た設計判断

| 出典 | 確認した知見 | 実装への反映 |
| --- | --- | --- |
| [Retrieval Practice: Feedback](https://www.retrievalpractice.org/strategies/2018/5/25/feedback) | 正誤だけより説明を含むフィードバックが転移を助け、低い緊張で行うことが推奨される | 点数を付けず、操作なしとの差と理由を文章で説明する |
| [Retrieval Practice summary](https://www.retrievalpractice.org/summary) | 低リスクの想起、説明的フィードバック、メタ認知を組み合わせる | 走る前の予定を外化し、終わった後にその変更理由を問う |
| [Prediction before feedback study](https://pubmed.ncbi.nlm.nih.gov/34634998/) | 内容を見る前に予測を試みた条件で、読むだけより保持が向上した研究 | リプレイ前ではなく、スタート前に最初の操作時刻を決める |
| [Self-explanation and worked examples review](https://pmc.ncbi.nlm.nih.gov/articles/PMC8379662/) | 自己説明は概念の統合や転移を支えうるが、複雑すぎる例には適切な促しが必要 | 「何を見て予定を変えたか」を風・相手・マークの3候補に絞る |
| [Feedback and motor-skill learning in physical education](https://pubmed.ncbi.nlm.nih.gov/34200657/) | 23研究のレビューで、フィードバックはフィードバックなしより生徒の運動技能学習に有効という強い証拠が示された | 結果だけでなく、ミート予測・必要時間・安全余裕という過程フィードバックを直後のリプレイに出す |
| [CAST UDL Guidelines 3.0](https://udlguidelines.cast.org/) | 学習者の主体性を目標に、既有知識との接続、重要情報の強調、段階的支援、目標設定、進捗のモニタリング、転移を支える | 初級は見る情報を3つに絞って判断点で止め、中級では支援を外して複数条件を自分で組む |
| [Butler & Winne: Feedback and Self-Regulated Learning](https://doi.org/10.3102/00346543065003245) | 学習者は目標、方略、結果を照合して内的フィードバックをつくり、外的フィードバックがその調整を支える | 数値を見せる前に自分の改善点を選ばせ、リプレイ記録との一致／見落としを返す |
| [Llorens et al.: Formative feedback to support transfer](https://doi.org/10.1111/jcal.12134) | 形成的フィードバックを転移可能な学習へつなぐ設計を検討している | 評価を総合点で終えず、「次の1走で観察して行うこと」まで具体化する |

## バイアス監査

### 今回取り除いた仮定

- 誤り: 自艇の前後ゲインがプラスなら、ポート艇はタックせずベアする。
- 根拠不足だった理由: RRSは回避義務とタック中の義務を定めるが、前後ゲインを行動選択の閾値にはしていない。戦術資料も、ダックをコース戦略と安全余地を含む選択肢として扱う。
- 修正: 反対タックの航跡から最接近時刻と距離を予測し、教材上のタック回復4秒＋安全1秒を確保できれば早めにタックする。5秒未満だけベアする。

### まだ検証が必要な仮定

- 12秒の予測範囲、4秒のタック回復、1秒の安全余裕は、420の公式ポーラや実測研究から得た値ではない。
- 現段階では判断の因果を見やすくする教育用パラメータであり、420選手・コーチによる実艇データとシナリオ評価で校正する。
- ダック、lee-bow、cross & tackの選択は風の戦略、艇速差、波、潮、フリート位置で変わる。基本AIにすべてを混ぜず、発展ドリルとして段階的に追加する。

### 「実際のレース環境」を扱う際に抑えた過剰主張

- 実装したのは、スタート60秒前から第1上マークまでに選手が読む主要情報を圧縮した教育用シナリオであり、実海面そのものの再現ではない。
- 信号時刻、X旗、ポート／スターボード、3艇身ゾーンの根拠はRRSに置く。一方、艇速、タックロス、潮流、風圧帯、ダーティーエア、相手艇の意思決定は公式420ポーラではなく教育用パラメータである。
- RRS 10／18の表示は「ここをリプレイで確認する」という注意喚起に限定する。オーバーラップ、マークルームの権利、接触、ペナルティー、抗議審問を自動判定しない。
- 大会ごとに帆走指示書、コース、信号、OCS通知方法は変わる。現地では必ずその大会のNOR／SIを優先する。
- 波、艇ごとの速度差、クルーワーク、視界、疲労、通信の失敗は未再現であり、アプリの好結果が実艇での安全や順位を保証するものではない。

## 実装した優先事項

1. 目的が分かる4つの420向けコーチドリルを、自由設定より先に置く。
2. スタート前に最初のタック／ジャイブ予定を宣言する。
3. リプレイで `PLAN → DO → REVIEW` を表示し、予定どおりかと戦術的に有利かを分ける。
4. 風、レグ、振れ戻り、速度、艇間距離、相手の反応をURLへ保存し、登録なしで共有する。
5. Web Shareが使えない端末ではClipboard、さらに失敗した場合は手動コピーへ段階的に戻す。
6. 相手艇はミートを12秒先まで予測し、安全にタックを完了できる場合はミート前にタックする。
7. リプレイに「MEET CHECK」を置き、予測秒数と安全余裕から相手の判断を自己説明する。
8. RACE LABを追加し、8艇のスタートから第1上マークまで、信号、ライン有利側、潮流、風圧帯、振れ戻り、ダーティーエアを同時に読む。
9. 個別リコール後はライン下へ戻って再スタートする操作を求め、RRS 10の注意場面、3艇身ゾーン進入とともにリプレイイベントとして残す。
10. 順位だけでなく、クリーンエア率、リフト側を走れた割合、スタートからMark 1までの順位増減を示し、クルーへ伝える短い言葉へ変換する。
11. RACE LABを初級4艇と中級8艇に分け、初級は見る情報をライン、クリーンエア、マーク前の相手関係へ絞る。
12. 初級では残り30秒、スタート後の乱れた風、マーク5艇身前で自動停止し、判断を声に出してから再開する。OCS時はスタートでも停止する。
13. リプレイ数値を表示する前に自分の改善点を選び、スタート、レーン、シフト、権利、統合の優先順で次の1走を提案する。
14. OCS未解消、OCS回復、規則リスク、クリーンエア率、リフト側率という観察可能な記録から次課題を決め、判定を単体テストする。
15. ホームの主入口をSHIFT LABへ変更し、「タック／ジャイブする場所」を単独の学習対象にする。
16. 標準風を、右振れ・平均通過・左振れ・平均通過の連続波形へ変更する。
17. ライブ中に `WIND MOVE → NOW → CALL` を表示し、風の変化方向、現在のタックの有利不利、維持／操作の根拠を言葉で結ぶ。
18. 実行した全タック／ジャイブをPOINT LOGに残し、各1点だけを4秒早く・今回・4秒遅くした試走で比較する。

## 独自ポジション

SHIFTは、GPS解析製品や大画面向け総合シミュレーターの縮小版を目指さない。

`420専用 × タック／ジャイブポイント × スマホ優先 × 登録不要 × 海に出る前`

この組み合わせを核にする。数値モデルは単純であることを明示し、複雑な実海面の再現よりも、判断の因果を説明できることを優先する。

## 次に検証すること

- 420部員とコーチが共有URLだけで同じ練習を開始できるか
- 予定時刻を先に決めることで、リプレイ中の発話と説明が具体的になるか
- 320px幅で、初級／中級の選択からスタートまで迷わず進めるか
- チーム内で、操作なし・自分・前後4秒の3航跡を説明に使えるか
- 次段階として、端末内の試行記録を書き出す価値があるか
- スタート前の声かけを入力してから走ることで、実艇のヘルム／クルー間の共有が具体的になるか
- RRS 10／18の注意表示が、規則の誤学習を生まずに「SIとルールブックで確認する」行動へつながるか
- 初級4艇で「見る順番」を習得したあと、中級8艇でも自艇、次の危険、マークまでの意図を迷わず読めるか
- 自動停止で声に出した学習者が、停止なしの学習者より遅延テストで判断理由を説明できるか
- 自己評価とリプレイの見立てが繰り返し一致するようになるか
- 1回の振れ戻りで理解した学習者が、反復する振れで「毎回返さず、今のタックの有利不利を言う」課題へ転移できるか
- POINT LOGの2点以上について、風向だけでなく「風が動く向き」と「操作ロス」を使って理由を説明できるか

## 調査上の制約

比較は各サービスの公開ページとストア記載を対象にした。すべての有料機能を実機評価した比較ではないため、価格、搭載機能、対応端末は実装判断のたびに再確認する。
