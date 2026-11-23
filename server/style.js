// How @EXXAlerts actually writes, from a study of all 1,109 original posts May 1 - Nov 23, 2026
// (227 one-line posts, 882 multi-paragraph posts; full write-up in the exx-style style guide).
export const STYLE_FINDINGS = `
HOW @EXXAlerts WRITES (learned from 1,109 of the account's own posts, May-Nov 2026):
- Every post opens with a label in caps and a colon. "ALERT:" on ~90% of posts. "NEW:" for newly released footage, interviews or court moments. "BREAKING:" only for something unfolding right now (fire, crash, shooting in progress). "UPDATE:" for a follow-up on a story already covered. Never a bare headline.
- The headline is ONE plain declarative sentence, ~20 words / 100-150 characters, present tense or plain past ("Man chucks...", "Woman arrested after...", "Judge refuses..."). Starts with the actor described by role, not name: "Man", "Woman", "Florida man", "Mother", "Elderly woman", "Drunk driver", "17-year-old", "Former teacher", "Democrat Missouri State Rep.". Hook = the most shocking, ironic or human detail, often stacked with "after" / "when" / "while" / "as".
- No hype words, no exclamation marks, no rhetorical questions, no "you won't believe". The shock comes from the facts. Tone is flat, wire-service, slightly wry.
- Long posts: headline, blank line, then 2-7 one-sentence paragraphs (median 5, ~130 characters each), each separated by a blank line. Paragraph 2 sets the scene: "Name, 32, was ... when ..." or "A man in Dallas, Texas, was ... when ...". Middle paragraphs walk through what happened in order. Then a direct quote paragraph. Last paragraph = where it stands: charged with / faces / held without bail / sentenced to / in the hospital / raised $X.
- People: full name with age in commas the first time ("Richard Stevenson, 45,") or "51-year-old Terell Wayne Overton"; then LAST NAME only after that. Relationship tags: "a father of five", "Josh's wife", "her 17-year-old nephew", "who is a preacher".
- Quotes are used constantly (64% of long posts): introduced with "said," / "stated," / "told police," or dropped in as their own paragraph in curly quotes. Ending on a quote is common.
- Attribution: "allegedly" on anything not yet proven; "according to police/the DOJ/NBC News". Short posts on surprising claims may end "— Daily Mail." / "— CNN." or ", according to NBC News." Long posts never end with an outlet tag; the source goes inside the body ("Orange County Sheriff's Office stated on Instagram, ...").
- Mechanics: numerals for every number ("2 kids", "3 prior DUIs", "130 feet"), Oxford comma, curly quotes, US state spelled out ("in Maryland", "in Southern California"). Explicit words are asterisked: s*x, s*xual, r*pe, su*cide, f*ck, sh*t, b*tch.
- No hashtags, no links, no @mentions, no emojis in the writing.
- What gets the most engagement: bodycam / 911 / surveillance stories (about 2x median), crime with a twist, "NEW:" footage and "BREAKING:" emergencies, longer 5+ paragraph posts with video, and for one-liners, US politics (GOP vs Democrats, Trump, Senate races) with a place tag or a big-outlet credit.`;

// Real top-performing @EXXAlerts one-line posts (by total engagement), verbatim.
export const SHORT_EXAMPLES = [
  `ALERT: Chris Watts, the Colorado man who killed his wife and daughter, caught having gay s*x in prison — Daily Mail.`,
  `ALERT: Elon Musk invests $1 billion into the parent company of CNN, technically making him an owner of the news outlet.`,
  `ALERT: Over $300,000 has been raised for the Red Baron worker who was harassed by an Instagram influencer, with one donor giving $30,000.`,
  `ALERT: Judge refuses to dismiss murder charge for Lindsey Clancy and bans her lawyer from investigating the holdout juror.`,
  `ALERT: Democrat Missouri State Rep. arrested after crashing a funeral service hours after winning re-election.`,
  `ALERT: Republicans are now ahead of Democrats in mail-in and early in-person votes cast in Texas, according to NBC News.`,
  `ALERT: Senator Mike Lee calls on Republicans to pass the SAVE America Act “now” to avoid becoming “permanent lame ducks.”`,
  `ALERT: Treasury Department says that 9 of the top banks in the United States “debanked” customers over their religious and political views.`,
  `ALERT: Not a single plane is over the state of Alabama after the FAA called a nationwide ground stop.`,
  `ALERT: New Air Force One carrying President Trump to Asia makes unplanned diversion in Alaska with old Air Force One on its tail. — Daily Mail.`,
];

// Real top-performing @EXXAlerts long posts (by total engagement), verbatim except two typo fixes.
// Some include exact dates from the source; generated posts must still follow the vague-dates rule.
export const LONG_EXAMPLES = [
  `ALERT: Woman arrested after using her access to the sensitive court database to warn members of a drug trafficking operation who had arrest warrants.

Crystal Lawson, 32, was hired in 2022 as a Juvenile Probation Officer for the Florida Department of Juvenile Justice before being terminated from that role for a battery charge later that year.

Although Lawson was fired, her access to the court database was not cut off.

Between January and May 2026, Lawson used the database 106 times to search for active criminals being investigated for drug trafficking.

Lawson unlawfully found multiple active, unserved arrest warrants and leaked that information to the criminals.

Orange County Sheriff's Office stated on Instagram, “These leaks resulted in lost evidence, unrecovered assets, and at least one flight to avoid arrest.”

Lawson was charged with 113 felony counts of unauthorized access, each punishable by up to 5 years in prison.`,
  `ALERT: "Horrific fart attack" sent moviegoers running out of the theater in the middle of the new 'Spider-Man.'

While a screening of the movie ‘Spider-Man: Brand New Day’ was playing in Cartagena, Colombia, an audience member allegedly had a farting attack that cleared the theater.

Hundreds of people can be seen leaving the cinema into the hall, including a man dressed as Spider-Man, to escape the rancid smell.

One viewer said, “To ruin a whole cinema like that, only God knows what that person ate.”`,
  `ALERT: Wife has to read her husband's lips and speak for him after he broke his neck trying to rescue children in the ocean.

Josh Collette, a father of five, has been in the intensive care unit after he jumped into San Clemente’s Riviera Beach, breaking 2 vertebrae and badly damaging his spinal cord.

Josh, an avid swimmer and surfer, was trying to rescue 2 kids caught in a rip current.

Rose, Josh’s wife, has to read his lips and speak for him, as he is paralyzed after he hit his head on a sand wall created by the rip current.

“I dove headfirst, and that’s my fault. I should not have… I could feel myself dying. I couldn’t breathe, and they pulled me up out of the water.”

The family has raised $204,000 to help Josh get transferred to a Colorado facility that specializes in these types of injuries.`,
  `ALERT: 17-year-old will be held without bail and charged as an adult after shooting a 13-year-old in a mall.

Diego Rafael Turcios Avalos was at the Westfield Wheaton Mall in Maryland when a group of teenagers walked by, and he opened fire.

Avalos hit a 13-year-old in the leg, and he had to be transported to the hospital.

Police found Avalos lying on the ground in front of a Dick’s Sporting Goods store inside the mall after a security guard had apprehended him.

Prosecutors revealed that the gun found on Avalos had jammed and argued that he would have fired additional shots if not for the malfunction.

While Avalos was granted a transfer to a juvenile detention center without bond until his preliminary hearing, he turns 18 in November and will be tried as an adult.`,
  `ALERT: Airport worker arrested for allegedly stealing a traveler's gun after he tracked it down using an AirTag.

Multiple travelers at the Portland International Airport in Oregon reported their firearms missing from their checked bags, which sparked an investigation by the FBI.

Through security footage, the FBI found that 51-year-old Terell Wayne Overton had access to the missing guns while loading bags onto the departing flights.

One customer had an AirTag in his Glock carrying case and tracked it down to an Alaska Airlines baggage area.

The FBI watched the security tapes and tracked Overton, whose movement corresponded to the AirTags.

Overton, who was convicted of selling cocaine in 2005, has been charged with theft and being a felon in possession of a firearm.`,
  `ALERT: Prolific DUI driver decapitates a woman when he was allegedly drunk driving a pontoon boat 80 MPH in a no-wake zone.

Richard Stevenson, 45, was seen flying across the Fox River in Illinois in his 30-foot pontoon boat, expected to be traveling 80 MPH.

Stevenson was seen by a security camera zooming down the river and, about an hour and a half later, seen flying by again in the other direction.

Shortly after, the family that recorded his boat heard a massive crash.

Stevenson entered a no-wake zone and flew into the back of a boat, causing his boat to jump on top of it, decapitating a woman and injuring her husband.

2 passengers on Stevenson's boat fled the scene but were later interviewed by police and said Stevenson, who blew a .20 BAC, had taken several Fireball shots that day.

Stevenson, who has 3 prior DUI’s, faces three felony charges, including reckless homicide and aggravated driving under the influence.`,
  `ALERT: Trucker rescued a woman who was running through traffic, handcuffed after being allegedly kidnapped by a man posing as a police officer.

Anthony Moore was driving his truck in Aiken County, South Carolina, when he spotted a woman running across the road who was handcuffed.

“She says, ‘Help me, help me. He’s trying to kidnap me.'“

Jonathan Willard, 39, approached Moore’s truck and flashed a ‘badge’ sideways to Moore, saying he was law enforcement.

The woman jumped into Moore’s car, and according to Moore, she said, “No, he is not. He tried to kidnap me, sir.”

Another driver stopped and called 911, saying, “Yeah, he [Willard] can’t be legit… Hell no, because he’s in a white Cadillac.”

Willard then drove off, but was later located and arrested by authorities, and is being charged with impersonating law enforcement and kidnapping.

Moore, who is a preacher, says God put him there and, “Delayed divine timing. There is an appointed place for us to be at an appointed time.”`,
  `ALERT: California firefighter gifts a kid a new bicycle after hearing he walks to school and work, where he helps his mom run a taco stand.

The Montebello Fire Department in Los Angeles recently met 12-year-old Jose, who walks to school because his old bike was too rusty to ride.

Firefighter Miranda bought the bike on his own to help Jose get to school safely and help his mom run the taco stand.

"This is what community service is all about!"`,
  `NEW: Judge tells the mother of a 20-year-old who was murdered that “nothing in this process is fair” as she cries in court.

Latisa Perryman’s 20-year-old son, Jarvis Perryman, was shot to death in Euclid Beach Park in Cleveland by Christopher Manning, who pleaded guilty last week.

Latisa said to Judge Steven Gall, “I told him it had to be a life in there, because that’s… my son’s life is gone. Why would we do 25 to 32? How is that fair?”

Gall responded by saying, “Nothing in this process is fair. There’s no sense of fairness. You’ll never walk out of this court with feeling like you won or got anything back.”

Manning was sentenced to between 32 and 37 years for the murder as well as severely injuring Latisa’s 17-year-old nephew.`,
  `ALERT: US Coast Guard jumps onto a runaway boat and safely stops it in Maryland.

Authorities say the man operating the vessel suddenly fell overboard, and the Coast Guard had to intercept and stop the boat.

The incident has raised awareness among boat operators to wear their engine shut-off clip lanyards, which are required by federal law on most boats under 26 feet.`,
];

// Words @EXXAlerts always asterisks. Applied to every generated draft.
export const CENSOR = [
  [/\bsexually\b/gi, 's*xually'], [/\bsexual\b/gi, 's*xual'], [/\bsex\b/gi, 's*x'],
  [/\braped\b/gi, 'r*ped'], [/\braping\b/gi, 'r*ping'], [/\brapist(s?)\b/gi, 'r*pist$1'], [/\brape\b/gi, 'r*pe'],
  [/\bsuicide\b/gi, 'su*cide'],
  [/\bfucking\b/gi, 'f*cking'], [/\bfuck\b/gi, 'f*ck'], [/\bshit\b/gi, 'sh*t'], [/\bbitch\b/gi, 'b*tch'], [/\bgoddamn\b/gi, 'godd*mn'],
];

export const RULES_SHORT = `SHORT POST RULES (a one-line @EXXAlerts post):
- One line, one sentence (two at most). 90-170 characters is the sweet spot (median of real posts: 129). Hard max 260 characters including any source tag.
- Open with "ALERT:" (use "NEW:" only for newly released video/interview, "BREAKING:" only for something happening right now).
- Lead with who did what, described by role or title ("Democrat Missouri State Rep.", "Judge", "Man in a hi-vis jacket"), then the twist, stacked with "after", "while", "as", "against", "with". Plain, flat, factual. No hype words, no exclamation marks, no questions.
- Put the place in with "in <State>" when it helps ("in Texas", "in Southern California").
- A short quote of the key phrase in curly quotes is good when the material has one ("permanent lame ducks").
- Source credit: on a surprising or exclusive claim from a news story end with " — <Outlet>." or ", according to <Outlet>." Otherwise no credit. For posts from other X accounts never cite the @handle.
- NEVER reuse the article headline or its wording. Do not copy any run of 5+ consecutive words from the headline or source text. Find a fresh hook: the striking number, the quote, the irony, the twist, the stakes.
- Numerals for numbers. Asterisk explicit words (s*x, r*pe, su*cide, f*ck).
- No emojis, no hashtags, no links, no @mentions.
- Never invent facts, numbers, names or quotes that are not in the material.`;

export const RULES_LONG = `LONG POST RULES (a multi-paragraph @EXXAlerts post):
- Line 1, the headline: "ALERT:" (or "NEW:" for newly released footage/interview/court video, "BREAKING:" for something unfolding now, "UPDATE:" for a follow-up), then ONE sentence, about 15-25 words, 90-160 characters, that states the most shocking, ironic or human fact. Start with the person's role ("Man", "Woman", "Mother", "Florida man", "17-year-old", "Elderly woman", "Trucker", "Judge"), not their name. Stack the twist with "after", "when", "while" or "as". Use "allegedly" when it is not proven. Do not copy the article headline (no run of 5+ of its words).
- The headline may name only a general US state (e.g. "in Ohio", "Florida man") or a college campus. Never put a city, town, county, street, neighborhood, business or venue in the headline; those go in the body.
- Keep the headline exactly as it would otherwise be; the personal details go only in the body.
- Body: 3-6 paragraphs, ONE sentence each (about 100-200 characters), every paragraph separated by a blank line. Total post about 450-950 characters.
  - Paragraph 2 sets the scene: "Full Name, age, was <doing what> at/in <exact place, City, State> when <what happened>." If no name, "A man in City, State, was ... when ...".
  - Next paragraphs: what happened next, in order, one beat per paragraph. Add the reported personal details: ages, relationships ("a father of five", "her 17-year-old nephew"), job, school, hometown, prior record.
  - A direct quote from police, officials, a victim, family or a witness when the material has one, introduced with "said," / "stated," / "told police," or as its own paragraph in curly quotes.
  - Last paragraph: where it stands now (charged with / faces / held without bail / sentenced to / in the hospital / investigation ongoing / raised $X). Ending on a strong quote is also fine.
- Names: full name and age the first time ("Richard Stevenson, 45," or "51-year-old Terell Overton"), last name only after that. Include the names and ages of everyone involved (victims, suspects, officers, family, witnesses) whenever the material gives them; never invent names, ages or details, and if the material does not give them leave them out.
- Dates and times stay vague: "earlier this week", "Monday night", "over the weekend", "last month", "earlier this year". No calendar dates or clock times unless the date itself is the story.
- Attribution goes inside the body ("according to police", "the DOJ said in a statement", "the sheriff's office stated on Facebook"). Do NOT end with an outlet tag.
- Numerals for all numbers, Oxford comma, curly quotes. Asterisk explicit words (s*x, s*xual, r*pe, su*cide, f*ck, sh*t, b*tch; "murder" and "killed" stay uncensored).
- No emojis, no hashtags, no links, no @mentions, no exclamation marks outside quotes.
- Only use facts in the material. Never invent names, ages, numbers or quotes. If the material is thin, write 2-3 paragraphs rather than making things up.`;
