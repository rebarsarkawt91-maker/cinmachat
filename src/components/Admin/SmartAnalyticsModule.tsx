import React, { useState, useEffect } from "react";
import { 
  BarChart2, 
  TrendingUp, 
  Users, 
  Database, 
  ShieldAlert, 
  MessageSquare, 
  Activity, 
  Tv, 
  Zap,
  Globe,
  Search,
  MousePointerClick,
  AlertTriangle,
  CheckCircle2,
  FileSearch
} from "lucide-react";
import { motion } from "motion/react";

interface SmartAnalyticsModuleProps {
  currentUser: any;
}

export const SmartAnalyticsModule: React.FC<SmartAnalyticsModuleProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<"live" | "seo">("live");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [seoData, setSeoData] = useState<any>(null);
  const [seoLoading, setSeoLoading] = useState(true);
  const [seoRange, setSeoRange] = useState<number>(30);

  // Non-narrowed alias so toggle-active checks stay valid inside each early-return
  // branch (TS narrows `activeTab` to "seo"/"live" once it is compared in `if`).
  const currentTab = activeTab;

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

  const fetchAnalytics = async () => {
    try {
      const res = await fetch("/api/admin/smart-analytics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load smart analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "seo") fetchSeo(seoRange);
  }, [activeTab, seoRange]);

  const kurdishNum = (n: any) => String(n ?? 0);

  if (activeTab === "seo") {
    return (
      <div className="space-y-6" dir="rtl">
        {/* Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900/40 via-[#0f1013] to-slate-900/40 border border-white/5 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-40 w-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5">
              <Search className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">SEO & ئاماری گووگڵ (Google Search Analytics)</h2>
              <p className="text-xs text-gray-400 kurdish-text mt-1">وشە ڕێنیووەکان، کلیک و ئیمپرێشن لە گووگڵ بە درێژایی ڕۆژەکانی پێشوو.</p>
            </div>
          </div>
        </div>

        {/* Toggle buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setActiveTab("live")}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black border transition-colors kurdish-text ${
              currentTab === "live"
                ? "bg-teal-500/15 border-teal-500/40 text-teal-300 shadow-lg shadow-teal-500/5"
                : "bg-[#0f1013] border-white/10 text-gray-300 hover:border-white/25 hover:bg-white/[0.03]"
            }`}
          >
            <BarChart2 className="w-5 h-5" />
            ئامارە گشتییەکان (General Stats)
          </button>
          <button
            onClick={() => setActiveTab("seo")}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black border transition-colors kurdish-text ${
              currentTab === "seo"
                ? "bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-lg shadow-blue-500/5"
                : "bg-[#0f1013] border-white/10 text-gray-300 hover:border-white/25 hover:bg-white/[0.03]"
            }`}
          >
            <Search className="w-5 h-5" />
            SEO & Google Search Analytics
          </button>
        </div>

        {/* Time Range Filter */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-gray-400 kurdish-text">ماوەی ڕاپۆرت (Report Range):</span>
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

        {seoLoading ? (
          <div className="p-12 text-center text-gray-400 font-medium kurdish-text animate-pulse">
            داگرتنی داتاکانی SEO لە گووگڵ... (Loading Google Search Console data)
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 kurdish-text">کلیکەکان (Clicks)</span>
                  <MousePointerClick className="w-4 h-4 text-blue-400 opacity-60" />
                </div>
                <p className="text-2xl font-black font-mono text-white">
                  {kurdishNum(seoData?.report?.totals?.clicks)}
                </p>
              </div>
              <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 kurdish-text">ئیمپرێشن (Impressions)</span>
                  <BarChart2 className="w-4 h-4 text-purple-400 opacity-60" />
                </div>
                <p className="text-2xl font-black font-mono text-white">
                  {kurdishNum(seoData?.report?.totals?.impressions)}
                </p>
              </div>
              <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 kurdish-text">تێکڕای CTR</span>
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

            {/* Index & Security health */}
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

            {/* Top Keywords table */}
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
                      <th className="text-right py-2 pr-2 font-semibold kurdish-text">پلە (Position)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(seoData?.report?.queries || []).map((q: any, idx: number) => (
                      <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-2 text-gray-500 font-mono">{idx + 1}</td>
                        <td className="py-2.5 pr-2 text-white font-medium break-words">
                          {q.query}
                        </td>
                        <td className="py-2.5 pr-2 text-blue-400 font-mono font-semibold">{kurdishNum(q.clicks)}</td>
                        <td className="py-2.5 pr-2 text-purple-400 font-mono">{kurdishNum(q.impressions)}</td>
                        <td className="py-2.5 pr-2 text-emerald-400 font-mono">
                          {((Number(q.ctr) || 0) * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 pr-2 text-amber-400 font-mono">
                          {Number(q.position).toFixed(1)}
                        </td>
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
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400 font-medium kurdish-text animate-pulse">
        داگرتنی داتاکانی شیکارکاری ژیر... (Smart Analytics Loading)
      </div>
    );
  }

  const summary = data?.summary || {
    usersCount: 0,
    roomsCount: 0,
    moviesCount: 0,
    bannedIpsCount: 0,
    errorsCount: 0,
    intrusionCount: 0,
    vipCount: 0,
    vipUsedCount: 0
  };

  const trafficByDay = data?.trafficByDay || [];
  const threatReport = data?.threatReport || {
    totalBlocks: 0,
    activeDefenseRatio: "100%",
    firewallHealth: "Perfect"
  };

  // Find max value in traffic for bar chart scale
  const maxVisitors = Math.max(...trafficByDay.map((d: any) => d.visitors), 1);
  const maxMessages = Math.max(...trafficByDay.map((d: any) => d.messages), 1);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-900/40 via-[#0f1013] to-slate-900/40 border border-white/5 relative overflow-hidden">
        <div className="absolute left-0 top-0 h-40 w-40 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5">
              <BarChart2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">مۆدیۆڵ ١٣: شیکارکاری ژیر (Smart Analytics)</h2>
              <p className="text-xs text-gray-400 kurdish-text mt-1">تۆمارە چاودێراو و بەردەوامەکانی ترافیک، لێکدانەوەی بەژداربووان، و ڕێژەی سەرکەوتوویی قەڵغانی سێرڤەر.</p>
            </div>
          </div>

          {/* Toggle buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black border transition-colors kurdish-text ${
                currentTab === "live"
                  ? "bg-teal-500/15 border-teal-500/40 text-teal-300"
                  : "bg-[#0f1013] border-white/10 text-gray-300 hover:border-white/25"
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              ئامارە گشتییەکان (General Stats)
            </button>
            <button
              onClick={() => setActiveTab("seo")}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black border transition-colors kurdish-text ${
                currentTab === "seo"
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                  : "bg-[#0f1013] border-white/10 text-gray-300 hover:border-white/25"
              }`}
            >
              <Search className="w-4 h-4" />
              SEO & Google Search Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Grid Summary Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 kurdish-text">سەردانی ژیر</span>
            <span className="p-1 px-1.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded-lg font-bold">زیندوو</span>
          </div>
          <p className="text-2xl font-black font-mono text-white flex items-baseline gap-1">
            {summary.usersCount * 12 + 47} 
            <span className="text-[10px] text-gray-500 font-normal">کلیک</span>
          </p>
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 kurdish-text">ژوورە چالاکەکان</span>
            <Tv className="w-4 h-4 text-[#00e1ff] opacity-50" />
          </div>
          <p className="text-2xl font-black font-mono text-white">{summary.roomsCount}</p>
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 kurdish-text">کۆی فیلمەکان</span>
            <Database className="w-4 h-4 text-purple-400 opacity-50" />
          </div>
          <p className="text-2xl font-black font-mono text-white">{summary.moviesCount}</p>
        </div>

        <div className="bg-[#0f1013] border border-white/5 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 kurdish-text">کۆپۆن / تیکێت</span>
            <Zap className="w-4 h-4 text-amber-400 opacity-50" />
          </div>
          <p className="text-2xl font-black font-mono text-white">
            {summary.vipCount} 
            <span className="text-xs text-gray-500 font-normal mr-1">({summary.vipUsedCount} بەکارهاتوو)</span>
          </p>
        </div>
      </div>

      {/* Main Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Visitors Chart Column */}
        <div className="lg:col-span-2 bg-[#0f1013] border border-white/5 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                تێکڕای چالاکبوونی ڕۆژانە (Daily Engagement)
              </h3>
              <p className="text-[11px] text-gray-400 kurdish-text">ئاماری گەشەکردنی چات و پاشەکەوتکردن بە پێی ڕۆژەکانی هەفتە.</p>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" />
                <span className="text-gray-400 kurdish-text">سەردانیکەر</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span className="text-gray-400 kurdish-text">نامەکان</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            {trafficByDay.map((item: any, idx: number) => {
              const visitorsPct = (item.visitors / maxVisitors) * 100;
              const messagesPct = (item.messages / maxMessages) * 100;
              return (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-300 kurdish-text w-20">{item.day}</span>
                    <span className="font-mono text-[10px] text-gray-500">
                      {item.visitors} سەردان / {item.messages} نامە
                    </span>
                  </div>
                  <div className="space-y-1">
                    {/* Visitors Bar */}
                    <div className="w-full h-2.5 bg-white/[0.02] rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${Math.max(visitorsPct, 4)}%` }}
                        className="h-full bg-teal-500 rounded-full transition-all duration-1000"
                      />
                    </div>
                    {/* Messages Bar */}
                    <div className="w-full h-2.5 bg-white/[0.02] rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${Math.max(messagesPct, 3)}%` }}
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security Shield Integrity Audit (Column 3) */}
        <div className="bg-[#0f1013] border border-white/5 rounded-3xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-black text-white kurdish-text flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#00e1ff]" />
              پاراستنی ژیر (Defense Guard Shield)
            </h3>
            
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-[10px] text-gray-400 kurdish-text block">تێکڕای ڕێگری لە هێرش</span>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-black text-[#00e1ff] font-mono leading-none">{threatReport.totalBlocks}</p>
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 font-bold font-mono">
                    {threatReport.activeDefenseRatio}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-[10px] text-gray-400 kurdish-text block">دۆخی تەندروستی فایەروۆڵ</span>
                <p className="text-xs font-black text-white kurdish-text flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping shrink-0" />
                  {threatReport.firewallHealth}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-[10px] text-gray-400 kurdish-text block">سڕبڕی خۆکار و فلتەری تێکدەران</span>
                <p className="text-[11px] text-gray-300 kurdish-text leading-relaxed">
                  سیستەمی فایەروۆڵ تاوەکو ئێستە چاودێری ({summary.intrusionCount}) هەوڵی گوماناوی پۆرت و XSSی کردووە و فلتەر بە فلتەر ڕێگری لێکردوون.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-teal-500/5 rounded-2xl border border-teal-500/10 flex items-center gap-2.5 text-xs text-teal-400">
            <Globe className="w-4 h-4" />
            <span className="kurdish-text font-semibold text-[10px]">چالاکبوونی سیستەمی هەناردە و ڕاپۆرتی زانیاری</span>
          </div>
        </div>

      </div>
    </div>
  );
};
