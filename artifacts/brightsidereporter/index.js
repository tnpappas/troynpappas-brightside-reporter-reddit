const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
  { name: "ADHD", brand: "TimelessAchievement" },
  { name: "adhdwomen", brand: "TimelessAchievement" },
  { name: "ADHD_Programmers", brand: "TimelessAchievement" },
  { name: "adhd_anxiety", brand: "TimelessAchievement" },
  { name: "Entrepreneur", brand: "MyDrivenThreads" },
  { name: "smallbusiness", brand: "MyDrivenThreads" },
  { name: "GymMotivation", brand: "MyDrivenThreads" },
  { name: "Newsletters", brand: "BrightSideReport" },
  { name: "Journalism", brand: "BrightSideReport" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseRSS(xml, subreddit) {
  const posts = [];
  const isAtom = xml.includes("<feed") && xml.includes("<entry>");

  if (isAtom) {
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    for (const entry of entries.slice(0, 8)) {
      const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "";
      const link = (entry.match(/<link[^>]*href="([^"]*)"/) || [])[1] || "";
      const content = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";
      const decoded = content
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      const commentsMatch = decoded.match(/\[comments\]/);
      const cleanDesc = decoded.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, " ").trim().slice(0, 300);
      const cleanTitle = title
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
      if (cleanTitle.length > 5) {
        posts.push({
          id: Math.random().toString(36).slice(2),
          subreddit: subreddit.name,
          brand: subreddit.brand,
          title: cleanTitle,
          text: cleanDesc,
          upvotes: 0,
          comments: 0,
          url: link.trim(),
        });
      }
    }
  } else {
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of items.slice(0, 8)) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                     item.match(/<title>(.*?)<\/title>/) || [])[1] || "";
      const link = (item.match(/<link>(.*?)<\/link>/) ||
                    item.match(/<comments>(.*?)<\/comments>/) || [])[1] || "";
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                    item.match(/<description>(.*?)<\/description>/) || [])[1] || "";
      const commentsRaw = (item.match(/(\d+) comments/) || [])[1] || "0";
      const upvotesRaw = (item.match(/(\d+) point/) || [])[1] || "0";
      const cleanDesc = desc.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").trim().slice(0, 300);
      if (title.length > 5) {
        posts.push({
          id: Math.random().toString(36).slice(2),
          subreddit: subreddit.name,
          brand: subreddit.brand,
          title: title.trim(),
          text: cleanDesc,
          upvotes: parseInt(upvotesRaw, 10) || 0,
          comments: parseInt(commentsRaw, 10) || 0,
          url: link.trim(),
        });
      }
    }
  }
  return posts;
}

async function fetchSubreddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit.name}/hot/.rss?limit=8`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
    console.log(`r/${subreddit.name}: HTTP ${res.status}`);
    if (!res.ok) return { name: subreddit.name, posts: [], error: res.status };
    const xml = await res.text();
    const posts = parseRSS(xml, subreddit);
    console.log(`r/${subreddit.name}: got ${posts.length} posts`);
    return { name: subreddit.name, posts };
  } catch (e) {
    console.log(`r/${subreddit.name}: error — ${e.message}`);
    return { name: subreddit.name, posts: [], error: e.message };
  }
}

async function analyzePosts(posts) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in environment");

  const top = posts.sort((a, b) => b.comments - a.comments).slice(0, 20);

  const prompt = `You are analyzing Reddit posts for Troy, who runs the account BrightSideReporter. His brands:
1. BrightSideReport.com — positive news aggregator curating from 63 trusted sources
2. Timeless Achievement — YouTube/TikTok translating classic success and Stoic writing into modern lessons. YouTube: https://youtube.com/@TimelessAchievement
3. My Driven Threads — motivational apparel at https://mydriventhreads.com

WHO TROY IS:
- Entrepreneur in Virginia Beach, Virginia. Authentic, grounded, no-BS. Warm but direct.
- Reads classic success and Stoic writing — James Allen, Wallace Wattles, Arnold Bennett, Samuel Smiles, Charles Haanel, Theron Dumont, Marcus Aurelius, Seneca, Epictetus.
- Has long-term personal sobriety, but DOES NOT lead with that and DOES NOT mention it unless the post is specifically about addiction, alcohol, drugs, recovery, relapse, AA/NA, or sober-curious life.
- Has lived ADHD experience (executive function struggles, time blindness, dopamine seeking, hyperfocus, working with the brain instead of against it). DOES NOT mention ADHD unless the post is genuinely about ADHD, executive function, focus / distraction, procrastination tied to dopamine, time-blindness, late diagnosis, medication, or related neurodivergence topics. The "ADHD experience" tone (when selected) overrides this gate and tells you to lean into the lens directly.

DRAFT VOICE — write each draft as a real human Reddit comment, not a content marketer:
- No openers like "Great question," "I hear you," "This resonated," "As someone who..."
- Conversational. Usually 2-4 sentences. One idea per comment. Plain English, contractions OK.
- No motivational-poster phrasing ("the journey," "trust the process," "level up," "stay blessed").
- Pull from classic ideas when they naturally fit. The ideas matter more than the attribution — don't quote or name-drop authors unless it adds something. If you do attribute, do it casually ("a James Allen line I keep coming back to") and never more than once per comment.

WHEN TO REACH FOR WHICH IDEA:
- Stress, criticism, setbacks, things outside their control → Stoic frame: you don't control the event, you control the response; the judgment of the thing causes most of the suffering.
- Time, productivity, "no time," side hustles, evenings → Arnold Bennett: everyone gets the same 24; the hour after work decides where you'll be in five years.
- Mindset, self-talk, identity, repeated patterns → James Allen: the mind is a garden; character eventually shows up as circumstances.
- Focus, distraction, deep work, doomscrolling → Dumont / Haanel: attention is the real currency; a scattered mind builds a scattered life.
- Long-term effort, grit, doing right when no one's watching → Samuel Smiles / Orison Marden: character is older than motivation; the world respects the person who keeps going.
- Business, money, comparison, "market too crowded" → Wattles: create, don't compete; useful beats clever.
- Burnout, overwhelm, rebuilding after a rough patch → Hamblin: peace is a form of power; a constructive mind sees possibilities where a fearful one sees walls.
- Mortality, urgency, wasted years → Seneca: life isn't short, we waste big chunks of it.

SOBRIETY RULE — STRICT:
Only allow a sobriety mention when the post is genuinely about alcohol, drugs, addiction, recovery, relapse, AA/NA/SMART, dry January, sober-curious, or a direct ask for someone with lived recovery experience. Do NOT mention sobriety on general posts about discipline, willpower, productivity, focus, dating, money, work ethic, or "I struggle with motivation." The point of view should feel earned through ideas, not autobiography.

STRICT REDDIT RULES:
- 90/10 rule: 90% genuine, 10% max promotional
- Never lead with a link — always lead with genuine value
- Only mention brands when it adds REAL value and feels completely natural
- Never ask for upvotes, never sound like marketing copy
- Never use em dashes (—) in any response. Use commas, periods, or semicolons instead

POSTS TO ANALYZE:
${top.map((p, i) => `[${i}] r/${p.subreddit} (${p.brand} fit) | ${p.upvotes} upvotes, ${p.comments} comments
Title: ${p.title}${p.text ? `\nBody: ${p.text}` : ""}`).join("\n\n")}

Return ONLY valid JSON — no markdown, no explanation. Pick the best 10:
[{
  "idx": <number>,
  "relevance": <0-10>,
  "engagement": <0-10>,
  "promoFit": <0-10>,
  "risk": "Low" or "Medium" or "High",
  "why": "<1 sentence why this thread is worth engaging>",
  "draft": "<2-4 sentences as Troy the real person. Conversational Reddit voice. Start in the middle of a thought, no 'Great question' openers. Pull from a classic idea when the post calls for it, but don't quote unless it adds something. Brand link only at the very end if it genuinely helps.>",
  "includeLink": true or false,
  "linkUrl": "<full URL or empty string>"
}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 3500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);

  const data = await res.json();
  const raw = data.content?.[0]?.text || "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  const recs = JSON.parse(clean);

  return recs
    .map((r) => ({ ...r, post: top[r.idx] }))
    .filter((r) => r.post)
    .sort((a, b) =>
      b.relevance + b.engagement + b.promoFit -
      (a.relevance + a.engagement + a.promoFit)
    );
}

app.post("/api/reply", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  const { postContent, subreddit, tone, mood, anecdote } = req.body;
  if (!postContent || postContent.trim().length < 5) {
    return res.status(400).json({ error: "Post content is required" });
  }

  const toneGuide = {
    genuine: "Purely genuine, no brand mention at all. Just Troy being a helpful human.",
    subtle: "Genuine first, brand mention only if it fits naturally at the very end.",
    value: "Lead with a substantive insight or story, then reference a brand resource if relevant.",
  };

  const moodGuide = {
    auto: "Match the emotional register of the post. If they're venting, lean empathetic. If they're asking, lean informative. If the topic is heavy, stay serious. If the post is light, light is fine.",
    humor: "Light and a little witty. A touch of self-aware humor is welcome. Never sarcastic, never punching down, never trying too hard. Punchy, not jokey.",
    empathetic: "Warm and validating. Sit with the person before offering anything. No fixing, no advice unless they explicitly asked for it. Honor what they're feeling first.",
    serious: "Direct and grounded. No jokes, no fluff, no rhetorical flourishes. Treat the topic with weight. Plainspoken.",
    informative: "Lead with concrete information, a specific example, or a useful framing. Be the comment someone would bookmark. Practical over poetic.",
    adhd: "Write from Troy's lived ADHD experience. Speak as someone who actually has ADHD — how it shows up in his life (executive function struggles, time blindness, hyperfocus, dopamine seeking, working with the brain instead of against it). Honest about the friction, not a 'I cured my ADHD' story. Practical, plain. You can lead from the ADHD lens directly (e.g. 'ADHD brain here — what finally worked for me was...') without sounding canned. Avoid the formula 'As someone with ADHD,' but the underlying frame is welcome.",
  };
  const moodChoice = moodGuide[mood] ? mood : "auto";
  const cleanAnecdote = (anecdote || "").trim();

  const prompt = `You are writing a Reddit response for Troy, who posts as BrightSideReporter.

WHO TROY IS:
- Entrepreneur in Virginia Beach, Virginia. Authentic, grounded, no-BS. Warm but direct.
- Owns 4 businesses: Safe House Property Inspections, Pest Heroes, HCJ Pool Services, My Driven Threads
- Reads classic success and Stoic writing: James Allen, Wallace Wattles, Arnold Bennett, Samuel Smiles, Charles Haanel, Theron Dumont, Marcus Aurelius, Seneca, Epictetus, Orison Marden
- Runs BrightSideReport.com (positive news aggregator from 63 trusted sources) and Timeless Achievement on YouTube (classic success philosophy translated into modern lessons)
- Has long-term personal sobriety, but DOES NOT lead with that and DOES NOT mention it unless the post is specifically about addiction, alcohol, drugs, recovery, relapse, AA/NA, or sober-curious life.
- Has lived ADHD experience (executive function struggles, time blindness, dopamine seeking, hyperfocus, working with the brain instead of against it). DOES NOT mention ADHD unless the post is genuinely about ADHD, executive function, focus / distraction, procrastination tied to dopamine, time-blindness, late diagnosis, medication, or related neurodivergence topics. The "ADHD experience" tone (when selected) overrides this gate and tells you to lean into the lens directly.

TROY'S BRANDS (only mention if genuinely relevant):
- BrightSideReport.com — positive news aggregator
- https://youtube.com/@TimelessAchievement — classic success philosophy
- https://mydriventhreads.com — motivational apparel

APPROACH (brand presence): ${toneGuide[tone] || toneGuide.genuine}

EMOTIONAL TONE (${moodChoice}): ${moodGuide[moodChoice]}

PERSONAL ANECDOTE (provided by Troy):
${cleanAnecdote ? `"${cleanAnecdote}"

Weave this anecdote into the response naturally if it genuinely fits the post. You can paraphrase, shorten, or rephrase it to match the comment's voice and length. If it would feel tacked on, forced, or off-topic, do NOT use it — write the comment without it. When you do use it, integrate it as Troy speaking from experience, not as a pasted-in quote.` : "(none provided — write from Troy's general perspective)"}

VOICE — write as a real human leaving a real comment, not a content marketer:
- No openers like "Great question," "I hear you," "This resonated," "As someone who..." Start in the middle of a thought.
- Conversational. Usually 2-4 sentences. One idea per comment. Plain English, contractions OK.
- No motivational-poster phrasing ("the journey," "trust the process," "level up," "stay blessed").
- Pull from classic ideas when they naturally fit the post. Use the IDEA, not the attribution — don't say "As James Allen wrote..." unless it really adds something. If you do attribute, do it casually ("an old Stoic line I keep coming back to") and only once per comment.

WHEN TO REACH FOR WHICH IDEA:
- Stress, criticism, setbacks, things outside their control → Stoic frame (Marcus / Epictetus / Seneca): you don't control the event, you control the response; the judgment of the thing causes most of the suffering.
- Time, productivity, "no time," side hustles, evenings → Arnold Bennett: everyone gets the same 24; the hour after work decides where you'll be in five years; "no time" usually means "no priority."
- Mindset, self-talk, identity, repeated patterns → James Allen: the mind is a garden; whatever you keep watering grows; character shows up as circumstances.
- Focus, distraction, deep work, doomscrolling → Dumont / Haanel: attention is the real currency; a scattered mind builds a scattered life.
- Long-term effort, grit, doing right when no one's watching → Samuel Smiles / Orison Marden: character is older than motivation; the world respects the person who keeps going.
- Business, money, comparison, "market is too crowded" → Wallace Wattles: create, don't compete; useful beats clever.
- Burnout, overwhelm, rebuilding → Henry Hamblin: peace is a form of power; a constructive mind sees possibilities where a fearful one sees walls.
- Mortality, urgency, wasted years → Seneca: life isn't short, we waste big chunks of it.

SOBRIETY RULE — STRICT:
Only allow a sobriety mention when the post is genuinely about alcohol, drugs, addiction, recovery, relapse, AA/NA/SMART, dry January, sober-curious, or a direct ask for someone with lived recovery experience. Do NOT mention sobriety on posts about general discipline, willpower, productivity, focus, dating, money, work ethic, or "I struggle with motivation." The point of view should feel earned through ideas, not autobiography.

REDDIT RULES:
- Write as Troy the person, never as a brand
- Lead with genuine value, insight, or experience
- 2-5 sentences unless the post clearly warrants more
- Never ask for upvotes
- Never use em dashes (—) in any response. Use commas, periods, or semicolons instead
- Only include a brand link if it directly and genuinely helps

SUBREDDIT: ${subreddit ? `r/${subreddit}` : "not specified"}

THE POST:
---
${postContent.trim()}
---

Return ONLY valid JSON, no markdown:
{
  "assessment": "<2-3 sentences: what this post is really about and what angle Troy should take. If sobriety is not directly on-topic, say so explicitly.>",
  "riskLevel": "Low" or "Medium" or "High",
  "riskReason": "<1 sentence why>",
  "response": "<The actual response, ready to copy-paste into Reddit, written as Troy. Conversational, no 'Great post' openers, one idea, classic-author thinking when it fits.>",
  "includeLink": true or false,
  "linkUrl": "<full URL if relevant, empty string if not>",
  "linkReason": "<1 sentence: why this link helps or why no link is needed>",
  "alternateAngle": "<An alternate 2-3 sentence response taking a different approach (different author lens, different framing, etc.)>"
}`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!apiRes.ok) throw new Error(`Anthropic API error: ${apiRes.status}`);

    const data = await apiRes.json();
    const raw = data.content?.[0]?.text || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(clean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchRedditThread(threadUrl) {
  let clean = threadUrl.trim().split("?")[0].split("#")[0];
  if (clean.endsWith("/")) clean = clean.slice(0, -1);
  const rssUrl = clean + "/.rss";
  const res = await fetch(rssUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
  });
  if (!res.ok) throw new Error(`Reddit returned HTTP ${res.status}`);
  const xml = await res.text();
  const subMatch = clean.match(/\/r\/([^/]+)\//);
  const subreddit = subMatch ? subMatch[1] : "";
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
  if (entries.length === 0) throw new Error("No content found in thread feed");

  const decode = (s) => s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  const stripHtml = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const first = entries[0];
  const titleRaw = (first.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "";
  const contentRaw = (first.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";
  const title = decode(titleRaw).trim();
  const body = stripHtml(decode(contentRaw)).slice(0, 1500);

  const topComments = [];
  for (const e of entries.slice(1, 6)) {
    const cAuthor = (e.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/) || [])[1] || "user";
    const cContent = (e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";
    const text = stripHtml(decode(cContent)).slice(0, 400);
    if (text) topComments.push(`${cAuthor}: ${text}`);
  }
  return { title, body, subreddit, topComments };
}

app.post("/api/thread-comment", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  const { url, tone, mood, anecdote } = req.body || {};
  if (!url || !/^https?:\/\/(www\.|old\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(url)) {
    return res.status(400).json({ error: "A valid Reddit thread URL is required" });
  }

  let thread;
  try {
    thread = await fetchRedditThread(url);
  } catch (e) {
    return res.status(502).json({ error: `Could not fetch thread: ${e.message}` });
  }

  const toneGuide = {
    genuine: "Purely genuine, no brand mention at all. Just Troy being a helpful human.",
    subtle: "Genuine first, brand mention only if it fits naturally at the very end.",
    value: "Lead with a substantive insight or story, then reference a brand resource if relevant.",
  };

  const moodGuide = {
    auto: "Match the emotional register of the thread. If the OP is venting, lean empathetic. If asking, lean informative. If the topic is heavy, stay serious. If the thread is light, light is fine.",
    humor: "Light and a little witty. A touch of self-aware humor is welcome. Never sarcastic, never punching down, never trying too hard. Punchy, not jokey.",
    empathetic: "Warm and validating. Sit with the person before offering anything. No fixing, no advice unless they explicitly asked for it. Honor what they're feeling first.",
    serious: "Direct and grounded. No jokes, no fluff, no rhetorical flourishes. Treat the topic with weight. Plainspoken.",
    informative: "Lead with concrete information, a specific example, or a useful framing. Be the comment someone would bookmark. Practical over poetic.",
    adhd: "Write from Troy's lived ADHD experience. Speak as someone who actually has ADHD — how it shows up in his life (executive function struggles, time blindness, hyperfocus, dopamine seeking, working with the brain instead of against it). Honest about the friction, not a 'I cured my ADHD' story. Practical, plain. You can lead from the ADHD lens directly (e.g. 'ADHD brain here — what finally worked for me was...') without sounding canned. Avoid the formula 'As someone with ADHD,' but the underlying frame is welcome.",
  };
  const moodChoice = moodGuide[mood] ? mood : "auto";
  const cleanAnecdote = (anecdote || "").trim();

  const postContent = `Title: ${thread.title}\n\n${thread.body || "(no body text)"}` +
    (thread.topComments.length ? `\n\nTop comments so far:\n- ${thread.topComments.join("\n- ")}` : "");

  const prompt = `You are writing a Reddit comment for Troy, who posts as BrightSideReporter.

WHO TROY IS:
- Entrepreneur in Virginia Beach, Virginia. Authentic, grounded, no-BS. Warm but direct.
- Owns 4 businesses: Safe House Property Inspections, Pest Heroes, HCJ Pool Services, My Driven Threads
- Reads classic success and Stoic writing: James Allen, Wallace Wattles, Arnold Bennett, Samuel Smiles, Charles Haanel, Theron Dumont, Marcus Aurelius, Seneca, Epictetus, Orison Marden
- Runs BrightSideReport.com (positive news aggregator from 63 trusted sources) and Timeless Achievement on YouTube (classic success philosophy translated into modern lessons)
- Has long-term personal sobriety, but DOES NOT lead with that and DOES NOT mention it unless the thread is specifically about addiction, alcohol, drugs, recovery, relapse, AA/NA, or sober-curious life.
- Has lived ADHD experience (executive function struggles, time blindness, dopamine seeking, hyperfocus, working with the brain instead of against it). DOES NOT mention ADHD unless the thread is genuinely about ADHD, executive function, focus / distraction, procrastination tied to dopamine, time-blindness, late diagnosis, medication, or related neurodivergence topics. The "ADHD experience" tone (when selected) overrides this gate and tells you to lean into the lens directly.

TROY'S BRANDS (only mention if genuinely relevant):
- BrightSideReport.com, positive news aggregator
- https://youtube.com/@TimelessAchievement, classic success philosophy
- https://mydriventhreads.com, motivational apparel

APPROACH (brand presence): ${toneGuide[tone] || toneGuide.genuine}

EMOTIONAL TONE (${moodChoice}): ${moodGuide[moodChoice]}

PERSONAL ANECDOTE (provided by Troy):
${cleanAnecdote ? `"${cleanAnecdote}"

Weave this anecdote into the comment naturally if it genuinely fits the thread. You can paraphrase, shorten, or rephrase it to match the comment's voice and length. If it would feel tacked on, forced, or off-topic, do NOT use it — write the comment without it. When you do use it, integrate it as Troy speaking from experience, not as a pasted-in quote.` : "(none provided — write from Troy's general perspective)"}

VOICE — write as a real human leaving a real comment, not a content marketer:
- No openers like "Great question," "I hear you," "This resonated," "As someone who..." Start in the middle of a thought.
- Conversational. Usually 2-4 sentences. One idea per comment. Plain English, contractions OK.
- No motivational-poster phrasing ("the journey," "trust the process," "level up," "stay blessed").
- Pull from classic ideas when they naturally fit. Use the IDEA, not the attribution — don't say "As James Allen wrote..." unless it really adds something. If you do attribute, do it casually ("an old Stoic line I keep coming back to") and only once per comment.

WHEN TO REACH FOR WHICH IDEA:
- Stress, criticism, setbacks, things outside their control → Stoic frame (Marcus / Epictetus / Seneca): you don't control the event, you control the response; the judgment of the thing causes most of the suffering.
- Time, productivity, "no time," side hustles, evenings → Arnold Bennett: everyone gets the same 24; the hour after work decides where you'll be in five years; "no time" usually means "no priority."
- Mindset, self-talk, identity, repeated patterns → James Allen: the mind is a garden; whatever you keep watering grows; character shows up as circumstances.
- Focus, distraction, deep work, doomscrolling → Dumont / Haanel: attention is the real currency; a scattered mind builds a scattered life.
- Long-term effort, grit, doing right when no one's watching → Samuel Smiles / Orison Marden: character is older than motivation; the world respects the person who keeps going.
- Business, money, comparison, "market is too crowded" → Wallace Wattles: create, don't compete; useful beats clever.
- Burnout, overwhelm, rebuilding → Henry Hamblin: peace is a form of power; a constructive mind sees possibilities where a fearful one sees walls.
- Mortality, urgency, wasted years → Seneca: life isn't short, we waste big chunks of it.

SOBRIETY RULE — STRICT:
Only allow a sobriety mention when the thread is genuinely about alcohol, drugs, addiction, recovery, relapse, AA/NA/SMART, dry January, sober-curious, or a direct ask for someone with lived recovery experience. Do NOT mention sobriety on threads about general discipline, willpower, productivity, focus, dating, money, work ethic, or "I struggle with motivation." The point of view should feel earned through ideas, not autobiography.

REDDIT RULES:
- Write as Troy the person, never as a brand
- Lead with genuine value, insight, or experience
- 2-5 sentences unless the thread clearly warrants more
- Never ask for upvotes
- Never use em dashes (—) in any response. Use commas, periods, or semicolons instead
- Only include a brand link if it directly and genuinely helps
- If top comments already cover an angle, take a different one

SUBREDDIT: r/${thread.subreddit}

THE THREAD:
---
${postContent}
---

Return ONLY valid JSON, no markdown:
{
  "assessment": "<2-3 sentences: what this thread is really about and what angle Troy should take. If sobriety is not directly on-topic, say so explicitly.>",
  "riskLevel": "Low" or "Medium" or "High",
  "riskReason": "<1 sentence why>",
  "response": "<The actual comment, ready to copy-paste into Reddit, written as Troy. Conversational, no 'Great post' openers, one idea, classic-author thinking when it fits.>",
  "includeLink": true or false,
  "linkUrl": "<full URL if relevant, empty string if not>",
  "linkReason": "<1 sentence: why this link helps or why no link is needed>",
  "alternateAngle": "<An alternate 2-3 sentence comment taking a different approach (different author lens, different framing, etc.)>"
}`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!apiRes.ok) throw new Error(`Anthropic API error: ${apiRes.status}`);
    const data = await apiRes.json();
    const raw = data.content?.[0]?.text || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json({ ...parsed, thread: { title: thread.title, subreddit: thread.subreddit, body: thread.body } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/scan", async (req, res) => {
  try {
    const results = [];
    for (const sub of SUBREDDITS) {
      const result = await fetchSubreddit(sub);
      results.push(result);
      await sleep(1200);
    }

    const allPosts = results.flatMap((r) => r.posts);
    const subStatus = results.map((r) => ({
      name: r.name,
      count: r.posts.length,
      error: r.error || null,
    }));

    console.log(`Total posts fetched: ${allPosts.length}`);

    if (allPosts.length === 0) {
      return res.json({ subStatus, recommendations: [], totalPosts: 0 });
    }

    const recommendations = await analyzePosts(allPosts);
    res.json({ subStatus, recommendations, totalPosts: allPosts.length });
  } catch (e) {
    console.log("Scan error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/subreddits", (req, res) => {
  res.json(SUBREDDITS);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reddit Monitor running on port ${PORT}`);
});
