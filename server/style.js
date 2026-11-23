// What works on @EXXAlerts — from an analysis of the account's last 150 posts (Nov 5–23, 2026).
export const STYLE_FINDINGS = `
WHAT PERFORMS ON @EXXAlerts (from the last 150 posts):
- Politics wins engagement: GOP infighting, Trump, Charlie Kirk fallout, Democrats behaving badly are the biggest hits (median engagement 517 vs 362 for crime).
- Short one-liners get the most likes/replies (mean 1,246 vs 638 for long posts). Long posts paired with video get the most reach and bookmarks (median 49.5K vs 42.3K views).
- Video drives reach (median 57K views). Shocking crime/bodycam/911 videos get the most bookmarks.
- Citing a big outlet at the end ("— Daily Mail.", "— CNN.", "— New York Post.") on a surprising claim roughly doubles engagement (1,759 vs 889).
- Every post leads with "ALERT:" (occasionally "NEW:" for newly released footage). No emojis. No hashtags.
- Place tags ("in Southern California", "in Florida") and direct quotes make the hook. Ages and names in long posts.
- Best posting window: 3–6 PM Pacific.
- Local stories that do well: bizarre or shocking crime with a twist, bodycam/911/surveillance footage, a crazy quote, a place tag, people who were caught, irony, outrage, heroics.`;

export const SHORT_EXAMPLES = [
  'ALERT: Rep. Tim Burchett is running for U.S. Senate in Tennessee, against Senator John Thune’s wishes.',
  'ALERT: Judge refuses to dismiss murder charge for Lindsey Clancy and bans her lawyer from investigating the holdout juror.',
  'ALERT: Democrat Missouri State Rep. arrested after crashing a funeral service hours after winning re-election.',
  'ALERT: New Air Force One carrying President Trump to Asia makes unplanned diversion in Alaska with old Air Force One on its tail. — Daily Mail.',
  'ALERT: Iran is planning to detonate a dirty bomb in Washington D.C. and allegedly already has the bomb making materials inside the United States — CNN.',
  'ALERT: Not a single plane is over the state of Alabama after the FAA called a nationwide ground stop.',
  'ALERT: Man does a “sexy dance” for law enforcement while getting arrested after leading them on a chase in a stolen vehicle in San Bernardino, California.',
  'ALERT: With 1.1 million babies aborted in the U.S. in 2026, the United States Senate has adopted a resolution to honor a dead hippo named Fiona.',
  'ALERT: Woman who killed a child and a man after driving her truck through a soccer field in Kansas will face no charges because she was sleeping while driving.',
];

export const LONG_EXAMPLES = [
`ALERT: Son begged, “Daddy, please don’t kill me,” before the father said, “Sorry, buddy,” and then the 911 operator heard a loud bang.

Isaac Luechtefeld, 34, gunned down his wife, Raquel, and their 3 children, ages 5, 3, and 1, in their Florida home before turning the gun on himself.

[3–6 more short paragraphs: what happened, an official or family quote, and where the case stands now.]`,
`ALERT: Amazon delivery driver dies after she complained that the “van is giving off a bad smell in the air that's making me dizzy.”

Patrick Miranda called the Lake County Sheriff’s Office non-emergency line after the van sat at the end of his driveway for hours.

[more short paragraphs with facts and quotes from the report]`,
`ALERT: Border Patrol stops a boat and finds nearly 20 illegals hiding inside the cabin in Southern California.

An aircraft from the San Diego Air and Marine Branch spotted the vessel about 12 miles off Catalina Island.

[more short paragraphs]`,
];

export const RULES_SHORT = `SHORT POST RULES:
- Exactly one line (one or two sentences max), starting with "ALERT:".
- 110–230 characters is the sweet spot; hard max 270 characters including the source tag.
- For news stories end with " — <Outlet>." (e.g. " — Fox News."). For posts from other X accounts, do not add an outlet unless the post itself cites one.
- NEVER reuse the article headline wording. Do not copy any run of 5+ consecutive words from the headline. Find a fresh, creative hook: a striking number, a quote, the irony, the twist, the stakes, a place tag.
- No emojis, no hashtags, no links, no @mentions.
- Plain, punchy, factual. Never invent facts, numbers, names or quotes that are not in the material.`;

export const RULES_LONG = `LONG POST RULES:
- First line: "ALERT:" headline sentence with a strong hook (not copied from the article headline).
- The headline (first line only) may name a general state (e.g. "Ohio", "New York") or a college campus. Never name an exact city, town, street, neighborhood or venue in the headline. Exact locations may appear in the body paragraphs.
- Be less specific on dates and times. Replace exact calendar dates and clock times with vaguer phrasing ("earlier this week", "Monday night", "over the weekend", "last month") unless the exact date is itself the story.
- Include victims' names and ages when they appear in the material. Never invent names or ages; if the material does not give them, leave them out.
- Then 4–8 short paragraphs (1–2 sentences each), separated by a blank line: who (name, age), what happened, where, a direct quote from police/officials/family if the material has one, and where the case or story stands now.
- No emojis, no hashtags, no links. You may end with a final line " — <Outlet>." citing the source for news stories.
- Only use facts in the material. Never invent names, ages, numbers or quotes. If the material is thin, write fewer paragraphs rather than making things up.`;
