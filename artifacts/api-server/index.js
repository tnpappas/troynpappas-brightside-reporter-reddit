const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());

const SUBREDDITS = [
  { name: "UpliftingNews", brand: "BrightSideReport" },
  { name: "GoodNews", brand: "BrightSideReport" },
  { name: "OptimistsUnite", brand: "BrightSideReport" },
  { name: "MadeMeSmile", brand: "BrightSideReport" },
  { name: "HumansBeingBros", brand: "BrightSideReport" },
  { name: "GetMotivated", brand: "TimelessAchievement" },
  { name: "Stoicism", brand: "TimelessAchievement" },
  { name: "Productivity", brand: "TimelessAchievement" },
  { name: "getdisciplined", brand: "TimelessAchievement" },
  { name: "Productivitycafe", brand: "TimelessAchievement" },
  { name: "Entrepreneur", brand: "MyDrivenThreads" },
  { name: "smallbusiness", brand: "MyDrivenThreads" },
  { name: "GymMotivation", brand: "MyDrivenThreads" },
  { name: "Newsletters", brand: "BrightSideReport" },
  { name: "Journalism", brand: "BrightSideReport" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRSS(xml, subreddit) {
  const posts = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const item of items.slice(0, 8)) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || "";
    const link = (item.match(/<link>(.*?)<\/link>/) || item.match(/<comments>(.*?)<\/comments>/) || [])[1] || "";
    const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || "";
    const comments = parseInt((item.match(/(\d+) comment/) || [])[1] || "0", 10);
    const upvotes = parseInt((item.match(/(\d+) point/) || [])[1] || "0", 10);
    const clean = desc.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim().slice(0, 300);
    if (title.length > 5) posts.push({ id: Math.random().toString(36).slice(2), subreddit: subreddit.name, brand: subreddit.brand, title: title.trim(), text: clean, upvotes, comments, url: link.trim() });
  }
  return posts;
}

async function fetchSubreddit(sub) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub.name}/hot/.rss?limit=8`, {
      headers: { "User-Agent": "BrightSideReporter/1.0", "Accept": "application/rss+xml, text/xml" },
    });
    console.log(`r/${sub.name}: ${res.status}`);
    if (!res.ok) return { name: sub.name, posts: [], error: res.status };
    const xml = await res.text();
    const posts = parseRSS(xml, sub);
    console.log(`r/${sub.name}: ${posts.length} posts`);
    return { name: sub.name, posts };
  } catch (e) {
    console.log(`r/${sub.name}: ${e.message}`);
    return { name: sub.name, posts: [], error: e.message };
  }
}

async function analyzePosts(posts) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const top = posts.sort((a, b) => b.comments - a.comments).slice(0, 20);
  const prompt = `Analyze these Reddit posts for Troy (BrightSideReporter). His brands:
1. BrightSideReport.com — positive news aggregator
2. Timeless Achievement YouTube — https://youtube.com/@TimelessAchievement
3. My Driven Threads — https://mydriventhreads.com

Troy: Virginia Beach entrepreneur, 16 years sober, runs 3 service businesses. Real person, not a marketer.
Rules: 90/10 genuine/promo. Never lead with a link. Only mention brands when genuinely helpful.

POSTS:
${top.map((p, i) => `[${i}] r/${p.subreddit} (${p.brand}) | ${p.upvotes} upvotes, ${p.comments} comments\nTitle: ${p.title}${p.text ? `\nBody: ${p.text}` : ""}`).join("\n\n")}

Return ONLY valid JSON array, no markdown, pick best 6:
[{"idx":0,"relevance":0,"engagement":0,"promoFit":0,"risk":"Low","why":"","draft":"","includeLink":false,"linkUrl":""}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text || "[]";
  const recs = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return recs.map((r) => ({ ...r, post: top[r.idx] })).filter((r) => r.post)
    .sort((a, b) => (b.relevance + b.engagement + b.promoFit) - (a.relevance + a.engagement + a.promoFit));
}

app.get("/api/scan", async (req, res) => {
  try {
    const results = [];
    for (const sub of SUBREDDITS) { results.push(await fetchSubreddit(sub)); await sleep(400); }
    const allPosts = results.flatMap((r) => r.posts);
    const subStatus = results.map((r) => ({ name: r.name, count: r.posts.length }));
    console.log(`Total posts: ${allPosts.length}`);
    if (allPosts.length === 0) return res.json({ subStatus, recommendations: [], totalPosts: 0 });
    const recommendations = await analyzePosts(allPosts);
    res.json({ subStatus, recommendations, totalPosts: allPosts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/subreddits", (req, res) => res.json(SUBREDDITS));

app.post("/api/reply", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  const { postContent, subreddit, tone } = req.body;
  if (!postContent) return res.status(400).json({ error: "Post content required" });
  const tones = { genuine: "Purely genuine, no brand mention.", subtle: "Genuine first, brand only if natural at end.", value: "Lead with insight, reference brand resource if relevant." };
  const prompt = `Write a Reddit response for Troy (BrightSideReporter).
Troy: Virginia Beach entrepreneur, 16 years sober, owns 4 businesses, loves classic success philosophy (James Allen, Wattles, Marcus Aurelius). Authentic, warm, direct.
Brands (only if genuinely relevant): BrightSideReport.com, https://youtube.com/@TimelessAchievement, https://mydriventhreads.com
Tone: ${tones[tone] || tones.genuine}
Subreddit: ${subreddit ? `r/${subreddit}` : "not specified"}
Rules: Write as Troy the person. Lead with real value. No "great post!" openers. 2-5 sentences. No upvote requests.

POST:
---
${postContent.trim()}
---

Return ONLY valid JSON, no markdown:
{"assessment":"","riskLevel":"Low","riskReason":"","response":"","includeLink":false,"linkUrl":"","linkReason":"","alternateAngle":""}`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    if (!apiRes.ok) throw new Error(`Claude API error: ${apiRes.status}`);
    const data = await apiRes.json();
    res.json(JSON.parse(data.content?.[0]?.text.replace(/```json|```/g, "").trim() || "{}"));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BrightSideReporter — Reddit Monitor</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#F5F3EE;--surface:#fff;--border:#E4E0D8;--text:#1A1814;--muted:#7A7570;--accent:#2D6A4F;--accent-light:#E8F5EE;--amber:#C47A0A;--amber-light:#FEF3DC;--red:#C0392B;--red-light:#FDECEA;--blue:#1D5FAD;--blue-light:#EAF1FB;--purple:#5B3FA0;--purple-light:#F0EDFB}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 2rem;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.logo{font-family:'DM Serif Display',serif;font-size:18px}.logo span{color:var(--accent)}
.header-meta{font-size:13px;color:var(--muted)}
main{max-width:860px;margin:0 auto;padding:2rem 1.5rem}
.tab-nav{display:flex;gap:4px;margin-bottom:2rem;border-bottom:1px solid var(--border)}
.tab-btn{font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;padding:10px 18px;border:none;background:none;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.tab-btn:hover{color:var(--text)}.tab-btn.active{color:var(--text);border-bottom-color:var(--accent)}
.tab-panel{display:none}.tab-panel.active{display:block}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:500;font-family:'DM Sans',sans-serif;cursor:pointer;border:none;transition:all .15s}
.btn-primary{background:var(--text);color:#fff}.btn-primary:hover{background:#333}.btn-primary:disabled{background:#ccc;cursor:not-allowed}
.btn-secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}.btn-secondary:hover{background:var(--bg)}
.btn-sm{padding:7px 14px;font-size:13px;border-radius:6px}
.hero{margin-bottom:2rem}
.hero h1{font-family:'DM Serif Display',serif;font-size:32px;letter-spacing:-.03em;line-height:1.2;margin-bottom:8px}
.hero p{font-size:15px;color:var(--muted);line-height:1.6}
.scan-bar{display:flex;gap:12px;align-items:center;margin-bottom:2rem;flex-wrap:wrap}
.status-bar{display:none;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
.status-bar.visible{display:block}
.status-label{font-size:13px;font-weight:500;margin-bottom:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.sub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
.sub-chip{font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.dot{width:7px;height:7px;border-radius:50%;background:#ccc;flex-shrink:0}
.sub-chip.loading .dot{background:var(--amber);animation:pulse 1s infinite}
.sub-chip.done{background:var(--accent-light);border-color:#b2d8c4}.sub-chip.done .dot{background:var(--accent)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.analyzing-msg{font-size:14px;color:var(--muted);margin-top:14px;display:none}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.section-title{font-family:'DM Serif Display',serif;font-size:20px}
.total-badge{font-size:12px;background:var(--accent-light);color:var(--accent);padding:3px 10px;border-radius:20px;font-weight:500}
#results{display:none}
.rec-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;margin-bottom:12px;overflow:hidden}
.rec-header{padding:16px 18px;cursor:pointer;display:flex;align-items:flex-start;gap:14px}
.score-circle{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;border:2px solid;flex-shrink:0}
.score-high{background:var(--accent-light);color:var(--accent);border-color:#b2d8c4}
.score-mid{background:var(--amber-light);color:var(--amber);border-color:#f5d98a}
.score-low{background:var(--bg);color:var(--muted);border-color:var(--border)}
.rec-meta{flex:1;min-width:0}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;align-items:center}
.tag{font-size:11px;font-weight:500;padding:2px 8px;border-radius:4px}
.tag-bsr{background:var(--blue-light);color:var(--blue)}.tag-ta{background:var(--purple-light);color:var(--purple)}.tag-mdt{background:var(--accent-light);color:var(--accent)}
.tag-low{background:var(--accent-light);color:var(--accent)}.tag-medium{background:var(--amber-light);color:var(--amber)}.tag-high{background:var(--red-light);color:var(--red)}
.tag-sub{background:var(--bg);color:var(--muted);border:1px solid var(--border)}
.rec-title{font-size:15px;font-weight:500;line-height:1.4;margin-bottom:6px}
.rec-scores{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.rec-scores b{color:var(--text)}
.rec-why{font-size:13px;color:var(--muted);font-style:italic;margin-top:6px}
.chevron{font-size:18px;color:var(--muted);flex-shrink:0;transition:transform .2s;margin-top:2px}
.rec-card.open .chevron{transform:rotate(180deg)}
.rec-body{display:none;border-top:1px solid var(--border);padding:16px 18px;background:#FAFAF8}
.rec-card.open .rec-body{display:block}
.draft-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px}
.draft-text{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:14px;line-height:1.65;margin-bottom:12px;white-space:pre-wrap}
.rec-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.link-note{font-size:12px;color:var(--blue);background:var(--blue-light);padding:4px 10px;border-radius:5px}
.copied{background:var(--accent-light)!important;color:var(--accent)!important;border-color:#b2d8c4!important}
.reddit-link{font-size:13px;padding:7px 14px;border-radius:6px;text-decoration:none;background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:'DM Sans',sans-serif;font-weight:500}
.error-box{display:none;background:var(--red-light);border:1px solid #f5b7b1;border-radius:10px;padding:14px 16px;margin-bottom:1.5rem;font-size:14px;color:var(--red)}
.empty-state{display:none;text-align:center;padding:3rem 1rem;color:var(--muted)}
.qr-title{font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:6px}
.qr-sub{font-size:15px;color:var(--muted);margin-bottom:1.5rem;line-height:1.6}
.qr-form{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.5rem;margin-bottom:1rem}
.qr-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:6px;display:block}
.qr-textarea{width:100%;min-height:150px;padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:14px;line-height:1.6;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);resize:vertical;outline:none;margin-bottom:14px}
.qr-textarea:focus{border-color:var(--accent);background:var(--surface)}
.qr-textarea::placeholder{color:var(--muted)}
.qr-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.qr-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}
.qr-input{padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);outline:none}
.qr-input:focus{border-color:var(--accent);background:var(--surface)}
.qr-select{padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);outline:none;cursor:pointer}
.qr-loading{display:none;align-items:center;gap:10px;padding:1.25rem;color:var(--muted);font-size:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:1rem}
.qr-loading.visible{display:flex}
.spinner{width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.qr-result{display:none;flex-direction:column;gap:12px}
.qr-result.visible{display:flex}
.result-block{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.result-block-header{padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.block-title{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.block-body{padding:14px 16px;font-size:14px;line-height:1.65;white-space:pre-wrap}
.assess-body{padding:14px 16px;font-size:14px;line-height:1.65;color:var(--muted);font-style:italic}
.risk-pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px}
.risk-Low{background:var(--accent-light);color:var(--accent)}.risk-Medium{background:var(--amber-light);color:var(--amber)}.risk-High{background:var(--red-light);color:var(--red)}
.block-actions{padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.link-row{padding:10px 16px;font-size:13px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);color:var(--muted);background:var(--bg)}
.link-row a{color:var(--blue);text-decoration:none}
.alt-toggle{font-size:13px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:underline}
.alt-body{display:none;padding:14px 16px;font-size:14px;line-height:1.65;white-space:pre-wrap;border-top:1px solid var(--border);background:#FAFAF8;color:var(--muted);font-style:italic}
.qr-error{display:none;background:var(--red-light);border:1px solid #f5b7b1;border-radius:10px;padding:12px 14px;font-size:14px;color:var(--red);margin-bottom:1rem}
@media(max-width:600px){main{padding:1.25rem 1rem}.hero h1,.qr-title{font-size:24px}}
</style>
</head>
<body>
<header>
  <div class="logo">Bright<span>Side</span>Reporter</div>
  <div class="header-meta" id="last-scan">Not yet scanned</div>
</header>
<main>
  <nav class="tab-nav">
    <button class="tab-btn active" onclick="switchTab('scanner')">Subreddit Scanner</button>
    <button class="tab-btn" onclick="switchTab('reply')">Quick Reply</button>
  </nav>

  <div id="tab-scanner" class="tab-panel active">
    <div class="hero">
      <h1>Reddit Engagement Scanner</h1>
      <p>Finds the best threads across your 15 target subreddits and drafts responses in your voice.</p>
    </div>
    <div class="scan-bar">
      <button class="btn btn-primary" id="scan-btn" onclick="runScan()"><span id="scan-icon">&#9654;</span> Scan all subreddits</button>
    </div>
    <div id="error-box" class="error-box"></div>
    <div id="status-bar" class="status-bar">
      <div class="status-label" id="status-label">Fetching posts...</div>
      <div class="sub-grid" id="sub-grid"></div>
      <div class="analyzing-msg" id="analyzing-msg">Claude is analyzing threads and drafting responses...</div>
    </div>
    <div id="results">
      <div class="section-header">
        <div class="section-title">Today's opportunities</div>
        <span class="total-badge" id="total-badge"></span>
      </div>
      <div id="rec-list"></div>
    </div>
    <div id="empty-state" class="empty-state">
      <p>No opportunities found. Try again later.</p>
      <button class="btn btn-secondary btn-sm" onclick="runScan()">Try again</button>
    </div>
  </div>

  <div id="tab-reply" class="tab-panel">
    <h2 class="qr-title">Quick Reply</h2>
    <p class="qr-sub">Paste any Reddit post. Claude writes a response in your voice — ready to copy and post.</p>
    <div class="qr-form">
      <label class="qr-label" for="qr-post">Paste the Reddit post or comment</label>
      <textarea class="qr-textarea" id="qr-post" placeholder="Paste the post title and body here..."></textarea>
      <div class="qr-row">
        <div class="qr-field">
          <label class="qr-label" for="qr-sub">Subreddit (optional)</label>
          <input class="qr-input" id="qr-sub" type="text" placeholder="e.g. GetMotivated" />
        </div>
        <div class="qr-field">
          <label class="qr-label" for="qr-tone">Approach</label>
          <select class="qr-select" id="qr-tone">
            <option value="genuine">Purely genuine — no brand mention</option>
            <option value="subtle">Subtle — brand only if natural</option>
            <option value="value">Value post — insight + brand resource</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="generateReply()" id="qr-btn" style="align-self:flex-end;white-space:nowrap;">Generate response</button>
      </div>
    </div>
    <div class="qr-error" id="qr-error"></div>
    <div class="qr-loading" id="qr-loading"><div class="spinner"></div><span>Writing your response...</span></div>
    <div class="qr-result" id="qr-result">
      <div class="result-block">
        <div class="result-block-header">
          <span class="block-title">Claude's read on this post</span>
          <span class="risk-pill" id="qr-risk-pill"></span>
        </div>
        <div class="assess-body" id="qr-assessment"></div>
        <div style="padding:0 16px 10px;font-size:12px;color:var(--muted)" id="qr-risk-reason"></div>
      </div>
      <div class="result-block">
        <div class="result-block-header">
          <span class="block-title">Your response — ready to post</span>
          <button class="alt-toggle" onclick="toggleAlt()">Show alternate angle</button>
        </div>
        <div class="block-body" id="qr-response"></div>
        <div class="alt-body" id="qr-alt"></div>
        <div class="block-actions">
          <button class="btn btn-secondary btn-sm" id="qr-copy-btn" onclick="copyText('qr-response','qr-copy-btn','Copy response')">Copy response</button>
          <button class="btn btn-secondary btn-sm" id="qr-copy-alt-btn" onclick="copyText('qr-alt','qr-copy-alt-btn','Copy alternate')" style="display:none">Copy alternate</button>
        </div>
        <div class="link-row" id="qr-link-row" style="display:none">
          <span>Suggested link:</span>
          <a id="qr-link-url" href="#" target="_blank"></a>
          <span style="font-size:12px" id="qr-link-reason"></span>
        </div>
      </div>
    </div>
  </div>
</main>

<script>
const BRANDS={BrightSideReport:{label:"Bright Side",cls:"tag-bsr"},TimelessAchievement:{label:"Timeless",cls:"tag-ta"},MyDrivenThreads:{label:"MDT",cls:"tag-mdt"}};
let scanning=false,altVisible=false;

function switchTab(t){
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',(i===0&&t==='scanner')||(i===1&&t==='reply')));
  document.getElementById('tab-scanner').classList.toggle('active',t==='scanner');
  document.getElementById('tab-reply').classList.toggle('active',t==='reply');
}

function toggleAlt(){
  altVisible=!altVisible;
  document.getElementById('qr-alt').style.display=altVisible?'block':'none';
  document.getElementById('qr-copy-alt-btn').style.display=altVisible?'inline-flex':'none';
  document.querySelector('.alt-toggle').textContent=altVisible?'Hide alternate':'Show alternate angle';
}

async function runScan(){
  if(scanning)return;
  scanning=true;
  const btn=document.getElementById('scan-btn');
  const icon=document.getElementById('scan-icon');
  btn.disabled=true;icon.innerHTML='&#8635;';
  document.getElementById('error-box').style.display='none';
  document.getElementById('results').style.display='none';
  document.getElementById('empty-state').style.display='none';
  document.getElementById('rec-list').innerHTML='';
  const sb=document.getElementById('status-bar');
  sb.classList.add('visible');
  document.getElementById('status-label').textContent='Fetching posts from Reddit...';
  document.getElementById('analyzing-msg').style.display='none';
  const grid=document.getElementById('sub-grid');grid.innerHTML='';
  const subsRes=await fetch('/api/subreddits').catch(()=>null);
  const subs=subsRes?await subsRes.json():[];
  subs.forEach(s=>{
    const c=document.createElement('div');
    c.className='sub-chip loading';c.id='chip-'+s.name;
    c.innerHTML='<span class="dot"></span><span>r/'+s.name+'</span>';
    grid.appendChild(c);
  });
  try{
    const res=await fetch('/api/scan');
    if(!res.ok){const e=await res.json();throw new Error(e.error||'Scan failed');}
    document.getElementById('analyzing-msg').style.display='block';
    document.getElementById('status-label').textContent='Claude is analyzing threads...';
    const data=await res.json();
    (data.subStatus||[]).forEach(s=>{
      const chip=document.getElementById('chip-'+s.name);
      if(chip)chip.className='sub-chip '+(s.count>0?'done':'');
    });
    document.getElementById('last-scan').textContent='Last scan: '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    if(!data.recommendations||data.recommendations.length===0){
      sb.classList.remove('visible');
      document.getElementById('empty-state').style.display='block';
    }else{
      renderResults(data.recommendations,data.totalPosts);
      sb.classList.remove('visible');
    }
  }catch(e){
    sb.classList.remove('visible');
    const eb=document.getElementById('error-box');
    eb.style.display='block';eb.textContent='Error: '+e.message;
  }
  btn.disabled=false;icon.innerHTML='&#9654;';scanning=false;
}

function renderResults(recs,total){
  const list=document.getElementById('rec-list');list.innerHTML='';
  document.getElementById('total-badge').textContent=recs.length+' of '+total+' posts';
  recs.forEach((r,i)=>{
    const score=(r.relevance||0)+(r.engagement||0)+(r.promoFit||0);
    const sc=score>=24?'score-high':score>=15?'score-mid':'score-low';
    const b=BRANDS[r.post?.brand]||{label:r.post?.brand,cls:'tag-bsr'};
    const rc='tag-'+(r.risk||'Low');
    const card=document.createElement('div');
    card.className='rec-card';card.id='card-'+i;
    card.innerHTML='<div class="rec-header" onclick="toggleCard('+i+')"><div class="score-circle '+sc+'">'+score+'</div><div class="rec-meta"><div class="tags"><span class="tag '+b.cls+'">'+b.label+'</span><span class="tag tag-sub">r/'+r.post?.subreddit+'</span><span class="tag '+rc+'">'+r.risk+' risk</span></div><div class="rec-title">'+esc(r.post?.title||'')+'</div><div class="rec-scores"><span>Relevance <b>'+r.relevance+'/10</b></span><span>Engagement <b>'+r.engagement+'/10</b></span><span>Promo <b>'+r.promoFit+'/10</b></span><span>'+r.post?.upvotes+' upvotes &middot; '+r.post?.comments+' comments</span></div><div class="rec-why">'+esc(r.why||'')+'</div></div><div class="chevron">&#8964;</div></div><div class="rec-body"><div class="draft-label">Drafted response</div><div class="draft-text" id="draft-'+i+'">'+esc(r.draft||'')+'</div><div class="rec-actions"><button class="btn btn-secondary btn-sm" onclick="copyText(\'draft-'+i+'\',this,\'Copy response\')">Copy response</button><a href="'+r.post?.url+'" target="_blank" rel="noopener" class="reddit-link">Open thread &#8599;</a>'+(r.includeLink&&r.linkUrl?'<span class="link-note">Include: '+esc(r.linkUrl)+'</span>':'')+'</div></div>';
    list.appendChild(card);
  });
  document.getElementById('results').style.display='block';
}

function toggleCard(i){document.getElementById('card-'+i).classList.toggle('open');}

async function generateReply(){
  const postContent=document.getElementById('qr-post').value.trim();
  if(!postContent){const e=document.getElementById('qr-error');e.textContent='Please paste a post first.';e.style.display='block';return;}
  document.getElementById('qr-error').style.display='none';
  document.getElementById('qr-result').classList.remove('visible');
  document.getElementById('qr-loading').classList.add('visible');
  document.getElementById('qr-btn').disabled=true;
  altVisible=false;document.getElementById('qr-alt').style.display='none';
  document.getElementById('qr-copy-alt-btn').style.display='none';
  const subreddit=document.getElementById('qr-sub').value.trim().replace(/^r\//,'');
  const tone=document.getElementById('qr-tone').value;
  try{
    const res=await fetch('/api/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postContent,subreddit,tone})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    document.getElementById('qr-assessment').textContent=data.assessment||'';
    const rp=document.getElementById('qr-risk-pill');
    rp.textContent=(data.riskLevel||'Unknown')+' risk';
    rp.className='risk-pill risk-'+(data.riskLevel||'Low');
    document.getElementById('qr-risk-reason').textContent=data.riskReason||'';
    document.getElementById('qr-response').textContent=data.response||'';
    document.getElementById('qr-alt').textContent=data.alternateAngle||'';
    const lr=document.getElementById('qr-link-row');
    if(data.includeLink&&data.linkUrl){
      const a=document.getElementById('qr-link-url');a.href=data.linkUrl;a.textContent=data.linkUrl;
      document.getElementById('qr-link-reason').textContent=data.linkReason||'';
      lr.style.display='flex';
    }else{lr.style.display='none';}
    document.getElementById('qr-result').classList.add('visible');
  }catch(e){const er=document.getElementById('qr-error');er.textContent='Error: '+e.message;er.style.display='block';}
  document.getElementById('qr-loading').classList.remove('visible');
  document.getElementById('qr-btn').disabled=false;
}

function copyText(srcId,btn,origLabel){
  const el=typeof srcId==='string'?document.getElementById(srcId):srcId;
  const text=el?.textContent||'';
  navigator.clipboard.writeText(text).then(()=>{
    const b=typeof btn==='string'?document.getElementById(btn):btn;
    const orig=b.textContent;b.textContent='Copied!';b.classList.add('copied');
    setTimeout(()=>{b.textContent=orig||origLabel;b.classList.remove('copied');},2000);
  });
}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
