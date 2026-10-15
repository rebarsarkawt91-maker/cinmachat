/** Catalog-grounded description search. Shared by browser and API; no network or storage. */
export interface SearchableFilm {
  id: string; title?: string; description?: string; year?: string | number;
  tags?: string[]; category?: string; language?: string;
}

export function descriptionText(value: unknown): string {
  return String(value ?? "").toLowerCase()
    .replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/<[^>]*>|&[a-z#0-9]+;/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const stop = new Set(descriptionText("a an the i me my want would like please movie movies film films about very really something with and or of in on at to for is it that who where be have not without but this find show year تکایە فیلم فیلمی فیلمێک فیلمێکی فلیم فلیمی فلیمێکی فلیمێک زۆر دەوێت دەوێ پێویستمە دەمەوێت دەمەوێ بیبینم ببینم بۆ من ئەم ئەو بە لە و یان کە بێت هەبێت هەیە دەربارەی سەبارەت بەدوای دەگەڕێم چیرۆک چیرۆکی ساڵ ساڵی بەڵام نەک بێ بدون ارید اريد فی فلیم عن جدا من فضلك فلم فیلم اريد يكون مع سنة").split(" "));
type Concept = { key: string; aliases: string[] };
const concept = (key: string, words: string): Concept => ({ key, aliases: words.split("|").map(descriptionText) });
['no', 'نەبێت', 'باش', 'جوان', 'خۆش', 'best', 'good'].forEach(word => stop.add(word));
const genres = [
  concept("horror", "horror|horrorr|scary|terrifying|ترسناک|تۆقێنەر|تۆقاندن|رعب|مخيف"),
  concept("comedy", "comedy|funny|کۆمیدی|پێکەنین|کوميدی|مضحک"),
  concept("animation", "animation|animated|cartoon|ئەنیمەیشن|کارتۆن|رسوم متحرکة"),
  concept("action", "action|ئاکشن|ئەکشن|اکشن"),
  concept("romance", "romance|romantic|ڕۆمانسی|خۆشەویستی|رومانسی"),
  concept("crime", "crime|تاوان|جنایة|جريمة"),
  concept("drama", "drama|دراما"),
  concept("fantasy", "fantasy|فەنتازیا|خەیاڵی|فانتازیا"),
  concept("sci-fi", "sci fi|science fiction|خەیاڵی زانستی|خیال علمی"),
  concept("thriller", "thriller|suspense|سسپێنس|ڕاچڵەکێنەر|اثارة"),
  concept("documentary", "documentary|بەڵگەنامەیی|وثائقی"),
  concept("family", "family|خێزانی|عائلی"),
  concept("adventure", "adventure|سەرکێشی|مغامرة"),
  concept("historical", "historical|history|مێژوویی|تاریخی"),
  concept("war", "war|جەنگ|حرب"),
];
const topics = [
  concept("space", "space|astronaut|spaceship|گەردوون|بۆشایی ئاسمان|فەزا|ئەستێرەناس|کەشتی ئاسمانی|فضاء|رائد فضاء"),
  concept("survival", "survival|survive|stranded|trapped|ڕزگاربوون|مانەوە|گیرماو|گیرکرد|گیر دەکە|نجاة|عالق"),
  concept("height", "tower|height|high rise|climbing|بڕج|تاوەر|بەرزایی|شاخەوان|برج|ارتفاع|تسلق"),
  concept("zombies", "zombie|زۆمبی|زومبی"),
  concept("haunted", "haunted|ghost|demon|supernatural|جن|جنۆکە|شەیتان|ڕۆح|مسکون|اشباح|شیطان"),
  concept("prison", "prison|jail|escape|زیندان|هەڵهاتن|سجن|هروب"),
  concept("police", "police|detective|investigation|پۆلیس|لێکۆڵینەوە|شرطة|تحقیق"),
  concept("revenge", "revenge|تۆڵە|انتقام"),
  concept("sea", "sea|ocean|island|shipwreck|دەریا|دوورگە|بحر|محیط|جزیرة"),
  concept("forest", "forest|jungle|دارستان|غابة"),
  concept("school", "school|student|قوتابخانە|قوتابی|مدرسة|طالب"),
  concept("robots", "robot|android|artificial intelligence|ڕۆبۆت|زیرەکی دەستکرد|روبوت|ذکاء اصطناعی"),
  concept("time travel", "time travel|سەفەری کات|گەشت بە کات|سفر عبر الزمن"),
  concept("kidnapping", "kidnap|abduct|ڕفاندن|اختطاف"),
  concept("serial killer", "serial killer|کوژەری زنجیرەیی|قاتل متسلسل"),
];
const languages = [concept("english", "english|ئینگلیزی|انجلیزی"), concept("kurdish", "kurdish|کوردی"), concept("arabic", "arabic|عەرەبی|عربی"), concept("korean", "korean|کۆری"), concept("turkish", "turkish|تورکی")];
const words = (text: string) => descriptionText(text).split(" ").filter(Boolean);
const stem = (word: string) => word.length > 5 ? word.replace(/(?:ەکان|ەکە|ێکی|ێک|کان)$/, "") : word;
function has(text: string, alias: string): boolean {
  if (!text || !alias) return false;
  if (alias.includes(" ")) return (` ${text} `).includes(` ${alias} `);
  // Boundary-aware substring lookup avoids repeatedly splitting long plots.
  return alias.length >= 4 ? (` ${text}`).includes(` ${alias}`) : (` ${text} `).includes(` ${alias} `);
}
const matches = (text: string, item: Concept) => item.aliases.some(alias => has(text, alias));

export function parseDescriptionQuery(query: string) {
  const text = descriptionText(query.slice(0, 500));
  const excluded = genres.filter(item => item.aliases.some(alias =>
    [`not ${alias}`, `no ${alias}`, `without ${alias}`, `نەک ${alias}`, `بێ ${alias}`, `بدون ${alias}`, `${alias} نەبێت`].some(phrase => text.includes(phrase))));
  const wantedGenres = genres.filter(item => matches(text, item) && !excluded.includes(item));
  const wantedTopics = topics.filter(item => matches(text, item));
  const wantedLanguages = languages.filter(item => matches(text, item));
  const recognized = [...wantedGenres, ...excluded, ...wantedTopics, ...wantedLanguages];
  const tokens = [...new Set(words(text).map(stem).filter(word => word.length >= 2 && !stop.has(word) && !/^\d+$/.test(word)
    && !recognized.some(item => item.aliases.some(alias => has(word, alias) || words(alias).includes(word)))))].slice(0, 32);
  const years: string[] = Array.from(text.match(/\b(?:19|20)\d{2}\b/g) || []);
  return { text, tokens, genres: wantedGenres, topics: wantedTopics, languages: wantedLanguages, excluded,
    years, anyGenre: /\b(?:or)\b|یان|او /.test(text) };
}

/** Used only by description mode; the existing title-search/WhatsApp flow is untouched. */
export function descriptionNamedTitle(query: string): string | null {
  const parsed = parseDescriptionQuery(query);
  if (parsed.genres.length || parsed.topics.length || parsed.languages.length || parsed.excluded.length) return null;
  const match = query.match(/(?:فیلمی|فلیمی|فیلمێکی|فلیمێکی|درامای|زنجیرەی)\s+(.+?)(?:\s+(?:دەوێت|دەوێ|پێویستمە|هەیە|بێت))?\s*$/i);
  const title = match?.[1]?.trim();
  if (!title || title.split(/\s+/).length > 6 || /دەربارە|سەبارەت|باس|کە\s|about|where|who/i.test(title)) return null;
  return words(title).some(word => !stop.has(word)) ? title : null;
}

function filmText(film: SearchableFilm) {
  const title = descriptionText(film.title);
  const description = descriptionText(film.description).slice(0, 16000);
  const tags = descriptionText([...(Array.isArray(film.tags) ? film.tags : []), film.category || ""].join(" "));
  return { title, description, tags, all: `${title} ${description} ${tags}`, language: descriptionText(film.language) };
}

/** Hard constraints must also apply to optional model-ranked IDs. */
export function matchesDescriptionConstraints(film: SearchableFilm, query: string): boolean {
  const q = parseDescriptionQuery(query), doc = filmText(film);
  const metadataGenres = genres.filter(item => matches(doc.tags, item));
  // Demon/fantasy plots in animation or comedy are not automatically horror.
  if (!q.anyGenre && q.genres.some(item => item.key === 'horror') && !metadataGenres.some(item => item.key === 'horror') &&
    metadataGenres.some(item => ['animation', 'comedy', 'family'].includes(item.key))) return false;
  const movieGenres = genres.filter(item => matches(doc.tags, item) || matches(doc.description, item));
  if (!movieGenres.some(item => item.key === "horror") && matches(doc.all, topics.find(item => item.key === "haunted")!)) movieGenres.push(genres[0]);
  const genreMatch = (item: Concept) => movieGenres.some(genre => genre.key === item.key);
  if (q.excluded.some(genreMatch)) return false;
  if (q.genres.length && !(q.anyGenre ? q.genres.some(genreMatch) : q.genres.every(genreMatch))) return false;
  if (q.years.length && !q.years.includes(descriptionText(film.year)) && !q.years.some(year => has(doc.title, year))) return false;
  if (q.languages.length && !q.languages.some(item => matches(`${doc.language} ${doc.tags}`, item))) return false;
  const named = descriptionNamedTitle(query);
  if (named && !has(doc.title, descriptionText(named))) return false;
  return true;
}

/** Inverse-frequency scoring uses catalog text, never popularity as relevance. */
export function rankDescriptionMovies<T extends SearchableFilm>(catalog: T[], query: string, limit = 24): T[] {
  const q = parseDescriptionQuery(query);
  const named = descriptionNamedTitle(query);
  const docs = catalog.filter(film => film?.id && film.title).map(film => ({ film, ...filmText(film) }));
  const metadataMatches = (tags: string) => q.anyGenre ? q.genres.some(genre => matches(tags, genre)) : q.genres.every(genre => matches(tags, genre));
  const preferMetadataGenres = q.genres.length > 0 && !q.tokens.length && !q.topics.length &&
    docs.some(doc => metadataMatches(doc.tags));
  const frequencies = new Map(q.tokens.map(token => [token, docs.filter(doc => has(doc.all, token)).length]));
  const ranked = docs.map(doc => {
    if (!matchesDescriptionConstraints(doc.film, query)) return { film: doc.film, score: 0 };
    if (preferMetadataGenres && !metadataMatches(doc.tags)) return { film: doc.film, score: 0 };
    const titlePhrase = q.text.length >= 3 && has(doc.title, q.text);
    const exactDescription = q.text.length >= 16 && has(doc.description, q.text);
    if (named || titlePhrase || exactDescription) return { film: doc.film, score: 200 + (named ? 20 : 0) };
    const topicHits = q.topics.filter(item => matches(doc.all, item)).length;
    if (q.topics.length && topicHits < Math.ceil(q.topics.length * 0.75)) return { film: doc.film, score: 0 };
    let hits = 0, tokenScore = 0;
    for (const token of q.tokens) {
      if (!has(doc.all, token)) continue;
      hits++;
      const rarity = Math.log(1 + docs.length / (1 + (frequencies.get(token) || 0)));
      tokenScore += rarity * (has(doc.title, token) ? 9 : has(doc.tags, token) ? 6 : 4);
    }
    const facets = q.genres.length + q.languages.length + q.years.length + q.excluded.length;
    if (!facets && !topicHits && (!hits || hits < Math.min(2, q.tokens.length))) return { film: doc.film, score: 0 };
    if (!facets && !topicHits && !q.tokens.length) return { film: doc.film, score: 0 };
    // Unknown plot detail must not disappear behind a generic genre match.
    if (q.tokens.length && !hits && !topicHits) return { film: doc.film, score: 0 };
    const genreEvidence = q.genres.filter(item => matches(doc.tags, item)).length * 50;
    return { film: doc.film, score: facets * 20 + genreEvidence + topicHits * 35 + tokenScore + hits / Math.max(1, q.tokens.length) * 10 };
  });
  return ranked.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(50, Math.max(1, limit))).map(item => item.film);
}
