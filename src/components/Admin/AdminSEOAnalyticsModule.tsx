import React, { useState, useEffect } from "react";
import {
  Search,
  MousePointerClick,
  BarChart2,
  TrendingUp,
  Activity,
  Globe,
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

interface AdminSEOAnalyticsModuleProps {
  currentUser: any;
}

// Standalone "مۆدیۆڵ ٣" SEO & Google Search Analytics section shown directly in
// the main admin navigation. Reads the authenticated /api/admin/seo-stats
// endpoint (admin-guarded) and renders the Search Console dashboard with a
// 7 / 30 / 90-day time filter.
export const AdminSEOAnalyticsModule: React.FC<AdminSEOAnalyticsModuleProps> = ({
  currentUser,
}) => {
  const [seoData, setSeoData] = useState<any>(null);
  const [seoLoading, setSeoLoading] = useState(true);
  const [seoRange, setSeoRange] = useState<number>(30);

  const adminName = currentUser?.username || "Admin";

  const fetchSeo = async (range: number = seoRange) => {
    setSeoLoading(true);
    try {
      const res = await fetch(
        `/api/admin/seo-stats?range=${range}&adminName=${encodeURIComponent(adminName)}`,
        {
          headers: { "x-admin-username": adminName },
        },
      );
      if (res.ok) {
        const json = await res.json();
        setSeoData(json);
      }
    } catch (err) {
      console.error("Failed to load SEO statistics:", err);
    } finally {
      setSeoLoading(false);
    }
  };

  useEffect(() => {
    fetchSeo(seoRange);
  }, [seoRange]);

  const kurdishNum = (n: any) => String(n ?? 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900/40 via-[#0f1013] to-slate-900/40 border border-white/5 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-40 w-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5">
              <Search className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">
                ئامارەکانی SEO & Google Search
              </h2>
              <p className="text-xs text-gray-400 kurdish-text mt-1">
                وشە ڕێنیووەکان، کلیک، ئیمپرێشن و دۆخی ئیندێکس لە Google Search Console.
              </p>
            </div>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 kurdish-text">ماوە:</span>
            <div className="flex items-center gap-1.5">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setSeoRange(d)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border font-mono transition-colors ${
                    seoRange === d
                      ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                      : "bg-[#0f1013] border-white/5 text-gray-400 hover:border-white/20"
                  }`}
                >
                  {d} ڕۆژ
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {seoLoading ? (
        <div className="p-12 text-center text-gray-400 font-medium kurdish-text animate-pulse">
          داگرتنی داتاکانی SEO لە گووگڵ... (Loading Google Search Console data)
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 kurdish-text">کۆی کلیکەکان (Total Clicks)</span>
                <MousePointerClick className="w-4 h-4 text-blue-400 opacity-60" />
              </div>
              <p className="text-2xl font-black font-mono text-white">
                {kurdishNum(seoData?.report?.totals?.clicks)}
              </p>
            </div>
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 kurdish-text">کۆی ئیمپرێشن (Total Impressions)</span>
                <BarChart2 className="w-4 h-4 text-purple-400 opacity-60" />
              </div>
              <p className="text-2xl font-black font-mono text-white">
                {kurdishNum(seoData?.report?.totals?.impressions)}
              </p>
            </div>
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 kurdish-text">تێکڕای CTR (Average CTR)</span>
                <TrendingUp className="w-4 h-4 text-emerald-400 opacity-60" />
              </div>
              <p className="text-2xl font-black font-mono text-white">
                {((Number(seoData?.report?.totals?.ctr) || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 kurdish-text">پلەی تێکڕا (Avg Position)</span>
                <Activity className="w-4 h-4 text-amber-400 opacity-60" />
              </div>
              <p className="text-2xl font-black font-mono text-white">
                {Number(seoData?.report?.totals?.position).toFixed(1)}
              </p>
            </div>
          </div>

          {/* Index Health & Security */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-gray-400 kurdish-text">تەندروستی ئیندێکس</span>
              </div>
              <p className="text-sm font-black text-white kurdish-text mt-1">
                {(seoData?.index?.status || 'unknown') === 'indexed'
                  ? 'بە تەواوی ئیندێکس کراوە (Indexed)'
                  : (seoData?.index?.status || 'unknown') === 'unknown'
                    ? 'نادیار (Unknown)'
                    : 'ئەم پڕۆپێرتییە ئیندێکس نەکراوە'}
              </p>
            </div>
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-gray-400 kurdish-text">هەڵەکانی کڕۆڵ (Crawl Errors)</span>
              </div>
              <p className="text-sm font-black text-white mt-1 font-mono">
                {kurdishNum(seoData?.index?.crawlErrors)}
              </p>
            </div>
            <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#00e1ff]" />
                <span className="text-xs text-gray-400 kurdish-text">ئاگاداری ئەمنییەت</span>
              </div>
              <p className="text-sm font-black kurdish-text mt-1 text-emerald-400">
                {seoData?.index?.securityAlert ? 'ئاگاداری هەیە' : 'ساتکاریەک دۆزراوەتەوە (Healthy)'}
              </p>
            </div>
          </div>

          {/* Top Search Keywords Table */}
          <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-blue-400" />
                بەرزترین وشە ڕێنیووەکان (Top Search Queries)
              </h3>
              {!seoData?.configured && (
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 kurdish-text">
                  داتای نموونەیی (Demo) — پەیوەندی گووگڵ دەستنەکەوتووە
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">#</th>
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">وشە ڕێنیووەکە (Query)</th>
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">کلیک (Clicks)</th>
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">ئیمپرێشن (Impressions)</th>
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">CTR</th>
                    <th className="text-right py-2 pr-2 font-semibold kurdish-text">پلە (Rank/Position)</th>
                  </tr>
                </thead>
                <tbody>
                  {(seoData?.report?.queries || []).map((q: any, idx: number) => (
                    <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-2 text-gray-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 pr-2 text-white font-medium break-words">{q.query}</td>
                      <td className="py-2.5 pr-2 text-blue-400 font-mono font-semibold">{kurdishNum(q.clicks)}</td>
                      <td className="py-2.5 pr-2 text-purple-400 font-mono">{kurdishNum(q.impressions)}</td>
                      <td className="py-2.5 pr-2 text-emerald-400 font-mono">
                        {((Number(q.ctr) || 0) * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pr-2 text-amber-400 font-mono">{Number(q.position).toFixed(1)}</td>
                    </tr>
                  ))}
                  {!(seoData?.report?.queries || []).length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 kurdish-text">
                        هیچ داتایەک بەردەست نییە.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-gray-500 kurdish-text">
              <Globe className="inline w-3 h-3 mr-1" />
              پڕۆپێرتی: {seoData?.siteUrl || 'sc-domain:cinamachat.com'} — ڕۆژانی پێشوو: {seoData?.rangeDays || 30}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSEOAnalyticsModule;
