# پەیوەستکردنی ئەکاونتەکان لە بەشی ٢٣

## ڕێکخستنی سێرڤەر

لە **Render → cinemachat-server → Environment** ئەم گۆڕاوە پارێزراوانە دابنێ. هەموویان بۆ سێرڤەرن و پێشگری `VITE_` ـیان ناوێت.

| گۆڕاوە | بەکارهێنان |
| --- | --- |
| `SOCIAL_CONNECTIONS_ORIGIN` | `https://www.cinamachat.com` |
| `SOCIAL_CONNECTIONS_ENCRYPTION_KEY` | کلیلێکی هەڕەمەکیی ٣٢ بایتی بە Base64. هەمان کلیل بەکاربهێنە دوای هەر redeploy ـێک و کۆپییەکی پارێزراوی لە secret manager هەڵبگرە. |
| `META_APP_ID`, `META_APP_SECRET` | Meta App ـەکەی Facebook Page و Instagram ـی Professional. |
| `META_FACEBOOK_LOGIN_CONFIG_ID`, `META_INSTAGRAM_LOGIN_CONFIG_ID` | ئەگەر Facebook Login for Business بەکاردەهێنیت، ID ـی ڕێکخستنی هەر پلاتفۆرم. جۆری تۆکن **User access token** هەڵبژێرە. |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | OAuth Client ـی جۆری **Web application** لەو Google Cloud Project ـەی YouTube Data API v3 ـی تێدا چالاکە. |

پاشەکەوتکردن پێویستی بە Firebase Admin ـی کارا هەیە. گۆڕینی کلیلی کۆدکردن بەبێ گواستنەوەی داتا دەستگەیشتن بە پەیوەندییە پاشەکەوتکراوەکانی پێشوو لەکار دەخات.

## Instagram API with Unified Login

لە ئەپی تایبەتی CinamaChat، **Use cases → Instagram API → API setup with Unified login** بکەرەوە. ئەپەکە بە `Business portfolio` ـێک ببەستە کە هەژماری پیشەیی `@cinamachat` ـی تێدایە. لە Facebook Login for Business ڕێکخستنی **System-user access token** و مۆڵەتەکانی `instagram_basic` و `instagram_content_publish` بۆ هەژماری Instagram پێویستن. ناونیشانی گەڕانەوە `https://www.cinamachat.com/api/social-connections/oauth/instagram` ـە. [Instagram API with Unified Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started)

لە سێرڤەری `cinmachat` ـی Render، `META_INSTAGRAM_UNIFIED_APP_ID`، `META_INSTAGRAM_UNIFIED_CONFIG_ID` و `META_INSTAGRAM_UNIFIED_USERNAME=cinamachat` دابنێ. ئەگەر ناسنامەی ئەپەکە هەمان `META_APP_ID` ـە، دەتوانیت `META_INSTAGRAM_UNIFIED_APP_SECRET` بەتاڵ بهێڵیتەوە تا سێرڤەر `META_APP_SECRET` بەکاربهێنێت. بۆ ئەپێکی جیاواز، کلیلە تایبەتەکەی لە `META_INSTAGRAM_UNIFIED_APP_SECRET` دابنێ. بەشی ٢٣ حسابی ڕێگەپێدراو و دەسەڵاتی خوێندنەوەی بڕی پۆستەکان دەپشکنێت. بۆ تاقیکردنەوە `DRY_RUN` بەکاربهێنە.

## ناونیشانی گەڕانەوەی OAuth

- Facebook: `https://www.cinamachat.com/api/social-connections/oauth/facebook`
- Instagram: `https://www.cinamachat.com/api/social-connections/oauth/instagram`
- YouTube: `https://www.cinamachat.com/api/social-connections/oauth/youtube`

لە Meta، هەردوو ناونیشانی Facebook و Instagram لە **Valid OAuth Redirect URIs** تۆمار بکە. ڕێکخستنی Facebook مۆڵەتەکانی `pages_show_list`، `pages_read_engagement` و `pages_manage_posts` دەوێت. Instagram ـی Professional بە Facebook Page ـێکی بەڕێوەبردراو ببەستە و `pages_show_list`، `pages_read_engagement`، `instagram_basic` و `instagram_content_publish` زیاد بکە. [Meta Pages](https://developers.facebook.com/docs/graph-api/reference/page/feed/) · [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)

لە Google، ناونیشانی YouTube لە **Authorized redirect URIs** تۆمار بکە. بەشی ٢٣ `youtube.readonly` بۆ ناسینەوەی کەناڵ و `youtube.upload` بۆ مۆڵەتی ناردنی داهاتوو داوا دەکات. هەژماری خاوەنی کەناڵەکە لە OAuth consent screen ڕێگەپێدراو بێت. [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

## لە داشبۆرد

1. لە BrowserOS Neo بە هەژماری خاوەنی سایت بچۆ ژوورەوە و **Admin → ٢٣. Social Publishing & Automation** بکەرەوە.
2. لە کارتی Facebook، Instagram یان YouTube، **پەیوەستکردن** و **ئامادەکردنی مۆڵەتدان** بکە. پەڕەی فەرمی لە تابێکی نوێ بکەرەوە و مۆڵەت بدە. بگەڕێوە بۆ بەشی ٢٣، **نوێکردنەوەی ئەکاونتەکان** بکە و ئەکاونتەکە هەڵبژێرە و جێگیری بکە.
3. بۆ Telegram، بۆتی `@BotFather` بە مۆڵەتی **Post Messages** بکە بە ئەدمینی کەناڵ. لە کارتی Telegram، Bot Token و `@channel` یان ناسنامەی ژمارەیی کەناڵ داخڵ بکە. بەشی ٢٣ دەسەڵاتی بۆتەکە پشکنین دەکات. [Telegram Bot API](https://core.telegram.org/bots/api#getchatmember)
4. **پشکنینەوە** مۆڵەتی ئەکاونتی پاشەکەوتکراو دەخوێنێتەوە. **لابردنی پەیوەندی** تۆکنەکە لە CinemaChat لادەبات. بۆ هەڵوەشاندنەوەی مۆڵەتی Meta/Google لە خودی پلاتفۆرم یان گۆڕینی تۆکنی بۆت، ڕێکخستنی ئەو پلاتفۆرمە بەکاربهێنە.

پەیوەستکردن بە تەنهایی خشتە یان ناردنی پۆست چالاک ناکات. ئەم وەشانە `DRY_RUN` ـە.
