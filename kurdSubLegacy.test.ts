import test from "node:test";
import assert from "node:assert/strict";
import { legacySubtitleFileUrl, parseLegacySubtitleListing } from "./kurdSubLegacy";

test("parses distinct public IMDb subtitle rows with language and release", () => {
  const html = `<table>
    <tr onclick="servOC(14075783,'/en/subtitles/14075783/example-en/short-on')" id="name14075783">
      <td><a href="/en/subtitles/14075783/example-en">Example</a><span title="Example &amp; Friends WEB-DL">Release</span></td>
      <td><a title="English" href="/en/search/imdbid-38626703/sublanguageid-eng">English</a></td>
      <td><a href="/en/subtitleserve/sub/14075783">6x</a></td>
    </tr>
    <tr id="name14075782"><td><a href="/en/subtitles/14075782/example-fr">Example</a><span title="French release">Release</span></td>
      <td><a title="French" href="/en/search/imdbid-38626703/sublanguageid-fre">French</a></td></tr>
    <a href="/en/subtitles/14075783/example-en">duplicate link</a></table>`;
  assert.deepEqual(parseLegacySubtitleListing(html), [
    { subtitleId: "14075783", detailUrl: "https://api.opensubtitles.org/en/subtitles/14075783/example-en", language: "English", languageCode: "eng", fileName: "Example & Friends WEB-DL", downloads: 6 },
    { subtitleId: "14075782", detailUrl: "https://api.opensubtitles.org/en/subtitles/14075782/example-fr", language: "French", languageCode: "fre", fileName: "French release", downloads: 0 },
  ]);
});

test("accepts only fixed raw subtitle download host and numeric ID", () => {
  assert.equal(legacySubtitleFileUrl('<a href="https://dl.opensubtitles.org/en/download/file/1962637965">SRT</a>'), "https://dl.opensubtitles.org/en/download/file/1962637965");
  assert.equal(legacySubtitleFileUrl('<a href="https://other.example/en/download/file/1962637965">SRT</a>'), null);
});
