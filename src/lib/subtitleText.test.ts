import test from "node:test";
import assert from "node:assert/strict";
import { stripSubtitleHtmlTags } from "./subtitleText";

test("removes subtitle formatting tags without changing dialogue", () => {
  assert.equal(
    stripSubtitleHtmlTags('<i>♪ If ya feel real good</i> - <b>ئەمە</b> <font color="red">باشە؟</font>'),
    "♪ If ya feel real good - ئەمە باشە؟",
  );
});

test("removes HTML-escaped formatting tags from sanitized requests", () => {
  assert.equal(
    stripSubtitleHtmlTags("&lt;i&gt;- Yeah, yeah ♪&lt;/i&gt; &lt;font color=&quot;red&quot;&gt;سڵاو&lt;/font&gt;"),
    "- Yeah, yeah ♪ سڵاو",
  );
});
