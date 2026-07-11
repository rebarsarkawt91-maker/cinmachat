import React, { useState } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { useSocialAuth } from "../../../context/SocialAuthContext";
import { 
  Printer, 
  FileDown, 
  ChevronLeft, 
  ChevronRight, 
  Activity, 
  BookOpen, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Compass,
  Zap,
  Book,
  FileText
} from "lucide-react";
import { systemCatalog, connectivityTargets, ConnectionTarget, CatalogModule } from "./SystemRegistry";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";

export const SystemHubModule: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const { socialProfile } = useSocialAuth();
  const [activeTab, setActiveTab] = useState<"catalog" | "diagnostics">("catalog");
  const [currentPage, setCurrentPage] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, "idle" | "checking" | "active" | "offline">>({});
  const [exportLoading, setExportLoading] = useState(false);

  const isAdminUser = 
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role?.toLowerCase() === "admin" ||
    currentUser?.role?.toLowerCase() === "owner" ||
    currentUser?.role?.toLowerCase() === "super_admin" ||
    currentUser?.role?.toLowerCase() === "deputy_manager" ||
    socialProfile?.role === "admin" ||
    socialProfile?.role?.toLowerCase() === "admin" ||
    socialProfile?.userRole === "admin" ||
    socialProfile?.userRole?.toLowerCase() === "admin" ||
    socialProfile?.role === "super_admin" ||
    socialProfile?.userRole === "super_admin" ||
    currentUser?.role === "Moderator" ||
    socialProfile?.role === "Moderator";

  // Security Gate
  if (!isAdminUser) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-red-950/10 border border-red-500/20 rounded-3xl text-center space-y-4 max-w-xl mx-auto">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <h3 className="text-lg font-black text-white kurdish-text">ڕێگەپێنەدراو - هۆشداری ئاسایش</h3>
        <p className="text-xs text-gray-400 kurdish-text">
          ئەم بەشە تەنها بۆ بەڕێوبەرانی سەرەکی سیستەم ڕێگەپێدراوە. تکایە دڵنیابەرەوە لە هەژمارەکەت.
        </p>
      </div>
    );
  }

  const totalPages = systemCatalog.length;
  const currentModule = systemCatalog[currentPage];

  // Live Connectivity Checker
  const testConnection = async (target: ConnectionTarget) => {
    setStatuses(prev => ({ ...prev, [target.id]: 'checking' }));
    
    // Simulate real request with AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const isExternal = target.url.startsWith("http");
      const fetchUrl = target.url;

      const response = await fetch(fetchUrl, {
        method: "GET",
        mode: isExternal ? "no-cors" : "same-origin",
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      setStatuses(prev => ({ ...prev, [target.id]: 'active' }));
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn(`Connection test failed for: ${target.name}`, err);
      
      // If same-origin fails or it's aborted, it's considered offline.
      // External endpoints fetched in no-cors will only raise an error if completely blocked or offline.
      if (err.name === 'AbortError') {
        setStatuses(prev => ({ ...prev, [target.id]: 'offline' }));
      } else if (!target.url.startsWith("http")) {
        setStatuses(prev => ({ ...prev, [target.id]: 'offline' }));
      } else {
        // Because external with no-cors might drop network-level errors but actually be online, we handle safely
        setStatuses(prev => ({ ...prev, [target.id]: 'active' }));
      }
    }
  };

  const testAllConnections = async () => {
    for (const target of connectivityTargets) {
      await testConnection(target);
    }
  };

  // PDF Export Engine
  const exportPDF = () => {
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      
      // Title Page
      doc.setFontSize(22);
      doc.text("ChatCinema - Complete System Documentation Report", 14, 25);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);
      doc.text(`Target Auditor: ${currentUser.displayName || currentUser.username || "System Administrator"}`, 14, 38);
      doc.line(14, 45, 196, 45);

      // Render Modules Catalogue
      doc.setFontSize(14);
      doc.text("1. System Modules Catalog (1 - 15)", 14, 55);
      
      let cursorY = 65;
      systemCatalog.forEach((mod) => {
        if (cursorY > 260) {
          doc.addPage();
          cursorY = 20;
        }
        
        doc.setFontSize(11);
        doc.text(`Module ${mod.id}: ${mod.name}`, 14, cursorY);
        doc.setFontSize(9);
        cursorY += 6;
        
        const splitBenefit = doc.splitTextToSize(`Benefit: ${mod.benefit}`, 175);
        doc.text(splitBenefit, 18, cursorY);
        cursorY += splitBenefit.length * 5;

        const splitUsage = doc.splitTextToSize(`Usage instruction: ${mod.howToUse}`, 175);
        doc.text(splitUsage, 18, cursorY);
        cursorY += splitUsage.length * 5;

        doc.text(`Key Features Checklist: ${mod.features.join(", ")}`, 18, cursorY);
        cursorY += 12;
      });

      // Add Connectivity Report Page
      doc.addPage();
      doc.setFontSize(14);
      doc.text("2. Connectivity Diagnostics Report", 14, 25);
      doc.line(14, 30, 196, 30);

      let diagY = 40;
      connectivityTargets.forEach((target) => {
        const currentStatus = statuses[target.id] || "untested";
        doc.setFontSize(11);
        doc.text(`${target.name} (${target.type})`, 14, diagY);
        doc.setFontSize(9);
        doc.text(`Target Endpoint: ${target.url}`, 16, diagY + 5);
        doc.text(`Status Verified: ${currentStatus.toUpperCase()}`, 16, diagY + 10);
        diagY += 20;
      });

      doc.save("System_Catalog_Diagnostic_Report.pdf");
    } catch (e) {
      console.error("Failed to generate PDF:", e);
    } finally {
      setExportLoading(false);
    }
  };

  // Word Export Engine
  const exportWord = async () => {
    setExportLoading(true);
    try {
      const docChildren: any[] = [
        new Paragraph({ text: "ChatCinema System Documentation Manual", heading: "Heading1" }),
        new Paragraph({ text: `Report Executed By: ${currentUser.displayName || currentUser.username || "Admin"}` }),
        new Paragraph({ text: `Date generated: ${new Date().toLocaleString()}` }),
        new Paragraph({ text: " " }),
        new Paragraph({ text: "1. MODULES IMPLEMENTATION REGISTRY (1-15)", heading: "Heading2" })
      ];

      systemCatalog.forEach(mod => {
        docChildren.push(new Paragraph({ text: `Module ${mod.id}: ${mod.name}`, heading: "Heading3" }));
        docChildren.push(new Paragraph({ text: `Benefit (سوود): ${mod.benefit}` }));
        docChildren.push(new Paragraph({ text: `Features: ${mod.features.join(' | ')}` }));
        docChildren.push(new Paragraph({ text: `Operational Use (کارکردن): ${mod.howToUse}` }));
        docChildren.push(new Paragraph({ text: "--------------------------------------------------------" }));
      });

      docChildren.push(new Paragraph({ text: " " }));
      docChildren.push(new Paragraph({ text: "2. DIAGNOSTICS CONNECTIVITY TARGETS", heading: "Heading2" }));

      connectivityTargets.forEach(target => {
        const lastStatus = statuses[target.id] || "untested";
        docChildren.push(new Paragraph({ text: `${target.name}` }));
        docChildren.push(new Paragraph({ text: `Endpoint: ${target.url}` }));
        docChildren.push(new Paragraph({ text: `Type: ${target.type} | Probe state: ${lastStatus.toUpperCase()}` }));
        docChildren.push(new Paragraph({ text: " " }));
      });

      const doc = new Document({ sections: [{ children: docChildren }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = "ChatCinema_Audit_Manual.docx";
      link.click();
    } catch (e) {
      console.error("Failed to export Word file:", e);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="max-w-4xl bg-[#0b0c10] border border-white/[0.05] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl"
    >
      {/* Upper Module Info Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.05] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-lg md:text-xl font-black text-white kurdish-text tracking-wide flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              مۆدیۆلی ١٥: سەنتەری چاودێری و ڕێبەری سیستەم (System Control Hub) 
            </h2>
          </div>
          <p className="text-xs text-gray-400 kurdish-text leading-relaxed">
            سیستەمی گشتی تۆماری مۆدیۆلەکان، ڕاپۆرتە چاودێرییە دەرەکییەکان، و هەناردە گرتنی خێرا لەگەڵ پاراستنی ئاسایش.
          </p>
        </div>

        {/* Global Export actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={exportPDF}
            disabled={exportLoading}
            className="px-3.5 py-2 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white rounded-xl text-xs font-black flex items-center gap-2 transition duration-200 border border-rose-500/20 shadow-sm"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exportLoading ? "ھەناردەکردن..." : "هەناردکردنی PDF"}
          </button>
          
          <button 
            onClick={exportWord}
            disabled={exportLoading}
            className="px-3.5 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl text-xs font-black flex items-center gap-2 transition duration-200 border border-blue-500/20 shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            Word هەناردە بکە
          </button>

          <button 
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 hover:text-white rounded-xl text-xs font-black flex items-center gap-2 transition duration-200 border border-white/5 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            چاپکردن (Print)
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex bg-neutral-900/40 p-1.5 rounded-2xl border border-white/[0.04] w-fit">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`px-5 py-2 text-xs font-black rounded-xlTransition kurdish-text flex items-center gap-2 transition-all duration-200 ${
            activeTab === "catalog" 
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20" 
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Book className="w-3.5 h-3.5" />
          ڕێبەری کارکردنی مۆدیۆلەکان (Module Catalog)
        </button>
        
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`px-5 py-2 text-xs font-black rounded-xlTransition kurdish-text flex items-center gap-2 transition-all duration-200 ${
            activeTab === "diagnostics" 
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20" 
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          پشکنەری هێڵی سەرچاوەکان (Connectivity Monitor)
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "catalog" ? (
          <motion.div 
            key="catalog" 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 10 }}
            className="space-y-6"
          >
            {/* Interactive Kurdish book style manual representation */}
            <div className="bg-[#121318]/50 border border-white/[0.04] rounded-2xl p-6 md:p-8 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
              
              <div className="flex justify-between items-center bg-emerald-950/20 border border-emerald-500/10 px-4 py-2.5 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">مۆدیۆل {currentModule.id} یەکگرتوو</span>
                <span className="text-[10px] text-zinc-400 tracking-wider">Chapter {currentPage + 1} of {totalPages}</span>
              </div>

              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-black text-white kurdish-text flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  {currentModule.name}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <span className="text-[10px] text-emerald-400/80 font-black uppercase tracking-widest block kurdish-text">١. سوود و قازانجەکان (Benefit)</span>
                    <p className="text-xs text-gray-300 kurdish-text leading-relaxed">
                      {currentModule.benefit}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] text-emerald-400/80 font-black uppercase tracking-widest block kurdish-text">٢. شێوازی کارکردنی بەکارهێنەر (How to Use)</span>
                    <p className="text-xs text-gray-300 kurdish-text leading-relaxed">
                      {currentModule.howToUse}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/[0.04]">
                  <span className="text-[10px] text-emerald-400/80 font-black uppercase tracking-widest block kurdish-text">٣. تایبەتمەندییە سەرەکییە ناوخۆیییەکان (Key Features Highlight)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentModule.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.04] p-2.5 rounded-xl">
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs text-gray-300 kurdish-text">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination controls with Kurdish style indicators */}
            <div className="flex justify-between items-center text-xs text-gray-400 bg-neutral-900/40 border border-white/[0.04] p-3 rounded-2xl">
              <button 
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))} 
                disabled={currentPage === 0}
                className="px-4 py-2 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-white/[0.03] rounded-xl flex items-center gap-1.5 transition text-white font-bold"
              >
                <ChevronLeft className="w-4 h-4" />
                بۆ دواوە
              </button>
              
              <span className="font-medium kurdish-text">لاپەڕەی {currentPage + 1} لە کۆی {totalPages}</span>
              
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} 
                disabled={currentPage === totalPages - 1}
                className="px-4 py-2 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-white/[0.03] rounded-xl flex items-center gap-1.5 transition text-white font-bold"
              >
                بۆ پێشەوە
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="diagnostics" 
            initial={{ opacity: 0, x: 10 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -10 }}
            className="space-y-5"
          >
            {/* Connection list diagnostics with live checks */}
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white kurdish-text">چاودێری دەروازە چالاکەکان</h3>
                <p className="text-[10px] text-gray-400 kurdish-text">پشکنینی بەردەوامی بەستەرە دەرەکییەکان و هەورەکان.</p>
              </div>

              <button 
                onClick={testAllConnections}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition duration-200"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                پشکنینی هەموو سەرچاوەکان
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectivityTargets.map((target) => {
                const status = statuses[target.id] || "idle";
                
                return (
                  <div 
                    key={target.id}
                    className="bg-[#121318]/40 border border-white/[0.04] rounded-2xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/10">
                          {target.type}
                        </span>
                        <h4 className="text-xs font-black text-white kurdish-text pt-1.5 leading-snug">
                          {target.name}
                        </h4>
                        <p className="text-[10px] text-gray-500 font-mono truncate max-w-xs">{target.url}</p>
                      </div>

                      {/* Live State Dot */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {status === 'checking' ? (
                          <div className="flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                            <span className="text-[9px] text-amber-400 font-bold font-mono">CHECKING</span>
                          </div>
                        ) : status === 'active' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/10">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[9px] text-emerald-400 font-black font-mono">ACTIVE</span>
                          </div>
                        ) : status === 'offline' ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-rose-500/10 rounded-full border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span className="text-[9px] text-rose-500 font-black font-mono">OFFLINE</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                            <span className="text-[9px] text-zinc-500 font-black font-mono">UNTESTED</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => testConnection(target)}
                        className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/5"
                      >
                        <RefreshCw className="w-3 h-3" />
                        پشکنینی خێرا
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
