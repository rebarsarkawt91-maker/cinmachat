// Short Sorani summaries of the studios' published premises. Match by IMDb ID
// so remakes and films that share a title do not inherit each other's synopsis.
const synopses = new Map([
  // https://godzilla.com/pages/godzilla-minus-zero
  ['tt34384661', 'ژاپۆن تازە لە وێرانییەکانی جەنگ ڕادەبێتەوە، کە هەڕەشەیەکی نوێ ئاشتییەکەی دەخاتە مەترسییەوە.'],
  // https://www.catinthehatfilm.com/home/
  ['tt2321555', 'پشیلەکە هەوڵ دەدات دوو منداڵ لە شارێکی نوێ دڵخۆش بکات، بەڵام جادووەکەی هەموو شتێک تێک دەدات.'],
  // https://support.angel.com/hc/en-us/articles/42298616197655-DRUMMER-BOY-FAQ
  ['tt10098420', 'لە جەنگی سەربەخۆیی ئەمریکادا، هەڵبژاردە جیاوازەکانی دوو برا دەیانخاتە دوو بەرەی دژ بە یەک.'],
  // https://ramayanariseofalegend.com/synopsis/
  ['tt27988879', 'پێشبینییەکی کۆن چارەنووسی شاهزادە ڕاما و ڕاڤانا، پاشایەکی نەمر و تۆڵەسێن، بە یەکەوە دەبەستێتەوە.'],
  // https://a24films.com/films/you-can-see-everything
  ['tt45368240', 'پێش چوونە زیندان، ئێلیزابێس هۆڵمز بانگهێشتی تیمێکی بەڵگەنامەساز دەکات تا ژیانی ڕۆژانەی تۆمار بکەن.'],
  // https://www.universalpictures.com/movies/other-mommy/synopsis/
  ['tt36586020', 'بێلا لە ماڵەکەیاندا تووشی بوونەوەرێکی ترسناک دەبێت کە بە شێوەی دایکی خۆی دەردەکەوێت.'],
  // https://www.primevideo.com/detail/0M1QP2ZSCW1HZOHASFENK2P9ZM
  ['tt32261958', 'نووسەرێک بۆ تەواوکردنی کتێبەکانی ڤێریتی دادەمەزرێت و لە تێبینییە نهێنییەکانی ئەو، ڕاستییە ترسناکەکان دەدۆزێتەوە.'],
  // https://residentevil.movie/synopsis/
  ['tt35538033', 'برایان، گەیەنەری کەلوپەلی پزیشکی، لە شەوێکی ترسناکدا دەکەوێتە ناو ملمڵانێیەک بۆ مانەوە.'],
  // https://www.heartofthebeastmovie.ie/home/
  ['tt7526136', 'دوای کەوتنی فڕۆکەکەیان، سەربازێک و سەگەکەی لە سروشتی سەختی ئەلاسکادا بۆ مانەوە تێدەکۆشن.'],
  // https://dev.sonypictures.com/movies/thesocialreckoning
  ['tt37510326', 'ئەندازیارێکی فەیسبووک بە یارمەتیی ڕۆژنامەنووسێک هەوڵ دەدات نهێنییەکانی ئەو تۆڕە ئاشکرا بکات.'],
]);

export function lookupBoxOfficeSynopsis(imdbId?: string): string | undefined {
  return imdbId ? synopses.get(imdbId) : undefined;
}
