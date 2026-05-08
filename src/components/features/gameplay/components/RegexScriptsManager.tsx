import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RegexScript, WorldData, AppSettings } from '../../../../types';
import { dbService } from '../../../../services/db/indexedDB';
import { Settings, X, Plus, ChevronUp, ChevronDown, Edit2, Trash2, Play, Bug, ToggleRight, ToggleLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { runRegexScript } from '../../../../utils/regex';

export enum SCRIPT_TYPES {
    GLOBAL = 0,
    SCOPED = 1,
    PRESET = 2,
}

interface RegexScriptsManagerProps {
    activeWorld?: WorldData | null;
    onUpdateWorld?: (data: Partial<WorldData>) => void;
    playerName: string;
    charName: string;
    onScriptsChanged?: () => void;
}

const RegexScriptsManager: React.FC<RegexScriptsManagerProps> = ({ activeWorld, onUpdateWorld, playerName, charName, onScriptsChanged }) => {
    // UI states
    const [isOpen, setIsOpen] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<RegexScript | null>(null);
    const [editingType, setEditingType] = useState<SCRIPT_TYPES | null>(null);
    const [testInput, setTestInput] = useState('Dữ liệu mẫu để kiểm tra Regex...');
    const [showTest, setShowTest] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [globalScripts, setGlobalScripts] = useState<RegexScript[]>([]);
    const [scopedScripts, setScopedScripts] = useState<RegexScript[]>([]);
    const [presetScripts, setPresetScripts] = useState<RegexScript[]>([]);
    
    const [scopedEnabled, setScopedEnabled] = useState(true);
    const [presetEnabled, setPresetEnabled] = useState(true);

    const loadScripts = useCallback(async () => {
        try {
            const settings = await dbService.getSettings() as AppSettings;
            let globals = settings.regex_scripts || [];
            
            let scopeds = activeWorld?.extensions?.regex_scripts || [];
            let presets = activeWorld?.config?.regexScripts || [];
            
            // Migrate
            const migrate = (arr: any[]) => arr.map(s => {
                if (!s.id) s.id = crypto.randomUUID();
                if (!Array.isArray(s.placement)) {
                    s.placement = s.placement ? [s.placement] : [0, 1, 2];
                }
                if (s.placement.includes(0)) {
                    s.placement = s.placement.filter((p: number) => p !== 0);
                    s.markdownOnly = true;
                    s.promptOnly = true;
                }
                if (s.placement.includes(4)) {
                    s.placement = [...s.placement.filter((p: number) => p !== 4), 3];
                }
                
                // Map legacy names
                if (s.name && !s.scriptName) s.scriptName = s.name;
                if (s.regex && !s.findRegex) s.findRegex = s.regex;
                if (s.replacement !== undefined && s.replaceString === undefined) s.replaceString = s.replacement;
                if (s.isEnabled !== undefined && s.disabled === undefined) s.disabled = !s.isEnabled;
                
                return s as RegexScript;
            });

            globals = migrate(globals);
            scopeds = migrate(scopeds);
            presets = migrate(presets);

            setGlobalScripts(globals);
            setScopedScripts(scopeds);
            setPresetScripts(presets);
        } catch (e) {
            console.error("Failed to load regex scripts", e);
        }
    }, [activeWorld]);

    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void loadScripts();
        }
    }, [isOpen, loadScripts]);

    const saveScriptsByType = async (scripts: RegexScript[], type: SCRIPT_TYPES) => {
        try {
            if (type === SCRIPT_TYPES.GLOBAL) {
                const settings = await dbService.getSettings() as AppSettings;
                settings.regex_scripts = scripts;
                await dbService.saveSettings(settings);
                setGlobalScripts(scripts);
            } else if (type === SCRIPT_TYPES.SCOPED) {
                if (onUpdateWorld && activeWorld) {
                    const ext = activeWorld.extensions || {};
                    onUpdateWorld({ extensions: { ...ext, regex_scripts: scripts } });
                }
                setScopedScripts(scripts);
            } else if (type === SCRIPT_TYPES.PRESET) {
                if (onUpdateWorld && activeWorld) {
                    const cfg = activeWorld.config || {};
                    onUpdateWorld({ config: { ...cfg, regexScripts: scripts } });
                }
                setPresetScripts(scripts);
            }
        } catch (e) {
            console.error("Failed to save scripts", e);
        }
        if (onScriptsChanged) onScriptsChanged();
    };

    const handleToggleDisable = (scriptId: string, type: SCRIPT_TYPES) => {
        const list = type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        const newList = list.map(s => s.id === scriptId ? { ...s, disabled: !s.disabled } : s);
        saveScriptsByType(newList, type);
    };

    const handleDelete = (scriptId: string, type: SCRIPT_TYPES) => {
        if (!confirm("Bạn có chắc chắn muốn xóa kịch bản (script) này không?")) return;
        const list = type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        saveScriptsByType(list.filter(s => s.id !== scriptId), type);
    };

    const handleMove = (index: number, direction: 'up' | 'down', type: SCRIPT_TYPES) => {
        const list = [...(type === SCRIPT_TYPES.GLOBAL ? globalScripts : type === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts)];
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === list.length - 1)) return;
        const temp = list[index];
        if (direction === 'up') {
            list[index] = list[index - 1];
            list[index - 1] = temp;
        } else {
            list[index] = list[index + 1];
            list[index + 1] = temp;
        }
        saveScriptsByType(list, type);
    };

    const openEditor = (script: RegexScript | null, type: SCRIPT_TYPES) => {
        if (script) {
            setEditingScript({ 
                ...script,
                markdownOnly: script.markdownOnly ?? script.alterChatDisplay ?? false,
                promptOnly: script.promptOnly ?? script.alterOutgoingPrompt ?? false
            });
        } else {
            setEditingScript({
                id: crypto.randomUUID(),
                scriptName: 'Script Mới',
                findRegex: '',
                replaceString: '',
                trimStrings: [],
                placement: [1, 2],
                substituteRegex: 0,
                markdownOnly: false,
                promptOnly: false,
                minDepth: null,
                maxDepth: null,
                disabled: false,
                runOnEdit: false
            });
        }
        setEditingType(type);
        setIsEditorOpen(true);
    };

    const saveEditor = () => {
        if (!editingScript || editingType === null) return;
        const list = editingType === SCRIPT_TYPES.GLOBAL ? globalScripts : editingType === SCRIPT_TYPES.SCOPED ? scopedScripts : presetScripts;
        const idx = list.findIndex(s => s.id === editingScript.id);
        if (idx >= 0) {
            const newList = [...list];
            newList[idx] = editingScript;
            saveScriptsByType(newList, editingType);
        } else {
            saveScriptsByType([...list, editingScript], editingType);
        }
        setIsEditorOpen(false);
    };

    const renderList = (title: string, list: RegexScript[], type: SCRIPT_TYPES, isEnabled: boolean, onToggleEnable?: () => void) => (
        <section className={`bg-white dark:bg-slate-800/40 p-5 rounded-xl border-l-[4px] border-t border-r border-b shadow-sm relative overflow-hidden ${!isEnabled ? 'opacity-50 border-stone-300 dark:border-slate-700 border-l-stone-400 dark:border-l-slate-600' : type === SCRIPT_TYPES.GLOBAL ? 'border-indigo-200 dark:border-indigo-900/30 border-l-indigo-500' : type === SCRIPT_TYPES.SCOPED ? 'border-amber-200 dark:border-amber-900/30 border-l-amber-500' : 'border-rose-200 dark:border-rose-900/30 border-l-rose-500'}`}>
            <div className="absolute right-0 top-0 opacity-5 pointer-events-none p-4">
                <Settings size={100} />
            </div>
            
            <div className="flex items-start justify-between mb-4 relative z-10">
                <div>
                    <h3 className={`text-base font-bold drop-shadow-sm flex items-center gap-2 ${type === SCRIPT_TYPES.GLOBAL ? 'text-indigo-600 dark:text-indigo-400' : type === SCRIPT_TYPES.SCOPED ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {title}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-slate-400 mt-1">
                        {list.length} kịch bản đang có trong danh sách này.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {onToggleEnable && (
                        <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-300 font-semibold cursor-pointer p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                onChange={onToggleEnable} 
                                className="w-4 h-4 rounded text-mystic-accent focus:ring-mystic-accent cursor-pointer" 
                            />
                            Bật / Tắt danh sách
                        </label>
                    )}
                    <button 
                        onClick={() => openEditor(null, type)} 
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all border shadow-sm text-white hover:opacity-90 ${type === SCRIPT_TYPES.GLOBAL ? 'bg-indigo-500 border-indigo-600' : type === SCRIPT_TYPES.SCOPED ? 'bg-amber-500 border-amber-600' : 'bg-rose-500 border-rose-600'}`}
                        title={`Tạo ${title} Mới`}
                    >
                        <Plus size={14} /> Thêm Mới
                    </button>
                </div>
            </div>

            <div className={`space-y-3 relative z-10 ${!isEnabled && 'pointer-events-none'}`}>
                {list.length === 0 ? (
                    <div className="text-center text-stone-400 dark:text-slate-500 p-6 text-sm border border-dashed border-stone-300 dark:border-slate-700 rounded-xl">Chưa có kịch bản (script) nào</div>
                ) : list.map((script, idx) => (
                    <div key={script.id ? `${script.id}-${idx}` : idx} className={`rounded-xl border transition-all ${!script.disabled ? 'bg-white dark:bg-slate-800/80 border-stone-300 dark:border-slate-600 shadow-sm' : 'bg-stone-50 dark:bg-slate-900/40 border-stone-200 dark:border-slate-800 opacity-60'}`}>
                        <div className="p-3 flex justify-between items-center group">
                            <div className="flex items-center flex-1 mr-4 gap-3">
                                <div className="flex flex-col gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button 
                                        onClick={() => handleMove(idx, 'up', type)}
                                        disabled={idx === 0}
                                        className="p-0.5 hover:bg-stone-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent text-stone-500"
                                    >
                                        <ArrowUp size={12} />
                                    </button>
                                    <button 
                                        onClick={() => handleMove(idx, 'down', type)}
                                        disabled={idx === list.length - 1}
                                        className="p-0.5 hover:bg-stone-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent text-stone-500"
                                    >
                                        <ArrowDown size={12} />
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-sm font-bold truncate max-w-[200px] sm:max-w-[400px] ${!script.disabled ? 'text-stone-800 dark:text-slate-200' : 'text-stone-400 dark:text-slate-500 line-through'}`}>
                                            {script.scriptName}
                                        </span>
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 bg-stone-200 dark:bg-slate-700 text-stone-500 dark:text-slate-400 rounded shrink-0">
                                            {script.placement ? script.placement.length : 0} Places
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <button
                                            onClick={() => openEditor(script, type)}
                                            className="text-xs flex items-center gap-1 font-medium transition-colors text-stone-500 hover:text-stone-800 dark:hover:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700 px-1 -ml-1 rounded"
                                        >
                                            <Edit2 size={12} /> Chỉnh sửa
                                        </button>
                                        <button
                                            onClick={() => handleDelete(script.id, type)}
                                            className="text-[10px] text-red-500/70 hover:text-red-500 flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 size={10} /> Xóa
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleToggleDisable(script.id, type)}
                                className={`${!script.disabled ? 'text-green-500 drop-shadow-md' : 'text-stone-300 dark:text-slate-600'} hover:scale-[1.15] transition-transform`}
                                title={!script.disabled ? "Đang BẬT" : "Đang TẮT"}
                            >
                                {!script.disabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );

    return (
        <div className="mb-3">
            <button 
                onClick={() => setIsOpen(true)} 
                className="w-full p-3 flex items-center justify-between text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors group rounded-lg border border-stone-400 dark:border-slate-700 bg-stone-300 dark:bg-slate-800/30"
            >
                 <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300 group-hover:text-mystic-accent transition-colors uppercase">
                    <Settings size={14}/> Regex Scripts Manager
                 </div>
                 <div className="text-[10px] text-stone-500 bg-stone-400 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">
                    {globalScripts.length + scopedScripts.length + presetScripts.length} Active
                 </div>
            </button>

        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" 
                    style={{ zIndex: 1000 }}
                >
                    <motion.div 
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="p-5 border-b border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900/80 shrink-0 shadow-sm relative z-10">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2"><Settings size={24} className="text-mystic-accent" /> Quản lý Regex Scripts</h2>
                                <button onClick={() => setIsOpen(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded-full hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors"><X size={24}/></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8 bg-stone-100 dark:bg-mystic-900 relative">
                            {renderList('Toàn hệ thống', globalScripts, SCRIPT_TYPES.GLOBAL, true)}
                            {renderList('Riêng thế giới này', scopedScripts, SCRIPT_TYPES.SCOPED, scopedEnabled, () => setScopedEnabled(!scopedEnabled))}
                            {renderList('Cài đặt thẻ nhân vật', presetScripts, SCRIPT_TYPES.PRESET, presetEnabled, () => setPresetEnabled(!presetEnabled))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {isEditorOpen && editingScript && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
                    style={{ zIndex: 1010 }}
                >
                    <motion.div 
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[#1a1a24] border border-[#2d2f3d] w-full max-w-5xl max-h-[96vh] flex flex-col rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden"
                    >
                        {/* HEADER */}
                        <div className="flex justify-between items-center p-4 border-b border-[#2d2f3d] bg-[#14151c] shadow-sm relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                                    <Settings size={20} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-lg text-slate-200">
                                        Regex Script Editor
                                    </h2>
                                    <p className="text-xs text-slate-400">
                                        Cấp độ lưu trữ: <span className="text-indigo-300 font-semibold">{editingType === 0 ? 'Global (Hệ thống)' : editingType === 1 ? 'Scoped (Thế giới)' : 'Preset (Thẻ NV)'}</span>
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-slate-500 transition-colors">
                                <X size={20}/>
                            </button>
                        </div>

                        {/* BODY CONTENT */}
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-[#111218]">
                            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#2d2f3d]">
                                
                                {/* LEFT COLUMN - MAIN SETTINGS */}
                                <div className="flex-1 p-6 space-y-6">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1 space-y-1.5">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Tên Kịch Bản (Script Name)</label>
                                            <input 
                                                className="w-full p-2.5 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] outline-none focus:border-indigo-500 text-slate-200 font-medium transition-colors shadow-inner" 
                                                value={editingScript.scriptName} 
                                                onChange={e => setEditingScript({...editingScript, scriptName: e.target.value})} 
                                            />
                                        </div>
                                        <label className="flex flex-col items-center gap-1.5 cursor-pointer pt-6">
                                            {/* Beautiful stylized toggle */}
                                            <div className="relative inline-block w-12 h-6 rounded-full bg-[#1a1b26] border border-[#3b3d4d] overflow-hidden">
                                                <input 
                                                    type="checkbox" 
                                                    className="peer sr-only" 
                                                    checked={!editingScript.disabled} 
                                                    onChange={e => setEditingScript({...editingScript, disabled: !e.target.checked})} 
                                                />
                                                <div className="absolute inset-0 bg-indigo-500 opacity-0 peer-checked:opacity-100 transition-opacity" />
                                                <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-6 shadow-sm" />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Trạng Thái</span>
                                        </label>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Regex Pattern (Tìm Kiếm)</label>
                                            <span className="text-[10px] bg-[#1a1b26] text-amber-500/80 px-2 py-0.5 rounded border border-amber-900/30">Hỗ trợ Regex JS gốc (vd: /pattern/gi)</span>
                                        </div>
                                        <textarea 
                                            className="w-full p-3 font-mono text-sm text-pink-400 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] min-h-[60px] outline-none focus:border-indigo-500 resize-y custom-scrollbar shadow-inner" 
                                            placeholder="/(nhập mẫu regex ở đây)/gi" 
                                            value={editingScript.findRegex} 
                                            onChange={e => setEditingScript({...editingScript, findRegex: e.target.value})} 
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                                Chuỗi Thay Thế (Replace With)
                                            </label>
                                            <div className="flex gap-2">
                                                <span className="text-[10px] bg-emerald-900/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-900/40">Hỗ trợ biến $1, $2, {'{{match}}'}</span>
                                                <span className="text-[10px] bg-indigo-900/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/40">Hỗ trợ Macro HTML/CSS/JS</span>
                                            </div>
                                        </div>
                                        <textarea 
                                            className="w-full p-4 font-mono text-sm text-emerald-400 bg-[#1a1b26] rounded-lg border border-[#3b3d4d] min-h-[200px] outline-none focus:border-indigo-500 resize-y custom-scrollbar shadow-inner" 
                                            value={editingScript.replaceString} 
                                            onChange={e => setEditingScript({...editingScript, replaceString: e.target.value})} 
                                            placeholder="HTML/CSS/JS (Widget API) hoặc Text thuần...\nVí dụ:\n```html\n<div class='custom-card'>\n  <script>console.log('Regex JS works!');</script>\n  $1\n</div>\n```" 
                                        />
                                    </div>
                                    
                                    <div className="space-y-1.5 pt-4 border-t border-[#2d2f3d]">
                                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Trim Substrings (Xóa các chuỗi này - Mỗi chuỗi 1 dòng)</label>
                                        <textarea 
                                            className="w-full p-3 text-sm bg-[#1a1b26] rounded-lg border border-[#3b3d4d] min-h-[100px] outline-none focus:border-indigo-500 resize-y custom-scrollbar text-slate-300 shadow-inner" 
                                            placeholder="Chuỗi cần xóa sau khi replace...\nVí dụ: <br>"
                                            value={editingScript.trimStrings?.join('\n') || ''} 
                                            onChange={e => setEditingScript({...editingScript, trimStrings: e.target.value.split('\n')})} 
                                        />
                                    </div>
                                </div>

                                {/* RIGHT COLUMN - ADVANCED & TESTER */}
                                <div className="flex-1 flex flex-col w-full lg:max-w-md bg-[#161720]">
                                    
                                    {/* PLACEMENT & BEHAVIOR MODULE */}
                                    <div className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2d2f3d] pb-2">Scope (Phạm Vi Áp Dụng)</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    {v: 1, l: 'User Messages', d: 'Tin nhắn của người chơi'},
                                                    {v: 2, l: 'Character Messages', d: 'Tin nhắn của AI'},
                                                    {v: 5, l: 'World Book', d: 'Thông tin từ Lorebook'},
                                                    {v: 7, l: 'Reasoning (CoT)', d: 'Chain of Thought / Nội tâm AI'},
                                                    {v: 3, l: 'Slash Command', d: 'Lệnh hệ thống'},
                                                    {v: 6, l: 'LSR Context', d: 'Dữ liệu ngữ cảnh động'}
                                                ].map(p => (
                                                    <label key={p.v} className={`flex flex-col p-2.5 rounded-lg cursor-pointer border transition-all ${editingScript.placement?.includes(p.v) ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-[#1a1b26] border-[#3b3d4d] hover:border-slate-500'}`}>
                                                        <div className="flex items-center gap-2">
                                                            <input type="checkbox" className="w-3.5 h-3.5 rounded text-indigo-500 bg-[#111218] border-[#3b3d4d]" checked={editingScript.placement?.includes(p.v) || false} onChange={e => {
                                                                const arr = editingScript.placement || [];
                                                                setEditingScript({...editingScript, placement: e.target.checked ? [...arr, p.v] : arr.filter(x => x !== p.v)});
                                                            }}/> 
                                                            <span className={`text-[11px] font-bold ${editingScript.placement?.includes(p.v) ? 'text-indigo-300' : 'text-slate-300'}`}>{p.l}</span>
                                                        </div>
                                                        <span className="text-[9px] text-slate-500 mt-1 pl-5">{p.d}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#2d2f3d] pb-2">Execution Timing (Thời Điểm Xử Lý)</h4>
                                            <div className="space-y-2">
                                                <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                    <input type="checkbox" checked={editingScript.markdownOnly || false} onChange={e => setEditingScript({...editingScript, markdownOnly: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-indigo-500 bg-[#111218] border-[#3b3d4d] focus:ring-indigo-500"/> 
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-200">On Display (Ngay khi hiển thị)</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">Prompt gửi cho AI không bị thay đổi, chỉ đổi giao diện UI</p>
                                                    </div>
                                                </label>
                                                <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                    <input type="checkbox" checked={editingScript.promptOnly || false} onChange={e => setEditingScript({...editingScript, promptOnly: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-amber-500 bg-[#111218] border-[#3b3d4d] focus:ring-amber-500"/> 
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-200">On Send (Ngay khi gửi prompt)</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">Người chơi xem chữ gốc, nhưng AI thấy đoạn Regex này.</p>
                                                    </div>
                                                </label>
                                                <label className="flex items-start gap-2.5 p-2 hover:bg-[#1a1b26] rounded-lg cursor-pointer transition-colors">
                                                    <input type="checkbox" checked={editingScript.runOnEdit || false} onChange={e => setEditingScript({...editingScript, runOnEdit: e.target.checked})} className="mt-0.5 w-4 h-4 rounded text-emerald-500 bg-[#111218] border-[#3b3d4d] focus:ring-emerald-500"/> 
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-200">Receive and Edit (Khi nhận thư / sửa đổi)</p>
                                                        <p className="text-[10px] text-slate-400 mt-0.5">Kích hoạt lại bộ parse khi nhận tin nhắn hoặc người dùng sửa đồ.</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase text-slate-400">Min Depth (Chiều sâu tin nhắn)</label>
                                                <input type="number" placeholder="0 = Last Message" className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600" value={editingScript.minDepth === null ? '' : editingScript.minDepth} onChange={e => setEditingScript({...editingScript, minDepth: e.target.value === '' ? null : Number(e.target.value)})} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase text-slate-400">Max Depth (Khỏang cách giới hạn)</label>
                                                <input type="number" placeholder="Empty = Unlimited" className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 focus:border-indigo-500 outline-none placeholder:text-slate-600" value={editingScript.maxDepth === null ? '' : editingScript.maxDepth} onChange={e => setEditingScript({...editingScript, maxDepth: e.target.value === '' ? null : Number(e.target.value)})} />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase text-slate-400">Macro Template Substitute (Engine mode)</label>
                                            <select className="w-full p-2 text-sm bg-[#1a1b26] border border-[#3b3d4d] rounded-lg text-slate-200 focus:border-indigo-500 outline-none" value={editingScript.substituteRegex || 0} onChange={e => setEditingScript({...editingScript, substituteRegex: Number(e.target.value)})}>
                                                <option value={0}>0 - No Substitution (Default)</option>
                                                <option value={1}>1 - Substitute raw templates</option>
                                                <option value={2}>2 - Substitute pattern-escaped templates</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* TESTER MODULE */}
                                    <div className="mt-auto border-t border-[#2d2f3d] bg-[#0c0d12] relative overflow-hidden flex flex-col">
                                        {/* Tester Title */}
                                        <div className="p-3 border-b border-[#2d2f3d] flex justify-between items-center bg-[#14151c]">
                                            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                                <Bug size={14} className="text-rose-400" /> Live Regex Tester
                                            </h4>
                                            <div className="flex bg-[#1a1b26] rounded p-0.5 border border-[#3b3d4d]">
                                                <button onClick={() => setShowTest(true)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${showTest ? 'bg-rose-500/20 text-rose-400' : 'text-slate-500 hover:text-slate-300'}`}>ON</button>
                                                <button onClick={() => setShowTest(false)} className={`px-2 py-0.5 text-[10px] font-bold rounded ${!showTest ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>OFF</button>
                                            </div>
                                        </div>

                                        {showTest && (
                                            <div className="p-4 space-y-4 flex-1">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase text-slate-500">Test Input (Chuỗi cần chạy regex gốc)</label>
                                                    <textarea 
                                                        className="w-full p-2 text-xs bg-[#1a1b26] rounded border border-[#3b3d4d] min-h-[60px] outline-none resize-y text-slate-300 focus:border-rose-400/50 custom-scrollbar shadow-inner" 
                                                        value={testInput} 
                                                        onChange={e => setTestInput(e.target.value)} 
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 flex justify-between">
                                                        <span>Preview Render Output</span>
                                                        <span className="text-rose-400 opacity-80">Scripts executed natively</span>
                                                    </label>
                                                    <div 
                                                        className="w-full p-3 text-sm bg-black/40 rounded border border-[#3b3d4d] min-h-[100px] overflow-auto custom-scrollbar prose prose-invert max-w-none text-slate-200" 
                                                        dangerouslySetInnerHTML={{__html: runRegexScript({ ...editingScript, placement: [1,2] }, testInput || ' ', { userName: playerName, charName }) || testInput }} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {!showTest && (
                                            <div className="p-8 text-center bg-stripes-slate-800 opacity-50">
                                                <Bug size={32} className="mx-auto text-slate-600 mb-2" />
                                                <p className="text-xs text-slate-500">Bật Tester để kiểm tra trực tiếp mã HTML/CSS/JS</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="p-4 border-t border-[#2d2f3d] bg-[#14151c] flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] z-10">
                            <button className="px-5 py-2 font-bold rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm" onClick={() => setIsEditorOpen(false)}>Hủy bỏ</button>
                            <button className="px-6 py-2 font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all text-sm flex items-center gap-2" onClick={saveEditor}>
                                <Play size={14} className="fill-white" /> Lưu Kịch Bản (Save)
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </div>
    );
};

export default RegexScriptsManager;
