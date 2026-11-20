/** 新規ブックの初期内容(フロントマターのみ) */
export const BLANK_BOOK_SOURCE = `---
title: 無題のブック
timeLimit: 600
---

`;

/** 「サンプル」ボタンとトップの体験用(記法の一通りを含む) */
export const SAMPLE_SOURCE = `---
title: 日本史 基礎
description: 古代〜中世の確認テスト
tags: [history, japan]
lang: ja
timeLimit: 600
practiceFeedback: true
shuffle: { questions: false, choices: true }
normalize: { kana: false }
---

@text
# 第1章 古代

## 1-1 飛鳥時代
@end

聖徳太子は [[603]] 年に冠位十二階を制定した。

@q points=2
聖徳太子が制定した憲法を答えよ。
[[十七条憲法 | 十七条の憲法 | 17条憲法]]
@explain
604 年に制定された。冠位十二階は 603 年。
@end

@q type=single
冠位十二階が定められたのはいつか。
- [x] 603 年
- [ ] 593 年
- [ ] 645 年
- [ ] 701 年
@end

| 時代 | 人物 | 出来事 |
|------|------|--------|
| 飛鳥 | [[蘇我馬子]] | 仏教導入 |
| 奈良 | [[聖武天皇]] | [[?大仏造立 \\| 平安遷都 \\| 承久の乱]] |

@q type=multi
次のうち室町時代のものをすべて選べ。
- [x] 勘合貿易
- [ ] 墾田永年私財法
- [x] 応仁の乱
@explain
墾田永年私財法は奈良時代の政策。
@end

@q type=truefalse answer=false
冠位十二階は 604 年に制定された。
@end

@q type=essay points=5
飛鳥時代の政治改革を 100 字程度で説明せよ。
@model
冠位十二階によって氏族の序列を再編し、十七条憲法で官僚の心構えを示した。
@end

数値の確認: 円周率は [[=3.14 ±0.01]]、正規表現は [[/^[A-Z][a-z]+$/]]。
`;
