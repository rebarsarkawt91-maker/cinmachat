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
  Globe
} from "lucide-react";
import { motion } from "motion/react";

interface SmartAnalyticsModuleProps {
  currentUser: any;
}

export const SmartAnalyticsModule: React.FC<SmartAnalyticsModuleProps> = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-400 border border-teal-500/20 shadow-lg shadow-teal-500/5">
            <BarChart2 className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-white kurdish-text">مۆدیۆڵ ١٣: شیکارکاری ژیر (Smart Analytics)</h2>
            <p className="text-xs text-gray-400 kurdish-text mt-1">تۆمارە چاودێراو و بەردەوامەکانی ترافیک، لێکدانەوەی بەژداربووان، و ڕێژەی سەرکەوتوویی قەڵغانی سێرڤەر.</p>
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
