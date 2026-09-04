---
title: md還是html，這是個蠢問題
gap: 0.5
---

## opening
前兩天，[[cue:thariq]]Claude Code 團隊的 Thariq 發表了一篇熱門文章。
標題就一句話，HTML 是新的 markdown。
他說他幾乎不再寫 md 檔案了，全都交給 AI 產生 HTML。
500 萬閱讀，X 上馬上吵翻了。
一派是 md 黨，[[cue:two-camps]]覺得 md 才是 AI 時代的原始碼。
另一派覺得 Thariq 說得對，HTML 才是終極答案。

## md-side
md 黨的證據其實很有說服力。
你看 OpenAI 去年發的 AGENTS.md，[[cue:agents-md]]60000 多個專案用，AWS、Anthropic、Google、微軟、OpenAI，AI 界的半壁江山一起捐給 Linux Foundation 做開放標準。
Karpathy 的 llm-wiki，主體就是三層 markdown，單一個 CLAUDE.md 檔案，5 萬 star。
Cloudflare 實測過一組資料，[[cue:token-saving]]同一篇部落格，HTML 一萬六千 token，轉成 md 只要三千。
省 80%。
GitHub 官方也講過一句，檔案不再是描述程式碼，[[cue:doc-is-code]]檔案就是程式碼。

## html-side
但 html 黨也沒說錯。
Thariq 那篇文章裡幾條論據我都同意。
第一是空間資訊。[[cue:spatial]]diff、呼叫圖、架構圖，本來就是有空間維度的，md 把它壓成一行字，html 能左右對照，理解效率根本不在同一個層級。
第二是動態體驗。[[cue:dynamic]]做產品原型，按下按鈕會呈現什麼顏色、什麼 easing 曲線，文字描述再多沒用，html 能讓你直接看見。
第三是結構化閱讀。[[cue:structured]]可摺疊章節、tab 程式碼區塊、邊欄術語表，把同樣的文字線性堆疊，完全是兩種東西。
Anthropic 現在的 Live Artifacts，HTML 已經從靜態產物升級成可以互動、能抓取即時資料的 dashboard。

## the-real-question
我看完想說，[[cue:reveal]]這兩個根本是在爭一個蠢問題。
兩邊都贏了。
但贏的是不同的問題。
md 黨回答的是，[[cue:question-md]]我們用什麼寫。
html 黨回答的是，[[cue:question-html]]我們給人什麼看。
這是兩個問題。
怎麼會有誰取代誰。

## the-split
我覺得真問題是這個。
md 和 html 不是取代關係，[[cue:split]]是分工關係。
以前你寫 md 自己也看 md。
那時候要折衷，所以 md 勝出。
但 AI 出現後，[[cue:ai-changes]]第一次有了一個新情況。
生產成本可以被 AI 吸收。
HTML 那部分太重的代價，AI 替你扛。
你只負責消費。
原來要折衷的需求，被拆成了兩端各自的最佳解。
生產端要輕、要快、要 token efficient，[[cue:md-side-win]]那就是 md。
消費端要豐富、要視覺化、要容易分享，[[cue:html-side-win]]那就是 html。
兩端各自登頂。
中間的折衷位置，沒人需要了。

## activity-proof
最乾淨的實際案例是 Thariq 自己。
3 月他發表了《Skills 指南》，[[cue:thariq-march]]強調核心還是 markdown。
5 月他發表了《HTML is the new markdown》。
同一個人，[[cue:same-person]]兩端各自登頂，互不衝突。
Karpathy 和 Lex Fridman 這組搭配也一樣。
核心是 markdown wiki，[[cue:karpathy-lex]]外殼是動態 HTML。
不是 Lex 取代了 Karpathy，是他在 Karpathy 的基礎上加了一層消費層。

## closing
所以下次你想吵這個的時候，[[cue:final]]先問自己一句。
你現在面對的是「寫」，還是「看」。
寫，[[cue:md-final]]用 md。
看，[[cue:html-final]]用 html。
工具替你處理切換。
立場可以放下了。
