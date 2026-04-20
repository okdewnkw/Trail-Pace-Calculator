import React, { useState, useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import { Upload, RefreshCw, Settings, Info, Plus, Trash2, ArrowUp, ArrowDown, HelpCircle, X } from 'lucide-react';
import { parseGPX, extractSegmentsFromWaypoints, generateEvenSegments, GpxData, Segment } from '../lib/gpxParser';
import { formatTime, cn, addHoursToTimeStr } from '../lib/utils';

const DEMO_GPX: GpxData = {
  points: [
     { lat: 0, lon: 0, ele: 100, dist: 0, asc: 0, desc: 0 },
     { lat: 0, lon: 0, ele: 600, dist: 5.2, asc: 500, desc: 0 },
     { lat: 0, lon: 0, ele: 400, dist: 14.5, asc: 900, desc: 600 },
     { lat: 0, lon: 0, ele: 300, dist: 23.0, asc: 1200, desc: 1000 },
  ],
  waypoints: [
     { name: "起點", lat: 0, lon: 0, dist: 0 },
     { name: "CP1 (林徑)", lat: 0, lon: 0, dist: 5.2 },
     { name: "CP2 (陡上切)", lat: 0, lon: 0, dist: 14.5 },
     { name: "終點 (會場)", lat: 0, lon: 0, dist: 23.0 }
  ],
  totalDistance: 23.0,
  totalAscent: 1200,
  totalDescent: 1000
};

const DEMO_SEGMENTS: Segment[] = [
  { id: 'demo-1', name: 'CP1 (林徑)', startDist: 0, endDist: 5.2, distance: 5.2, ascent: 500, descent: 0, eph: 10, ephScale: 100, restTime: 5 },
  { id: 'demo-2', name: 'CP2 (陡上切)', startDist: 5.2, endDist: 14.5, distance: 9.3, ascent: 400, descent: 600, eph: 10, ephScale: 80, restTime: 10 },
  { id: 'demo-3', name: '終點 (會場)', startDist: 14.5, endDist: 23.0, distance: 8.5, ascent: 300, descent: 400, eph: 10, ephScale: 120, restTime: 0 }
];

export default function PaceCalculator() {
  const [gpxData, setGpxData] = useState<GpxData | null>(DEMO_GPX);
  const [segments, setSegments] = useState<Segment[]>(DEMO_SEGMENTS);
  const [isDemo, setIsDemo] = useState<boolean>(true);
  const [fileName, setFileName] = useState<string>('');
  const [globalEph, setGlobalEph] = useState<number>(10);
  const [startTime, setStartTime] = useState<string>("06:00");
  const [segmentCount, setSegmentCount] = useState<number>(5);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  
  const exportRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseGPX(text);
        setGpxData(parsed);
        setIsDemo(false);
        if (parsed.waypoints.length > 0) {
          setSegments(extractSegmentsFromWaypoints(parsed, globalEph));
        } else {
          setSegments(generateEvenSegments(parsed, segmentCount, globalEph));
        }
      }
    };
    reader.readAsText(file);
  };

  const recalculateAllSegments = (currentSegments: Segment[], data: GpxData) => {
    const newSegments = [...currentSegments];
    let currentStartDist = 0;
    
    for (let i = 0; i < newSegments.length; i++) {
      let targetEndDist = currentStartDist + newSegments[i].distance;
      if (i === newSegments.length - 1) {
        targetEndDist = data.totalDistance;
        newSegments[i].distance = targetEndDist - currentStartDist;
      } else {
        targetEndDist = Math.min(targetEndDist, data.totalDistance);
        newSegments[i].distance = Math.max(0.1, targetEndDist - currentStartDist); // ensure at least 0.1km limits
        targetEndDist = currentStartDist + newSegments[i].distance;
      }
      
      const startPointMatch = data.points.reduce((prev, curr) => 
        Math.abs(curr.dist - currentStartDist) < Math.abs(prev.dist - currentStartDist) ? curr : prev
      );
      const endPointMatch = (i === newSegments.length - 1)
        ? data.points[data.points.length - 1]
        : data.points.reduce((prev, curr) => 
            Math.abs(curr.dist - targetEndDist) < Math.abs(prev.dist - targetEndDist) ? curr : prev
          );

      newSegments[i].startDist = currentStartDist;
      newSegments[i].endDist = targetEndDist;
      newSegments[i].ascent = endPointMatch.asc - startPointMatch.asc;
      newSegments[i].descent = endPointMatch.desc - startPointMatch.desc;
      
      currentStartDist = targetEndDist;
    }
    return newSegments;
  };

  const handleSegmentChange = (index: number, field: keyof Segment, value: number | string) => {
    const newSegments = [...segments];
    newSegments[index] = { ...newSegments[index], [field]: value };
    setSegments(newSegments);
  };

  const handleSegmentDistanceChange = (index: number, newDistance: number) => {
    if (!gpxData) return;
    const newSegments = [...segments];
    newSegments[index].distance = newDistance;
    setSegments(recalculateAllSegments(newSegments, gpxData));
  };

  const handleSplitSegment = (index: number) => {
    if (!gpxData) return;
    const seg = segments[index];
    const halfDist = seg.distance / 2;
    
    const newSegments = [...segments];
    newSegments[index] = { ...seg, distance: halfDist };
    
    const newSeg: Segment = {
      id: `split-${Date.now()}`,
      name: `${seg.name} (拆分)`,
      startDist: 0, endDist: 0, distance: halfDist, ascent: 0, descent: 0,
      eph: seg.eph, ephScale: seg.ephScale, restTime: seg.restTime
    };
    
    newSegments.splice(index + 1, 0, newSeg);
    setSegments(recalculateAllSegments(newSegments, gpxData));
  };

  const handleMoveSegment = (index: number, direction: -1 | 1) => {
    if (!gpxData) return;
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === segments.length - 1) return;

    const newSegments = [...segments];
    const targetIndex = index + direction;
    
    const temp = newSegments[index];
    newSegments[index] = newSegments[targetIndex];
    newSegments[targetIndex] = temp;

    setSegments(recalculateAllSegments(newSegments, gpxData));
  };

  const handleDeleteSegment = (index: number) => {
    if (!gpxData || segments.length <= 1) return;
    const newSegments = [...segments];
    const deletedDist = newSegments[index].distance;
    
    if (index < newSegments.length - 1) {
      newSegments[index + 1].distance += deletedDist;
    } else {
      newSegments[index - 1].distance += deletedDist;
    }
    
    newSegments.splice(index, 1);
    setSegments(recalculateAllSegments(newSegments, gpxData));
  };

  const handleApplyGlobalEph = () => {
    setSegments(segments.map(s => ({ ...s, eph: globalEph })));
  };

  const handleSplitEvenly = () => {
    if (gpxData) {
      setSegments(generateEvenSegments(gpxData, segmentCount, globalEph));
    }
  };

  const handleExportImage = () => {
    if (exportRef.current) {
      htmlToImage.toPng(exportRef.current, { backgroundColor: '#ffffff' })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = 'pace-plan.png';
          link.href = dataUrl;
          link.click();
        })
        .catch((err) => {
          console.error('oops, something went wrong!', err);
        });
    }
  };

  let cumulativeTimeHours = 0;
  let cumulativeDist = 0;
  let cumulativeAsc = 0;
  let cumulativeDesc = 0;

  // Calculate totals in advance for top summary
  let totalTimeHours = 0;
  let totalDist = 0;
  let totalAsc = 0;
  let totalDesc = 0;
  
  segments.forEach(seg => {
    const ep = seg.distance + (seg.ascent / 100);
    const effectiveEph = (Number(seg.eph) || 10) * ((Number(seg.ephScale) || 100) / 100);
    const movingHours = ep / effectiveEph;
    const restHours = (Number(seg.restTime) || 0) / 60;
    totalTimeHours += movingHours + restHours;
    totalDist += seg.distance;
    totalAsc += seg.ascent;
    totalDesc += seg.descent;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex flex-col font-sans">
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center text-xl font-extrabold text-blue-600 tracking-tight">
          TrailPacer<span className="font-normal text-slate-500 ml-1.5 text-lg">Pro</span>
          {fileName && !isDemo ? (
            <span className="font-normal text-slate-400 ml-2 text-base border-l border-slate-300 pl-2 truncate max-w-[200px] md:max-w-[400px]" title={fileName}>
              {fileName}
            </span>
          ) : (
            <span className="font-normal text-slate-500 ml-1.5 text-lg hidden sm:inline">/ 越野策略分析</span>
          )}
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowHelp(true)}
            className="flex items-center justify-center p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            title="使用說明"
          >
            <HelpCircle size={20} />
          </button>
          <label className="flex items-center justify-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-md cursor-pointer transition-colors text-sm font-semibold">
            匯入 GPX
            <input type="file" accept=".gpx" className="hidden" onChange={handleFileUpload} />
          </label>
          {gpxData && (
            <button 
              onClick={handleExportImage}
              className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold transition-colors"
            >
              匯出配速表圖片
            </button>
          )}
        </div>
      </header>

      <main className="flex-grow max-w-[1400px] w-full mx-auto p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-5 items-start overflow-hidden">
        {!gpxData ? (
          <div className="col-span-1 lg:col-span-2 border-2 border-dashed border-slate-300 rounded-[12px] p-12 text-center bg-white flex flex-col items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.1)] py-24">
            <Upload className="w-12 h-12 text-blue-500 mb-4" />
            <h2 className="text-xl font-bold mb-2 text-slate-700">準備開始規畫你的配速</h2>
            <p className="text-slate-500 mb-6 max-w-md">這是一個專為越野跑者設計的工具，透過 EPH (Effort Points per Hour) 概念，幫助你在不同難度的地形中精準分配體力。</p>
            <label className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm cursor-pointer transition-colors font-semibold">
              <Upload size={18} />
              選擇 GPX 檔案
              <input type="file" accept=".gpx" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        ) : (
          <>
            {/* Left Column */}
            <div className="flex flex-col gap-5 h-full overflow-hidden">
              {isDemo && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-[12px] p-4 flex gap-3 text-sm shrink-0 shadow-sm items-center">
                  <Info className="shrink-0 text-amber-500" size={24} />
                  <div className="flex-grow">
                    <p className="font-bold text-amber-900 text-base mb-0.5">目前顯示為範例路線</p>
                    <p className="text-amber-700 opacity-90">這裡為您展示匯入 GPX 後的完整介面，您可以體驗各項加權與 VAM 等功能。請點擊右邊按鈕或上方「匯入 GPX」開始您自己的配速規畫。</p>
                  </div>
                  <label className="shrink-0 flex items-center justify-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md cursor-pointer transition-colors text-sm font-semibold shadow-sm ml-2">
                    <Upload size={16} className="mr-2" />
                    匯入 GPX
                    <input type="file" accept=".gpx" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              )}

              {!isDemo && (
                <div className="bg-blue-50 text-blue-800 rounded-[12px] p-4 flex gap-3 text-[0.8rem] shrink-0 shadow-sm">
                  <Info className="shrink-0 mt-0.5" size={18} />
                  <p>
                    {gpxData.waypoints.length > 0 
                      ? `系統已偵測到 ${gpxData.waypoints.length} 個檢查點並依此分段。` 
                      : `此匯入的 GPX 中未包含檢查點，系統已自動均分為 ${segmentCount} 段。`}
                    現在您能將游標移至列表右側，點擊 <Plus className="inline mx-0.5 align-text-bottom" size={15}/> 拆分成兩段，或是 <Trash2 className="inline mx-0.5 align-text-bottom" size={15}/> 刪除該段落。您也可以直接修改距離(最後一段會自動補足)。
                  </p>
                </div>
              )}

              {/* Global Settings */}
              <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-4 flex flex-wrap gap-5 xl:gap-8 items-center shrink-0">
                <div className="flex items-center gap-2">
                   <Settings size={18} className="text-slate-400" />
                   <span className="text-[0.875rem] font-bold uppercase tracking-[0.05em] text-[#475569]">全局設定</span>
                </div>
                
                <div className="flex flex-wrap gap-5 xl:gap-8 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8rem] text-[#64748B] font-medium whitespace-nowrap">起跑時間</span>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-[110px] border border-[#CBD5E1] rounded px-2 py-1 text-[0.8rem] focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8rem] text-[#64748B] font-medium whitespace-nowrap">預設 EPH</span>
                    <div className="flex text-[0.8rem]">
                      <input type="number" step="0.5" value={globalEph} onChange={e => setGlobalEph(Number(e.target.value))} className="w-16 border border-[#CBD5E1] rounded-l px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none" />
                      <button onClick={handleApplyGlobalEph} className="bg-blue-50 text-blue-700 border border-blue-200 border-l-0 px-3 py-1 rounded-r hover:bg-blue-100 font-semibold tracking-wide transition-colors">套用至全部</button>
                    </div>
                  </div>
                  {gpxData.waypoints.length === 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[0.8rem] text-[#64748B] font-medium whitespace-nowrap">平均分段數</span>
                      <div className="flex text-[0.8rem]">
                        <input type="number" min="1" value={segmentCount} onChange={e => setSegmentCount(Number(e.target.value))} className="w-16 border border-[#CBD5E1] rounded-l px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none" />
                        <button onClick={handleSplitEvenly} className="bg-slate-100 text-slate-700 border border-slate-200 border-l-0 px-3 py-1 rounded-r hover:bg-slate-200 flex items-center gap-1 font-semibold tracking-wide transition-colors"><RefreshCw size={12}/> 重分段</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Bar */}
              {gpxData && (
                <div className="bg-[#1E293B] text-white rounded-[12px] px-6 py-4 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.1)] shrink-0 overflow-x-auto gap-8">
                  <div className="flex gap-10">
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] text-slate-400 uppercase tracking-wider font-semibold">總距離</span>
                      <span className="text-[1.125rem] font-bold">{totalDist.toFixed(1)} km</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] text-slate-400 uppercase tracking-wider font-semibold">總爬升 / 下降</span>
                      <span className="text-[1.125rem] font-bold">+{totalAsc.toFixed(0)}m / -{totalDesc.toFixed(0)}m</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] text-slate-400 uppercase tracking-wider font-semibold">總休息時間</span>
                      <span className="text-[1.125rem] font-bold">{segments.reduce((acc, s) => acc + (Number(s.restTime) || 0), 0)} min</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] text-slate-400 uppercase tracking-wider font-semibold">總體 EPH (含休)</span>
                      <span className="text-[1.125rem] font-bold text-indigo-400">{(totalTimeHours > 0 ? ((totalDist + totalAsc/100) / totalTimeHours) : 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col text-right ml-auto">
                    <span className="text-[0.7rem] text-blue-400 uppercase tracking-wider font-semibold">預估完賽時間 (EFT)</span>
                    <span className="text-2xl font-black text-blue-400">{formatTime(totalTimeHours)}</span>
                  </div>
                </div>
              )}

              {/* Segments Editor Table */}
              <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] flex flex-col flex-grow overflow-hidden">
                <div className="p-4 border-b border-[#F1F5F9] flex justify-between items-center shrink-0">
                  <div className="text-[0.875rem] font-bold uppercase tracking-[0.05em] text-[#475569]">
                    分段策略分析 {isDemo ? '(範例路線 DEMO)' : '(Based on GPX Waypoints)'}
                  </div>
                  <div className="text-[0.75rem] text-slate-500">
                    自動分析 {segments.length} 個檢查點
                  </div>
                </div>
                <div className="overflow-x-auto flex-grow h-0">
                  <table className="w-full text-[0.875rem] text-left border-collapse">
                    <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold sticky top-0 z-10 border-b border-[#E2E8F0]">
                      <tr>
                        <th className="p-3">分段點 (CP)</th>
                        <th className="p-3 text-right">距離(km)</th>
                        <th className="p-3 text-right">累計(km)</th>
                        <th className="p-3 text-right">爬升(m)</th>
                        <th className="p-3 text-right">下降(m)</th>
                        <th className="p-3 text-right">EP 負荷</th>
                        <th className="p-3">設定 EPH</th>
                        <th className="p-3">加權(%)</th>
                        <th className="p-3 text-right">展示 VAM</th>
                        <th className="p-3">休(分)</th>
                        <th className="p-3 text-right whitespace-nowrap">累積時間</th>
                        <th className="p-3 text-right whitespace-nowrap">預估抵達時間</th>
                        <th className="p-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[0.7rem] font-semibold">起點</span>
                            <span className="font-bold text-slate-700">Start</span>
                          </div>
                        </td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-right text-slate-800 font-bold">0.0</td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-center text-slate-400">-</td>
                        <td className="p-3 text-center text-slate-400">-</td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-center text-slate-400">-</td>
                        <td className="p-3 text-right text-slate-400">-</td>
                        <td className="p-3 text-right font-bold text-slate-800">{startTime}</td>
                        <td className="p-3 text-center text-slate-400">-</td>
                      </tr>
                      {segments.map((seg, idx) => {
                        const ep = seg.distance + (seg.ascent / 100);
                        const effectiveEph = (Number(seg.eph) || 10) * ((Number(seg.ephScale) || 100) / 100);
                        const movingHours = ep / effectiveEph;
                        const restHours = (Number(seg.restTime) || 0) / 60;
                        const segmentTotalHours = movingHours + restHours;
                        const calcVam = movingHours > 0 ? (seg.ascent / movingHours) : 0;
                        
                        cumulativeTimeHours += segmentTotalHours;
                        cumulativeDist += seg.distance;
                        cumulativeAsc += seg.ascent;
                        cumulativeDesc += seg.descent;
                        
                        return (
                          <tr key={seg.id} className="hover:bg-slate-50 group">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className={cn("px-1.5 py-0.5 rounded text-[0.7rem] font-semibold", idx === segments.length - 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800")}>
                                  {idx === segments.length - 1 ? '終點' : `CP${idx+1}`}
                               </span>
                                <input 
                                  type="text" 
                                  value={seg.name}
                                  onChange={(e) => handleSegmentChange(idx, 'name', e.target.value)}
                                  className="w-24 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {idx < segments.length - 1 ? (
                                <input 
                                  type="number" 
                                  min="0.1" step="0.1"
                                  value={parseFloat(seg.distance.toFixed(2))}
                                  onChange={(e) => handleSegmentDistanceChange(idx, parseFloat(e.target.value) || 0.1)}
                                  className="w-[52px] rounded border border-[#CBD5E1] p-1 text-[0.75rem] text-right focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-slate-600 font-medium">{seg.distance.toFixed(1)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right text-slate-500 font-medium">{cumulativeDist.toFixed(1)}</td>
                            <td className="p-3 text-right text-amber-600 font-medium">+{seg.ascent.toFixed(0)}</td>
                            <td className="p-3 text-right text-emerald-600 font-medium">-{seg.descent.toFixed(0)}</td>
                            <td className="p-3 text-right text-slate-800 font-bold">{ep.toFixed(1)}</td>
                            <td className="p-3">
                              <input 
                                type="number" 
                                min="0.1" step="0.1"
                                value={seg.eph}
                                onChange={(e) => handleSegmentChange(idx, 'eph', parseFloat(e.target.value))}
                                className="w-[60px] rounded border border-[#CBD5E1] px-2 py-1 text-[0.75rem] text-blue-700 font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3">
                              <input 
                                type="number" 
                                min="10" step="5"
                                value={seg.ephScale}
                                onChange={(e) => handleSegmentChange(idx, 'ephScale', parseInt(e.target.value))}
                                className="w-[60px] rounded border border-[#CBD5E1] px-2 py-1 text-[0.75rem] text-purple-700 font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3 text-right">
                              {seg.ascent > 10 ? (
                                <span className="text-rose-600 font-bold" title="根據目前 EPH 與加權推算的等效爬升速率">{Math.round(calcVam)}</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              <input 
                                type="number" 
                                min="0" step="1"
                                value={seg.restTime}
                                onChange={(e) => handleSegmentChange(idx, 'restTime', parseInt(e.target.value))}
                                className="w-[60px] rounded border border-[#CBD5E1] px-2 py-1 text-[0.75rem] focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-3 text-right text-slate-500 font-medium">{formatTime(cumulativeTimeHours)}</td>
                            <td className="p-3 text-right font-bold text-slate-800">{addHoursToTimeStr(startTime, cumulativeTimeHours)}</td>
                            <td className="p-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="flex justify-center gap-1">
                                <button onClick={() => handleMoveSegment(idx, -1)} disabled={idx === 0} title="上移" className="p-1 px-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 rounded">
                                  <ArrowUp size={15} />
                                </button>
                                <button onClick={() => handleMoveSegment(idx, 1)} disabled={idx === segments.length - 1} title="下移" className="p-1 px-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 rounded">
                                  <ArrowDown size={15} />
                                </button>
                                <button onClick={() => handleSplitSegment(idx)} title="將此段拆分成兩段" className="p-1.5 ml-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                                  <Plus size={15} />
                                </button>
                                {segments.length > 1 && (
                                  <button onClick={() => handleDeleteSegment(idx)} title="刪除此段" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Export Preview */}
            <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-[#F1F5F9] shrink-0 flex justify-between items-center bg-slate-50">
                <div className="text-[0.875rem] font-bold uppercase tracking-[0.05em] text-[#475569]">匯出圖片預覽</div>
                <button 
                  onClick={handleExportImage}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded transition-colors"
                >
                  下載圖片
                </button>
              </div>
              
              <div className="flex-grow flex justify-center p-4 relative overflow-y-auto bg-[#e2e8f0] border-l border-slate-100">
                <div className="w-full flex justify-center">
                  {/* Export Container */}
                  <div 
                    ref={exportRef}
                    className="w-full bg-white rounded shadow-sm overflow-hidden flex flex-col font-sans"
                    style={{ minWidth: '320px', maxWidth: '420px', height: 'fit-content' }}
                  >
                    <div className="bg-[#1E293B] text-white p-4">
                      <h3 className="font-bold text-lg tracking-wider mb-2">Trail Pace Plan</h3>
                      <div className="flex justify-between items-end">
                        <div className="text-xs opacity-90 flex gap-4">
                          <div className="flex flex-col"><span className="text-[10px] text-slate-400">總距離</span><span className="font-bold text-sm tracking-wide">{totalDist.toFixed(1)}k</span></div>
                          <div className="flex flex-col"><span className="text-[10px] text-slate-400">總爬升</span><span className="font-bold text-sm tracking-wide text-amber-400">+{totalAsc.toFixed(0)}</span></div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-blue-300 font-bold mb-0.5">預計完賽 (EFT)</div>
                          <div className="font-bold text-lg leading-none text-blue-400">{formatTime(totalTimeHours)}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="w-full bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 font-semibold w-[35%]">分段點</th>
                            <th className="py-2 px-2 font-semibold text-right">里程</th>
                            <th className="py-2 px-2 font-semibold text-right">爬降</th>
                            <th className="py-2 px-3 font-semibold text-right">預計抵達</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50 relative">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded text-[9px] font-bold">起點</span>
                              </div>
                              <div className="font-bold text-slate-800 leading-tight">Start</div>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <div className="text-slate-800 font-bold leading-tight">0.0<span className="text-[10px] font-normal text-slate-500 ml-0.5">k</span></div>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <div className="text-slate-400 font-bold leading-tight">-</div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="font-black text-slate-800 text-sm">{startTime}</div>
                            </td>
                          </tr>
                          {segments.map((seg, idx) => {
                            const segAccHours = segments.slice(0, idx + 1).reduce((acc, curr) => {
                              const cEp = curr.distance + (curr.ascent / 100);
                              const cEffectiveEph = (Number(curr.eph) || 10) * ((Number(curr.ephScale) || 100) / 100);
                              const cMoving = cEp / cEffectiveEph;
                              return acc + cMoving + ((Number(curr.restTime) || 0) / 60);
                            }, 0);
                            
                            const distAcc = segments.slice(0, idx + 1).reduce((acc, curr) => acc + curr.distance, 0);

                            return (
                              <tr key={seg.id} className={idx === segments.length - 1 ? 'bg-amber-50/40' : ''}>
                                <td className="py-3 px-3">
                                  {idx === segments.length - 1 && (
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-[9px] font-bold">終點</span>
                                    </div>
                                  )}
                                  <div className="font-bold text-slate-800 leading-tight">{seg.name}</div>
                                  {Number(seg.restTime) > 0 && <div className="text-[10px] text-slate-400 mt-1">休 {seg.restTime}m</div>}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <div className="text-slate-800 font-bold leading-tight">{distAcc.toFixed(1)}<span className="text-[10px] font-normal text-slate-500 ml-0.5">k</span></div>
                                  <div className="text-[10px] text-slate-400 mt-1">段 {seg.distance.toFixed(1)}</div>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <div className="text-amber-600 font-bold leading-tight">+{seg.ascent.toFixed(0)}</div>
                                  {seg.descent > 0 && <div className="text-emerald-600 text-[10px] mt-1">-{seg.descent.toFixed(0)}</div>}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="font-black text-blue-700 text-sm">{addHoursToTimeStr(startTime, segAccHours)}</div>
                                  <div className="text-[10px] text-slate-400 mt-1 text-right">{formatTime(segAccHours)}</div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-center py-3 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100 tracking-wide">
                      Powered by TrailPacer Pro
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 text-blue-700">
                <HelpCircle size={24} />
                <h2 className="text-xl font-extrabold">TrailPacer Pro 使用說明</h2>
              </div>
              <button 
                onClick={() => setShowHelp(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-grow text-slate-700 text-[0.95rem] leading-relaxed space-y-6">
              
              <section>
                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm">1</span>
                  核心概念：EPH (Effort Points per Hour)
                </h3>
                <p className="mb-2">本工具採用 EPH 系統來量化越野跑的配速。因為越野跑包含大量爬升，單看「配速(分/公里)」並不準確。</p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="font-semibold text-slate-800">1 EP (努力點數) = 平坦路面跑 1 公里 = 爬升 100 公尺的體能消耗</p>
                  <ul className="list-disc pl-5 mt-2 text-slate-600 space-y-1">
                    <li>如果你一小時能在平地跑 10 公里，你的基礎 EPH 就是 10。</li>
                    <li>同樣是 EPH 10，如果全拿去爬樓梯，一小時大約能爬升 1000 公尺 (10 * 100)。</li>
                    <li>一般跑者 EPH 落於 7~10 之間，菁英選手可達 12~14。</li>
                  </ul>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm">2</span>
                  操作流程
                </h3>
                <ol className="list-decimal pl-5 space-y-3">
                  <li><strong>匯入 GPX 檔案：</strong> 點擊右上角上傳您的路線檔。如果 GPX 內有設定「檢查點 (Waypoints)」，系統會自動以此切分段落。如果沒有，系統會自動切分成數段。</li>
                  <li><strong>設定全局 EPH：</strong> 在畫面左上角設定您的「基礎 EPH」，點擊「套用至全部」。</li>
                  <li><strong>微調各路段 (加權/休息)：</strong> 
                    <ul className="list-disc pl-5 mt-1 text-slate-500">
                      <li>如果某段特別難走(技術地形)或是後期體力下滑，可以將<strong className="text-slate-700">「加權(%)」</strong>調低至 80% 或 90%，時間會自動拉長。</li>
                      <li>在有補給站的路段，輸入預計<strong className="text-slate-700">「休(分)」</strong>，系統會自動加上停留點的耗時。</li>
                    </ul>
                  </li>
                  <li><strong>匯出圖片：</strong> 編輯完成後，點擊右上方「匯出配速表圖片」，可將右側渲染好時間的藍圖，存進手機帶上賽道。</li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm">3</span>
                  進階表格操作
                </h3>
                <p className="mb-2">將滑鼠游標移到分段列表的最右側「操作」欄，您會看到隱藏按鈕：</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded border border-slate-100 flex items-start gap-3">
                    <Plus className="text-blue-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <span className="font-bold text-slate-800 block text-sm">拆分段落</span>
                      <span className="text-xs text-slate-500">將距離過長的一段，對半切成兩段，方便插入臨時休息點。</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border border-slate-100 flex items-start gap-3">
                    <ArrowUp className="text-blue-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <span className="font-bold text-slate-800 block text-sm">改變順序</span>
                      <span className="text-xs text-slate-500">上下調換段落。下層的距離與爬升數據皆會緊貼 GPX 重新適應運算。</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border border-slate-100 flex items-start gap-3">
                    <Trash2 className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <span className="font-bold text-slate-800 block text-sm">刪除段落</span>
                      <span className="text-xs text-slate-500">移除該檢查點。其距離與爬升會「無縫整併」到相鄰的下個段落中。</span>
                    </div>
                  </div>
                </div>
              </section>
              
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end">
              <button 
                onClick={() => setShowHelp(false)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors"
              >
                我知道了，開始規畫
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
