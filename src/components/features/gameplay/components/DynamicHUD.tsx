import React, { useMemo, useState } from 'react';
import { WorldData, GameTime } from '../../../../types';
import { MapPin, Heart, User, Sun, Moon, Backpack, Shirt, ChevronDown, ChevronUp, Wind } from 'lucide-react';
import { formatGameTime } from '../../../../utils/timeUtils';
import { motion, AnimatePresence } from 'framer-motion';

interface DynamicHUDProps {
    worldData: WorldData;
    gameTime?: GameTime;
    turnCount: number;
}

export const DynamicHUD: React.FC<DynamicHUDProps> = ({ worldData, gameTime, turnCount }) => {
    const [expanded, setExpanded] = useState(false);

    // Phân tích trạng thái hiện tại từ LSR
    const statusInfo = useMemo(() => {
        if (!worldData.lsrData || !worldData.lsrData['0']) return null;
        const currentInfoTable = worldData.lsrData['0'];
        if (currentInfoTable && currentInfoTable.length > 0) {
            const entry = currentInfoTable[0] as any[];
            return {
                time: entry[0] || '',
                weather: entry[1] || '',
                location: entry[2] || '',
                environment: entry[3] || ''
            };
        }
        return null;
    }, [worldData.lsrData]);

    const playerLSRInfo = useMemo(() => {
        if (!worldData.lsrData) return null;
        
        // Priority 1: Check Table #1 (Recent Characters) for dynamic status
        let status = '';
        let outfit = '';
        let found = false;

        if (worldData.lsrData['1']) {
            const recentTable = worldData.lsrData['1'] as any[][];
            const playerEntry = recentTable.find(row => 
                row[0] && row[0].toString().toLowerCase().includes(worldData.player.name.toLowerCase())
            );
            if (playerEntry) {
                status = playerEntry[6] || playerEntry[5] || ''; // Trạng thái thể chất hoặc tâm lý
                outfit = playerEntry[7] || ''; // Tình trạng trang phục
                found = true;
            }
        }

        // Priority 2: Fallback to Table #2 (Character Info)
        if (!found && worldData.lsrData['2']) {
            const charInfoTable = worldData.lsrData['2'] as any[][];
            const playerEntry = charInfoTable.find(row => 
                row[0] && row[0].toString().toLowerCase().includes(worldData.player.name.toLowerCase())
            );
            if (playerEntry) {
                status = playerEntry[4] || ''; // Ngoại hình
                outfit = playerEntry[6] || ''; // Phong cách ăn mặc
                found = true;
            }
        }

        if (found) {
            return { status, outfit };
        }
        return null;
    }, [worldData.lsrData, worldData.player.name]);

    const itemsInfo = useMemo(() => {
        if (!worldData.lsrData || !worldData.lsrData['6']) return [];
        const itemsTable = worldData.lsrData['6'] as any[][];
        // Tìm vật phẩm của người chơi
        return itemsTable.filter(row => 
            row[1] && row[1].toString().toLowerCase().includes(worldData.player.name.toLowerCase())
        ).map(row => ({
            name: row[0] as string,
            quantity: (row[3] || '1') as string,
            description: (row[6] || row[5] || '') as string // Công dụng hoặc hình thái
        }));
    }, [worldData.lsrData, worldData.player.name]);

    const timeString = gameTime ? formatGameTime(gameTime) : statusInfo?.time || '12:00';
    const locationString = statusInfo?.location || 'Chưa xác định';
    
    // Determine Time of Day
    let timeIcon = <Sun size={14} className="text-amber-500" />;
    let themeClasses = "from-blue-500/10 to-transparent dark:from-sky-900/20";
    let borderClass = "border-sky-500/20";

    const lcTime = timeString.toLowerCase();
    if (lcTime.includes('đêm') || lcTime.includes('tối')) {
        timeIcon = <Moon size={14} className="text-indigo-400 font-bold" />;
        themeClasses = "from-indigo-600/10 to-transparent dark:from-indigo-900/30";
        borderClass = "border-indigo-500/20";
    } else if (lcTime.includes('chiều') || lcTime.includes('hoàng hôn')) {
        timeIcon = <Sun size={14} className="text-rose-400" />;
        themeClasses = "from-orange-500/10 to-transparent dark:from-orange-900/20";
        borderClass = "border-orange-500/20";
    }

    return (
        <div className={`relative w-full border-b backdrop-blur-md shadow-sm transition-all duration-700 bg-gradient-to-b ${themeClasses} border-stone-300 dark:border-slate-800`}>
            
            {/* Top Bar - Always Visible */}
            <div className="px-3 md:px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
                    {/* Player Info */}
                    <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2.5 group cursor-pointer shrink-0">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-md bg-stone-300 dark:bg-slate-700 flex items-center justify-center border border-stone-400 dark:border-slate-600 group-hover:border-mystic-accent transition-colors overflow-hidden">
                                {worldData.player.avatar ? (
                                    <img src={worldData.player.avatar} alt={worldData.player.name} className="w-full h-full object-cover" />
                                ) : (
                                    <User size={16} className="text-stone-500 dark:text-slate-400" />
                                )}
                            </div>
                            {/* Health indicator dot */}
                            {(playerLSRInfo?.status && !playerLSRInfo.status.toLowerCase().includes('khỏe')) && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 border-2 border-stone-100 dark:border-slate-900 rounded-full animate-pulse" />
                            )}
                        </div>
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-xs font-black text-stone-800 dark:text-slate-200 group-hover:text-mystic-accent transition-colors">{worldData.player.name}</span>
                            {playerLSRInfo?.status && (
                                <span className="text-[9px] font-medium text-stone-500 dark:text-slate-400 truncate max-w-[80px] md:max-w-[120px]">{playerLSRInfo.status}</span>
                            )}
                        </div>
                    </button>

                    <div className="h-6 w-px bg-stone-300 dark:bg-slate-700 hidden md:block"></div>

                    {/* Vitals & Environment */}
                    <div className="flex
 items-center gap-2 lg:gap-4 overflow-x-auto custom-scrollbar flex-1 pb-1 md:pb-0">
                        {/* Location */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-slate-900 border ${borderClass} shrink-0`}>
                            <MapPin size={12} className="text-sky-600 dark:text-sky-400" />
                            <span className="text-[10px] font-bold text-stone-700 dark:text-slate-300 truncate max-w-[150px]">{locationString}</span>
                        </div>

                        {/* Time */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-slate-900 border ${borderClass} shrink-0`}>
                            {timeIcon}
                            <span className="text-[10px] font-bold text-stone-700 dark:text-slate-300">{timeString}</span>
                        </div>

                         {/* Weather / Condition Placeholder */}
                         <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-slate-900 border ${borderClass} shrink-0`}>
                            <Wind size={12} className="text-stone-400" />
                            <span className="text-[10px] font-bold text-stone-500 dark:text-slate-500">Bình thường</span>
                        </div>
                    </div>
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2 shrink-0">
                    <button 
                         onClick={() => setExpanded(!expanded)}
                         className="p-1.5 rounded bg-stone-200 dark:bg-slate-800 hover:bg-stone-300 dark:hover:bg-slate-700 text-stone-500 transition-colors"
                         title="Thông tin chi tiết"
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Expandable Details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-stone-300/50 dark:border-slate-700/50 bg-stone-100/50 dark:bg-slate-950/50 backdrop-blur-md"
                    >
                        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Col - Player Details */}
                            <div className="space-y-3">
                                
                                {playerLSRInfo?.outfit && (
                                    <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase font-black tracking-widest text-mystic-accent flex items-center gap-1">
                                            <Shirt size={12} /> Trang phục hiện tại
                                        </div>
                                        <div className="text-xs bg-stone-200/50 dark:bg-slate-900/50 p-2 rounded border border-stone-300 dark:border-slate-800 text-stone-700 dark:text-slate-300 leading-relaxed border-l-2 border-l-mystic-accent">
                                            {playerLSRInfo.outfit}
                                        </div>
                                    </div>
                                )}
                                
                                {playerLSRInfo?.status && (
                                     <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase font-black tracking-widest text-rose-500 flex items-center gap-1">
                                            <Heart size={12} /> Thể trạng
                                        </div>
                                        <div className="text-xs bg-stone-200/50 dark:bg-slate-900/50 p-2 rounded border border-stone-300 dark:border-slate-800 text-stone-700 dark:text-slate-300 leading-relaxed border-l-2 border-l-rose-500">
                                            {playerLSRInfo.status}
                                        </div>
                                    </div>
                                )}

                                {!playerLSRInfo?.outfit && !playerLSRInfo?.status && (
                                    <div className="text-xs italic text-stone-500 bg-stone-200/30 dark:bg-slate-900/30 p-3 rounded border border-dashed border-stone-300 dark:border-slate-800 flex items-center justify-center">
                                        Không có hiệu ứng bất lợi hoặc trang phục nổi bật.
                                    </div>
                                )}
                            </div>

                            {/* Right Col - Inventory */}
                            <div className="space-y-1.5">
                                <div className="text-[10px] uppercase font-black tracking-widest text-amber-600 dark:text-amber-500 flex items-center gap-1 justify-between">
                                    <div className="flex items-center gap-1"><Backpack size={12} /> Hành trang ({itemsInfo.length})</div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                                    {itemsInfo.length === 0 ? (
                                        <div className="text-xs italic text-stone-500 flex items-center gap-2 p-2 justify-center bg-stone-200/30 dark:bg-slate-900/30 rounded border border-dashed border-stone-300 dark:border-slate-800">
                                            Túi đồ trống
                                        </div>
                                    ) : (
                                        itemsInfo.map((item, idx) => (
                                            <div key={idx} className="flex gap-2 p-2 rounded bg-stone-200 dark:bg-slate-900/80 border border-stone-300 dark:border-slate-700 items-start group relative">
                                                <div className="w-8 h-8 rounded bg-stone-300 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-stone-400 dark:border-slate-600 text-[10px] font-bold text-stone-600 dark:text-slate-400">
                                                    x{item.quantity}
                                                </div>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="text-xs font-bold text-stone-800 dark:text-slate-200 truncate">{item.name}</div>
                                                    <div className="text-[10px] text-stone-500 dark:text-slate-400 truncate line-clamp-2 leading-tight pr-4">
                                                        {item.description || "Không có lời mô tả."}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
