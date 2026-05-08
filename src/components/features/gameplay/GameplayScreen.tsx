
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Shield, Zap, User, Save, BrainCircuit, Globe, Brain, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, BookOpen, Trash2, Edit2, Check, X, Database, ToggleLeft, ToggleRight, RefreshCw, Settings, Clock, Maximize2, Minimize2, MapPin, Box, History, LogOut, Terminal, Image as ImageIcon, Code, Plus, RotateCcw } from 'lucide-react';
import { NavigationProps, GameState, ChatMessage, AppSettings, SaveFile, WorldData, TawaPresetConfig, GameTime, Entity, ImageMetadata } from '../../../types';
import { gameplayAiService } from '../../../services/ai/gameplay/service';
import { dbService } from '../../../services/db/indexedDB';
import Button from '../../ui/Button';
import { TAWA_REGEX, extractTagContent, cleanRawText, parseChoices, getRegexedString } from '../../../utils/regex';
import { DEFAULT_PRESET_CONFIG } from '../../../constants/tawa_modules'; 
import TawaPresetManager from './components/TawaPresetManager';
import RegexScriptsManager from './components/RegexScriptsManager';
import WorldInfoSidebar from './components/WorldInfoSidebar';
import ImageLibraryModal from './components/ImageLibraryModal';
import LogConsole from './components/LogConsole';
import GameInput from './components/GameInput';
import { ContextDebuggerView } from './components/ContextDebuggerView';
import { DynamicHUD } from './components/DynamicHUD';
import { LsrParser, LsrTableDefinition } from '../../../services/lsr/LsrParser';
import { LSR_REGEX } from '../../../data/lsr_config';
import { vectorService } from '../../../services/ai/vectorService';
import { INITIAL_GAME_TIME, formatGameTime, advanceTime } from '../../../utils/timeUtils';
import { useResponsive } from '../../../hooks/useResponsive';
import { MarkdownRenderer } from '../../common/MarkdownRenderer';
import { tavoRegistry } from '../../../services/api/tavoApi';

// Constants for Pagination
const MESSAGES_PER_PAGE = 10;

// Helper component to render Tawa's structured output (UPDATED WITH ENTITY HIGHLIGHTING)
interface TawaMessageRendererProps {
    index: number;
    text: string | { text: string };
    onUpdate: (index: number, newText: string) => void;
    isStreaming?: boolean;
    regexScripts?: import('../../../types').RegexScript[];
    entities?: Entity[];
    onEntityClick?: (entityId: string) => void;
    turnNumber?: number;
    userAction?: string;
    playerName?: string;
    playerAvatar?: string;
    messageRole?: 'user' | 'assistant' | 'system';
    contentBeautify?: boolean;
    totalCount?: number;
    metadata?: { presetUsed?: string; cotUsed?: string; worldInfoConfig?: string };
}

const TawaMessageRenderer: React.FC<TawaMessageRendererProps> = React.memo(({ 
    index,
    text, 
    onUpdate, 
    isStreaming, 
    regexScripts, 
    entities, 
    onEntityClick,
    turnNumber,
    userAction,
    playerName,
    playerAvatar,
    messageRole,
    contentBeautify = false,
    totalCount = 0,
    metadata
}) => {
    // ... (rest of the component remains the same)
    // Safety check: ensure text is a string to prevent React Error #31
    const displayText = typeof text === 'string' ? text : (text && typeof text === 'object' && 'text' in text ? (text as { text: string }).text : JSON.stringify(text));
    
    const [showThinking, setShowThinking] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(displayText);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle clicks on entities
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Use closest to find the element with data-entity-id even if a child was clicked
            const entityEl = target.closest('[data-entity-id]');
            const entityId = entityEl?.getAttribute('data-entity-id');
            
            if (entityId && onEntityClick) {
                onEntityClick(entityId);
            }
        };

        const el = containerRef.current;
        if (el) {
            el.addEventListener('click', handleClick);
        }
        return () => {
            if (el) {
                el.removeEventListener('click', handleClick);
            }
        };
    }, [onEntityClick]);

    // Sync editedText when prop text changes
    useEffect(() => {
        setEditedText(displayText);
    }, [displayText]);

    // Task 2: Simple Render for Streaming to prevent Markdown breakages
    if (isStreaming) {
        const streamText = displayText || "";
        let openIndex = -1;
        let closeIndex = -1;
        let tagLen = 0;
        let closeLen = 0;
        
        const possibleTags = ['thinking', 'think', 'thinhking', 'thought', 'thoughts'];
        
        for (const tag of possibleTags) {
            const openTag = `<${tag}>`;
            const testOpenIndex = streamText.indexOf(openTag);
            if (testOpenIndex !== -1) {
                openIndex = testOpenIndex;
                tagLen = openTag.length;
                closeIndex = streamText.indexOf(`</${tag}>`);
                closeLen = openTag.length + 1; // </tag>
                break;
            }
        }
        
        let thinkingStream = "";
        let contentStream = "";
        
        if (openIndex !== -1) {
            if (closeIndex !== -1) {
                 thinkingStream = streamText.substring(openIndex + tagLen, closeIndex).trim();
                 contentStream = cleanRawText(streamText.substring(closeIndex + closeLen));
            } else {
                 thinkingStream = streamText.substring(openIndex + tagLen).trim();
                 contentStream = "";
            }
        } else {
             contentStream = cleanRawText(streamText);
        }
        
        return (
            <div className="w-full flex flex-col gap-2">
                 {turnNumber !== undefined && (
                    <div className="mb-2 pb-2 border-b border-stone-400/30 dark:border-slate-800/50">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-mystic-accent mb-1 opacity-80 flex items-center gap-2">
                            {turnNumber === 0 ? 'Khởi Đầu (Lượt 0)' : `Lượt ${turnNumber}`}
                            <Loader2 size={10} className="animate-spin text-mystic-accent"/>
                        </div>
                        {userAction && (
                            <div className="text-sm font-serif italic text-stone-500 dark:text-slate-400 opacity-70">
                                &ldquo;{userAction}&rdquo;
                            </div>
                        )}
                    </div>
                 )}
                 
                 {!turnNumber && turnNumber !== 0 && (
                    <div className="text-xs font-bold text-mystic-accent uppercase mb-1 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin"/> Streaming...
                    </div>
                 )}

                 {thinkingStream && (
                     <div className="mb-2 text-stone-500/80 dark:text-slate-500/80 text-sm border-l-2 border-stone-300 dark:border-slate-700 pl-3">
                         <div className="text-[10px] uppercase font-bold tracking-widest mb-1 opacity-50 flex items-center gap-1">
                             <BrainCircuit size={10} className="animate-pulse" /> Đang suy nghĩ...
                         </div>
                         <div className="whitespace-pre-wrap italic animate-pulse">
                             {thinkingStream}
                         </div>
                     </div>
                 )}

                 {/* Render plain text with whitespace preservation during stream */}
                 {contentStream && (
                     <div className="whitespace-pre-wrap font-mono text-base text-stone-700 dark:text-slate-300 leading-relaxed opacity-90 animate-pulse">
                        {contentStream}
                     </div>
                 )}
            </div>
        );
    }

    // Extract Thinking content
    let thinkingContent = extractTagContent(displayText, 'thinking') || 
                          extractTagContent(displayText, 'think') ||
                          extractTagContent(displayText, 'thinhking') ||
                          extractTagContent(displayText, 'thought') ||
                          extractTagContent(displayText, 'thoughts');
    
    // Apply Reasoning Regex (placement 7) to thinking content
    if (thinkingContent && regexScripts && regexScripts.length > 0) {
        const charName = entities?.[0]?.name || 'Character';
        const isDebug = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
        const messageDepth = totalCount > 0 ? (totalCount - 1 - index) : -1;
        
        thinkingContent = getRegexedString(thinkingContent, 7, regexScripts, {
            userName: playerName || 'User',
            charName: charName,
            isMarkdown: true,
            renderPhaseOnly: true,
            depth: messageDepth,
            isDebug
        });
    }

    // Extract Clean Main Content (Strip all system tags)
    const mainContent = cleanRawText(displayText);

    // --- DIALOGUE & FORMATTING LOGIC ---
    const renderContentBlocks = (rawContent: string) => {
        if (!rawContent) return null;
        
        let content = rawContent;

        // 0. Clean Artifacts (System text, status checks)
        if (TAWA_REGEX.ARTIFACTS_REMOVAL) {
             TAWA_REGEX.ARTIFACTS_REMOVAL.forEach(regex => {
                 if (contentBeautify && regex.source.includes('Hệ thống')) {
                     return; 
                 }
                 content = content.replace(regex, '');
             });
        }

        // Apply LSR Regex cleaning
        LSR_REGEX.forEach(rule => {
            content = content.replace(rule.regex, '');
        });

        // 1. Remove Asterisks (*) completely for novel style
        if (TAWA_REGEX.ASTERISK_REMOVAL) {
            content = content.replace(TAWA_REGEX.ASTERISK_REMOVAL, '');
        }

    // 1.5 APPLY ST REGEX SCRIPTS FIRST! (Allows multi-line matching)
    if (regexScripts && regexScripts.length > 0) {
        const charName = entities?.[0]?.name || 'Character';
        const isDebug = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
        // Depth Calculation: 0 is the newest message.
        const messageDepth = totalCount > 0 ? (totalCount - 1 - index) : -1;
        
        const isAI = messageRole === 'assistant' || messageRole === 'system';
        const placementVal = isAI ? 2 : 1;
        
        content = getRegexedString(content, placementVal, regexScripts, {
            userName: playerName || 'User',
            charName: charName,
            isMarkdown: true,
            renderPhaseOnly: true,
            depth: messageDepth,
            isDebug
        });
    }

        // 2. Helper to highlight entities in a string
        const highlightEntities = (text: string) => {
            if (!entities || entities.length === 0) return text;
            
            let tempFormatted = text;

            // Extract tawa-widgets before highlighting entities to avoid corrupting base64
            const tawaWidgets: string[] = [];
            tempFormatted = tempFormatted.replace(/<tawa-widget>[\s\S]*?<\/tawa-widget>/g, (match) => {
                tawaWidgets.push(match);
                return `__TAWA_WIDGET_${tawaWidgets.length - 1}__`;
            });

            const sortedEntities = [...entities].sort((a, b) => b.name.length - a.name.length);

            sortedEntities.forEach((entity) => {
                if (!entity.name) return;
                
                if (playerName && entity.name.toLowerCase() === playerName.toLowerCase()) return;
                if (playerName && playerName.toLowerCase().includes(entity.name.toLowerCase()) && entity.name.length > 2) return;

                const escapedName = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp('(^|[^a-zA-Z0-9\\u00C0-\\u1EF9])(' + escapedName + ')(?![a-zA-Z0-9\\u00C0-\\u1EF9])', 'gi');
                
                const colorClass = entity.type === 'NPC' ? 'text-sky-500' : 
                                   entity.type === 'LOCATION' ? 'text-emerald-500' : 
                                   entity.type === 'FACTION' ? 'text-rose-500' :
                                   entity.type === 'ITEM' ? 'text-amber-500' :
                                   'text-stone-500';

                // We inject raw HTML spans. 
                tempFormatted = tempFormatted.replace(regex, `$1<span class="${colorClass} font-bold cursor-pointer hover:underline decoration-dotted" data-entity-id="${entity.id}">$2</span>`);
            });

            // Restore tawa-widgets
            tawaWidgets.forEach((widget, index) => {
                tempFormatted = tempFormatted.replace(`__TAWA_WIDGET_${index}__`, widget);
            });

            return tempFormatted;
        };

        // 3. Highlight Entities globally
        content = highlightEntities(content);

        // 4. Process Scene Separators (---)
        // Must be on its own line
        content = content.replace(/(?:^|\n)\s*---\s*(?=\n|$)/g, () => {
            return `\n\n<div class="my-8 flex items-center justify-center gap-4 opacity-30">
                <div class="h-[1px] flex-1 bg-gradient-to-r from-transparent to-stone-400 dark:to-slate-600"></div>
                <div class="flex gap-1">
                    <div class="w-1 h-1 rounded-full bg-stone-400 dark:bg-slate-600"></div>
                    <div class="w-1.5 h-1.5 rounded-full bg-stone-500 dark:bg-slate-500"></div>
                    <div class="w-1 h-1 rounded-full bg-stone-400 dark:bg-slate-600"></div>
                </div>
                <div class="h-[1px] flex-1 bg-gradient-to-l from-transparent to-stone-400 dark:to-slate-600"></div>
            </div>\n\n`;
        });

        // 5. Process Notifications [Hệ thống: ...]
        if (contentBeautify) {
            content = content.replace(/(?:^|\n)\s*\[(Hệ thống|Thông báo|System|Notification):?\s*([^\]]+)\]\s*(?=\n|$)/gi, (match, prefix, msg) => {
                return `\n\n<div class="my-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-left-2 duration-500">
                    <div class="mt-0.5 text-blue-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <div class="flex-1">
                        <span class="text-[10px] uppercase font-black tracking-widest text-blue-500/70 block mb-0.5">${prefix}</span>
                        <span class="text-sm font-medium text-blue-700 dark:text-blue-300">${msg}</span>
                    </div>
                </div>\n\n`;
            });
        }

        // 6. Process Dialogue blocks
        if (contentBeautify) {
            content = content.replace(/(?:^|\n)\s*(?:([^:<>\n]+?)(?:\s+nói)?:\s*)?(["“「][^"”」]*["”」])\s*(?=\n|$)/gi, (match, speakerNameRaw, dialogueText, offset, string) => {
                speakerNameRaw = speakerNameRaw ? speakerNameRaw.trim() : "";
                if (!speakerNameRaw && !dialogueText) return match;
                
                const isPC = playerName && speakerNameRaw.toLowerCase().includes(playerName.toLowerCase());
                const entity = entities?.find(e => speakerNameRaw.toLowerCase().includes(e.name.toLowerCase()));
                const isNPC = !!entity && !isPC;
                
                const finalName = isPC ? playerName : (entity ? entity.name : (speakerNameRaw || "Người dẫn chuyện"));
                const initial = finalName.charAt(0).toUpperCase();
                const avatarUrl = isPC ? playerAvatar : (entity?.avatar);
                
                const avatarColor = isPC ? 'bg-sky-500' : (isNPC ? 'bg-amber-500' : 'bg-stone-500');
                const bubbleBg = isPC 
                    ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200/50 dark:border-sky-800/50' 
                    : (isNPC 
                        ? 'bg-white dark:bg-slate-800/40 border-stone-200 dark:border-slate-700' 
                        : 'bg-stone-100 dark:bg-stone-900/30 border-stone-200 dark:border-stone-800');
                const textColor = isPC 
                    ? 'text-sky-900 dark:text-sky-100' 
                    : (isNPC 
                        ? 'text-stone-900 dark:text-slate-200' 
                        : 'text-stone-800 dark:text-slate-300');
                const nameColor = isPC 
                    ? 'text-sky-600 dark:text-sky-400' 
                    : (isNPC 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-stone-500 dark:text-slate-500');

                const flexDir = isPC ? 'flex-row-reverse' : '';
                const alignItem = isPC ? 'items-end' : 'items-start';
                const roundedShape = isPC ? 'rounded-tr-none' : 'rounded-tl-none';
                
                const tailClass = isPC 
                    ? `absolute top-0 -right-1.5 w-3 h-3 ${bubbleBg} border-t border-r transform rotate-45 translate-y-3` 
                    : `absolute top-0 -left-1.5 w-3 h-3 ${bubbleBg} border-t border-l transform -rotate-45 translate-y-3`;

                const avatarContent = avatarUrl 
                    ? `<img src="${avatarUrl}" alt="${finalName}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />` 
                    : initial;
                
                const npcBadge = isNPC 
                    ? `<span class="w-1 h-1 rounded-full bg-amber-500/50"></span><span class="text-[9px] text-amber-600/70 dark:text-amber-500/50 font-bold uppercase tracking-tighter">NPC</span>` 
                    : '';

                // We encode the dialogue text in a div that rehypeRaw will pass through
                return `\n\n<div class="flex items-start gap-3 my-6 animate-in fade-in slide-in-from-left-2 duration-300 ${flexDir}">
                    <div class="w-9 h-9 rounded-xl ${avatarColor} text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm border-2 border-white dark:border-slate-800 overflow-hidden">
                        ${avatarContent}
                    </div>
                    <div class="flex flex-col max-w-[80%] ${alignItem}">
                        <div class="flex items-center gap-2 mb-1 px-1">
                            <span class="text-[11px] font-black ${nameColor} uppercase tracking-[0.1em]">${finalName}</span>
                            ${npcBadge}
                        </div>
                        <div class="${bubbleBg} p-4 rounded-2xl ${roundedShape} border shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-none relative group text-base md:text-lg leading-relaxed ${textColor}">
                            <div class="${tailClass}"></div>
                            ${dialogueText}
                        </div>
                    </div>
                </div>\n\n`;
            });
        }

        // 7. Handle internal thoughts (Tiếng lòng) - Thường trong ngoặc đơn (...)
        content = content.replace(
            /(?<!url|rgba?|hsl|var|calc)\(([^)]{10,})\)/g,
            '<span class="text-stone-400 dark:text-slate-500 italic font-serif opacity-90">($1)</span>'
        );

        // 8. Handle Action Highlights [Hành động: ...]
        content = content.replace(
            /\[(Hành động|Action):?\s*([^\]]+)\]/gi,
            '<span class="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mx-1">$2</span>'
        );

        // Return the single Markdown renderer block
        return (
            <MarkdownRenderer 
                className="text-stone-800 dark:text-slate-300 leading-relaxed text-base md:text-lg font-normal opacity-95"
                content={content}
                regexScripts={[]} // Already applied above
                userName={playerName}
                messageRole={messageRole}
            />
        );
    };

    const handleSaveEdit = () => {
        onUpdate(index, editedText);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditedText(text);
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="w-full flex flex-col gap-2 animate-in fade-in duration-200 border border-mystic-accent/30 p-2 rounded bg-stone-200 dark:bg-mystic-900/80">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-mystic-accent uppercase flex items-center gap-1">
                        <Edit2 size={12} /> Editing Raw Context
                    </span>
                    <button onClick={handleCancelEdit} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white">
                        <X size={14} />
                    </button>
                </div>
                <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full h-96 bg-stone-200 dark:bg-mystic-950 border border-stone-400 dark:border-slate-800 rounded p-3 text-xs font-mono text-stone-800 dark:text-slate-300 focus:border-mystic-accent outline-none resize-y custom-scrollbar leading-relaxed"
                    placeholder="Nhập nội dung raw (bao gồm cả thẻ <thinking>, <content>...)"
                    spellCheck={false}
                />
                 <div className="flex justify-end gap-2 mt-1">
                    <button 
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-xs text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white bg-stone-300 dark:bg-slate-800 rounded border border-stone-400 dark:border-slate-700 hover:bg-stone-400 dark:hover:bg-slate-700 font-medium"
                    >
                        Hủy bỏ
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="px-3 py-1.5 text-xs text-mystic-900 bg-mystic-accent hover:bg-sky-400 rounded font-bold shadow-[0_0_10px_rgba(56,189,248,0.3)] flex items-center gap-1"
                    >
                        <Save size={12} /> Lưu thay đổi
                    </button>
                </div>
            </div>
        );
    }

    // Header Row: Thinking Toggle + Edit Button - Only show if needed
    const isUserMessage = turnNumber === undefined;
    const effectiveMetadata = !isUserMessage ? (metadata || {
        presetUsed: 'Mặc định',
        cotUsed: 'Không rõ',
        worldInfoConfig: '0 Entities'
    }) : undefined;
    const hasMetadata = !!effectiveMetadata;
    
    if (thinkingContent || isEditing || isUserMessage || !isUserMessage) {
        return (
            <div className="flex flex-col gap-1 w-full group" ref={containerRef}>
                <div className="flex items-center gap-3 w-full min-h-[16px]">
                    {thinkingContent ? (
                        <button 
                            onClick={() => setShowThinking(!showThinking)}
                            className={`flex items-center gap-2 text-[10px] uppercase font-bold text-stone-500 hover:text-mystic-accent transition-all duration-200`}
                        >
                            <BrainCircuit size={12} />
                            {showThinking ? 'Ẩn dòng tư duy' : 'Hiện dòng tư duy'}
                        </button>
                    ) : (
                        <div className="flex-1"></div>
                    )}
                    
                    {effectiveMetadata && (
                        <div className="flex items-center gap-3 text-[9px] uppercase font-bold text-stone-400 dark:text-slate-500 transition-opacity">
                            <span className="flex items-center gap-1" title="Preset">
                                <Settings size={10} /> <span className="truncate max-w-[80px]">{effectiveMetadata.presetUsed}</span>
                            </span>
                            <span className="flex items-center gap-1" title="CoT">
                                <Brain size={10} /> <span className="truncate max-w-[80px]">{effectiveMetadata.cotUsed}</span>
                            </span>
                            <span className="flex items-center gap-1" title="World Info Entities">
                                <Database size={10} /> {effectiveMetadata.worldInfoConfig}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={() => setIsEditing(true)}
                        className={`flex items-center gap-1 text-[10px] font-bold text-stone-600 hover:text-sky-400 uppercase transition-all ${(thinkingContent || effectiveMetadata) ? 'opacity-100 hover:text-sky-400' : 'opacity-100'}`}
                        title={isUserMessage ? "Chỉnh sửa hành động của bạn" : "Chỉnh sửa Context gốc (Raw)"}
                    >
                        <Edit2 size={10} /> {isUserMessage ? 'Chỉnh sửa hành động' : 'Edit Raw'}
                    </button>
                </div>
                
                {thinkingContent && (
                    <AnimatePresence>
                        {showThinking && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className={`${
                                    contentBeautify 
                                    ? "bg-purple-500/5 dark:bg-purple-900/10 border-l-4 border-purple-400/50 p-4 rounded-r-xl shadow-inner mb-4" 
                                    : "bg-stone-200 dark:bg-slate-900/50 border-l-2 border-stone-400 dark:border-slate-600 p-3 rounded-r mb-2"
                                } text-xs text-stone-500 dark:text-slate-400 font-mono overflow-hidden whitespace-pre-wrap relative`}
                            >
                                {contentBeautify && (
                                    <div className="absolute top-2 right-2 opacity-20">
                                        <Brain size={24} />
                                    </div>
                                )}
                                <div className={contentBeautify ? "opacity-80 leading-relaxed" : ""}>
                                    <span dangerouslySetInnerHTML={{__html: thinkingContent}} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
                
                <div 
                  className="font-sans text-base md:text-lg text-stone-800 dark:text-slate-300 [&>p]:mb-3 last:[&>p]:mb-0 leading-[20px] font-normal not-italic"
                >
                    {turnNumber !== undefined && (
                        <div id={`turn-${turnNumber}`} className="mb-4 pb-2 border-b border-stone-400/30 dark:border-slate-800/50 scroll-mt-20">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-mystic-accent mb-1 opacity-80">
                                {turnNumber === 0 ? 'Khởi Đầu (Lượt 0)' : `Lượt ${turnNumber}`}
                            </div>
                            {userAction && (
                                <div className="text-sm font-serif italic text-stone-500 dark:text-slate-400">
                                    &ldquo;{userAction}&rdquo;
                                </div>
                            )}
                        </div>
                    )}
                    {renderContentBlocks(mainContent) || (isStreaming ? null : (
                        <div className="p-4 bg-stone-300/50 dark:bg-slate-900/50 border border-dashed border-stone-400 dark:border-slate-700 rounded-xl">
                            <div className="flex items-center gap-2 text-red-500 mb-2">
                                <Shield size={16} />
                                <span className="text-xs font-bold uppercase tracking-wider">Lỗi Hiển Thị Nội Dung</span>
                            </div>
                            <p className="text-stone-600 dark:text-slate-400 italic text-sm mb-3">
                                [Nội dung truyện trống hoặc đã bị bộ lọc hệ thống loại bỏ hoàn toàn. AI có thể đã gặp lỗi logic, vi phạm chính sách an toàn, hoặc chỉ phản hồi các thẻ kỹ thuật mà không có văn bản truyện.]
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="px-3 py-1.5 bg-mystic-accent/10 hover:bg-mystic-accent/20 border border-mystic-accent/30 rounded text-[10px] font-bold text-mystic-accent uppercase transition-colors flex items-center gap-1"
                                >
                                    <Edit2 size={10} /> Kiểm tra dữ liệu gốc (Edit Raw)
                                </button>
                                <button 
                                    onClick={() => {
                                        // Trigger regeneration by calling the handleAction with the last message
                                        const lastUserMsg = history.filter(m => m.role === 'user').pop();
                                        if (lastUserMsg && onUpdate) {
                                            // This is a bit complex as we need to trigger the parent's handleAction
                                            // For now, we'll just reload or suggest the user to use the retry button in the UI
                                            window.location.reload();
                                        } else {
                                            window.location.reload();
                                        }
                                    }} 
                                    className="px-3 py-1.5 bg-mystic-accent/20 hover:bg-mystic-accent/30 border border-mystic-accent/40 rounded text-[10px] font-bold text-mystic-accent uppercase transition-colors flex items-center gap-1"
                                >
                                    <RefreshCw size={10} /> Thử lại (Regenerate)
                                </button>
                                <button 
                                    onClick={() => window.location.reload()} 
                                    className="px-3 py-1.5 bg-stone-400/20 hover:bg-stone-400/30 border border-stone-400/30 rounded text-[10px] font-bold text-stone-500 uppercase transition-colors flex items-center gap-1"
                                >
                                    <RotateCcw size={10} /> Tải lại trang
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Default return to prevent React Error #31
    return (
        <div className="font-sans text-base md:text-lg text-stone-800 dark:text-slate-300 [&>p]:mb-3 last:[&>p]:mb-0 leading-[20px] font-normal not-italic" ref={containerRef}>
            {turnNumber !== undefined && (
                <div id={`turn-${turnNumber}`} className="mb-4 pb-2 border-b border-stone-400/30 dark:border-slate-800/50 scroll-mt-20">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-mystic-accent mb-1 opacity-80">
                        {turnNumber === 0 ? 'Khởi Đầu (Lượt 0)' : `Lượt ${turnNumber}`}
                    </div>
                    {userAction && (
                        <div className="text-sm font-serif italic text-stone-500 dark:text-slate-400">
                            &ldquo;{userAction}&rdquo;
                        </div>
                    )}
                </div>
            )}
            {renderContentBlocks(mainContent) || (isStreaming ? null : <div className="text-stone-500 italic text-sm">[Nội dung truyện trống - AI có thể đã gặp lỗi hoặc chỉ phản hồi các thẻ hệ thống. Bạn có thể thử 'Regenerate' hoặc kiểm tra 'Edit Raw' để xem dữ liệu gốc]</div>)}
        </div>
    );
});

// --- RULES MANAGER COMPONENT ---
const RulesManager: React.FC<{
    rules: string[];
    onUpdate: (newRules: string[]) => void;
}> = ({ rules, onUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [newRule, setNewRule] = useState("");
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editValue, setEditValue] = useState("");

    const handleAdd = () => {
        if (!newRule.trim()) return;
        onUpdate([...rules, newRule.trim()]);
        setNewRule("");
    };

    const handleDelete = (idx: number) => {
        if(window.confirm("Bạn có chắc chắn muốn xóa luật này?")) {
            onUpdate(rules.filter((_, i) => i !== idx));
        }
    };

    const startEdit = (idx: number, val: string) => {
        setEditIdx(idx);
        setEditValue(val);
    };

    const saveEdit = (idx: number) => {
        const updated = [...rules];
        updated[idx] = editValue;
        onUpdate(updated);
        setEditIdx(null);
    };

    return (
        <div className="w-full border border-stone-200 dark:border-slate-700/50 shadow-sm rounded-xl bg-white dark:bg-slate-800/40 overflow-hidden mb-3 flex flex-col">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-3 flex justify-between items-center text-left hover:bg-stone-50 dark:hover:bg-slate-800/60 transition-colors group"
            >
                <div className="flex items-center gap-3 text-sm font-semibold text-stone-800 dark:text-slate-200 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                     <div className="p-1.5 bg-stone-100 dark:bg-slate-700/50 rounded-lg group-hover:bg-red-100 dark:group-hover:bg-red-500/20 transition-colors">
                        <BookOpen size={16} className="text-stone-600 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
                     </div>
                     Luật Lệ & Ràng Buộc
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-stone-500 bg-stone-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        {rules.length} Active
                    </span>
                    <div className="p-1 rounded hover:bg-stone-200 dark:hover:bg-slate-700 transition-colors text-stone-500">
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 pt-1 border-t border-stone-100 dark:border-slate-700/50">
                            <p className="text-[11px] text-stone-500 mb-3 italic border-l-2 border-red-200 dark:border-red-900/50 pl-2 leading-relaxed">
                                Các quy tắc có quyền lực tối thượng, ép buộc AI tuân theo bất kể ngữ cảnh hay logic thông thường.
                            </p>

                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                {/* Rule 0 - System Mandatory Rule */}
                                <div className="flex gap-2 items-start bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg border border-stone-200 dark:border-slate-700/50">
                                    <span className="text-stone-400 font-bold text-[10px] mt-[2px]">0.</span>
                                    <p className="flex-1 text-xs text-stone-600 dark:text-slate-400 font-medium leading-relaxed italic">
                                        Cấm AI mở đầu bằng các câu như "Đây là chương tiếp theo," hoặc "Bản dịch của bạn đây,". Hãy nhập vai NGAY LẬP TỨC!
                                    </p>
                                    <div className="px-1 py-[2px] bg-stone-200 dark:bg-slate-700 text-stone-500 dark:text-slate-400 text-[8px] font-bold uppercase rounded opacity-80 shrink-0">System</div>
                                </div>

                                {rules.length === 0 && (
                                    <p className="text-xs text-center text-stone-400 dark:text-slate-500 py-6 border border-dashed border-stone-200 dark:border-slate-700 rounded-lg">
                                        Chưa có luật lệ bổ sung.
                                    </p>
                                )}
                                {rules.map((rule, idx) => (
                                    <div key={idx} className="flex gap-2 items-start bg-red-50/50 dark:bg-red-900/10 p-2.5 rounded-lg border border-red-100 dark:border-red-900/30 group hover:border-red-300 dark:hover:border-red-800/50 transition-colors relative">
                                        <span className="text-red-400 dark:text-red-500 font-bold text-[10px] mt-[2px]">{idx + 1}.</span>
                                        {editIdx === idx ? (
                                            <div className="flex-1 flex gap-1.5 flex-col">
                                                <textarea 
                                                    autoFocus
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    className="w-full bg-white dark:bg-slate-900 text-xs text-stone-800 dark:text-slate-200 border border-red-300 dark:border-red-800/50 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-red-400 min-h-[60px] resize-y custom-scrollbar"
                                                />
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => setEditIdx(null)} className="px-2 py-1 text-[10px] uppercase font-bold text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">Hủy</button>
                                                    <button onClick={() => saveEdit(idx)} className="px-2 py-1 text-[10px] uppercase font-bold text-green-600 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded hover:bg-green-100 dark:hover:bg-green-900/40 flex items-center gap-1">
                                                        <Check size={12}/> Lưu
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="flex-1 text-xs text-stone-800 dark:text-slate-200 font-medium leading-relaxed pr-6">{rule}</p>
                                        )}
                                        
                                        {editIdx !== idx && (
                                            <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-md border border-stone-200 dark:border-slate-700">
                                                <button onClick={() => startEdit(idx, rule)} className="p-1.5 text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-l-md transition-colors"><Edit2 size={12}/></button>
                                                <div className="w-[1px] bg-stone-200 dark:bg-slate-700"></div>
                                                <button onClick={() => handleDelete(idx)} className="p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-r-md transition-colors"><Trash2 size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Add New Rule Input */}
                            <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-stone-100 dark:border-slate-700/50">
                                <textarea 
                                    value={newRule}
                                    onChange={(e) => setNewRule(e.target.value)}
                                    placeholder="Thêm luật mới (Lưu ý: Không nên cho quá nhiều luật)..."
                                    className="w-full bg-stone-50 dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-stone-800 dark:text-slate-200 focus:border-red-400 focus:ring-1 focus:ring-red-400 outline-none resize-y min-h-[60px] custom-scrollbar"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAdd();
                                        }
                                    }}
                                />
                                <div className="flex justify-end">
                                    <button 
                                        onClick={handleAdd}
                                        disabled={!newRule.trim()}
                                        className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold text-xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                                    >
                                        <Plus size={14} className="group-hover:scale-110 transition-transform" /> Thêm luật
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};


const EntityDetailModal: React.FC<{
    entity: Entity | null;
    onClose: () => void;
    onUpdateAvatar: (entityId: string) => void;
}> = ({ entity, onClose, onUpdateAvatar }) => {
    if (!entity) return null;

    const getIcon = () => {
        switch (entity.type) {
            case 'NPC': return <User size={20} className="text-sky-500" />;
            case 'LOCATION': return <MapPin size={20} className="text-emerald-500" />;
            case 'FACTION': return <Shield size={20} className="text-rose-500" />;
            case 'ITEM': return <Box size={20} className="text-amber-500" />;
            default: return <Box size={20} className="text-stone-500" />;
        }
    };

    const getTitle = () => {
        switch (entity.type) {
            case 'NPC': return 'Thông tin Nhân vật';
            case 'LOCATION': return 'Thông tin Địa danh';
            case 'FACTION': return 'Thông tin Phe phái';
            case 'ITEM': return 'Thông tin Vật phẩm';
            default: return 'Thông tin Thực thể';
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full max-w-lg rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            >
                <div className="p-4 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-slate-900/50">
                    <h2 className="text-lg font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2">
                        {getIcon()} {getTitle()}
                    </h2>
                    <button onClick={onClose} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4 bg-stone-200 dark:bg-mystic-900">
                    <div className="flex items-start gap-4">
                        <button 
                            onClick={() => onUpdateAvatar(entity.id)}
                            className="w-20 h-20 rounded-xl bg-stone-300 dark:bg-slate-800 border-2 border-mystic-accent flex items-center justify-center shrink-0 shadow-lg overflow-hidden group relative"
                        >
                            {entity.avatar ? (
                                <img src={entity.avatar} alt={entity.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="text-mystic-accent opacity-50 group-hover:opacity-100 transition-opacity flex flex-col items-center">
                                    {getIcon()}
                                    <span className="text-[8px] mt-1 font-bold">Thêm ảnh</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Edit2 size={16} className="text-white" />
                            </div>
                        </button>
                        <div>
                            <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-1">{entity.name}</h3>
                            <span className="text-xs font-bold text-mystic-accent uppercase tracking-widest opacity-70">
                                {entity.type === 'CUSTOM' ? entity.customType || 'Vật phẩm' : entity.type}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {entity.personality && (
                            <div className="space-y-1">
                                <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Tính cách</h4>
                                <MarkdownRenderer 
                                    className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-3 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                    content={entity.personality}
                                />
                            </div>
                        )}

                        {entity.type === 'ITEM' && (entity.rarity || entity.price) && (
                            <div className="grid grid-cols-2 gap-3">
                                {entity.rarity && (
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Độ hiếm</h4>
                                        <div className="text-sm font-bold text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 px-3 py-2 rounded border border-stone-400 dark:border-slate-700/50">
                                            {entity.rarity}
                                        </div>
                                    </div>
                                )}
                                {entity.price && (
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Giá cả</h4>
                                        <div className="text-sm font-bold text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 px-3 py-2 rounded border border-stone-400 dark:border-slate-700/50">
                                            {entity.price}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-1">
                            <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Mô tả</h4>
                            <MarkdownRenderer 
                                className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-3 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                content={entity.description || "Không có mô tả chi tiết."}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const GameplayScreen: React.FC<NavigationProps> = ({ onNavigate, activeWorld, onUpdateWorld }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>(activeWorld?.savedState?.history || []);
  const [lastAction, setLastAction] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [turnCount, setTurnCount] = useState(activeWorld?.savedState?.turnCount || 0);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // AI Monitor States
  const [tokenHistory, setTokenHistory] = useState<{tokens: number, words: number, timestamp: number}[]>(activeWorld?.savedState?.aiMonitor?.tokenHistory || []);
  const [totalTokens, setTotalTokens] = useState<number>(activeWorld?.savedState?.aiMonitor?.totalTokens || 0);
  const processingStartTimeRef = useRef<number | null>(null);
  const [currentProcessingTime, setCurrentProcessingTime] = useState<number>(0);
  const [lastTurnTotalTime, setLastTurnTotalTime] = useState<number>(activeWorld?.savedState?.aiMonitor?.lastTurnTotalTime || 0);

  // Image Library States
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [showLogConsole, setShowLogConsole] = useState(false);
  const [selectingAvatarFor, setSelectingAvatarFor] = useState<{ type: 'player' | 'entity', id?: string } | null>(null);

  // UI States
  const [showTokenDetails, setShowTokenDetails] = useState(true);
  const [showStatsDetails, setShowStatsDetails] = useState(true);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [autosaveList, setAutosaveList] = useState<SaveFile[]>([]);
  const [manualSaveList, setManualSaveList] = useState<SaveFile[]>([]);
  const [initialSaveList, setInitialSaveList] = useState<SaveFile[]>([]);
  const [activeSaveTab, setActiveSaveTab] = useState<'manual' | 'autosave' | 'history' | 'initial'>('manual');
  const [showContextModal, setShowContextModal] = useState(false);
  const [activeContextTab, setActiveContextTab] = useState<'config' | 'debugger'>('config');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [lastNavigatedTurn, setLastNavigatedTurn] = useState<number | null>(null);
  const pendingScrollTurnRef = useRef<number | null>(null);

  // Dynamic States (Rules & Tawa)
  const [tawaPresetConfig, setTawaPresetConfig] = useState<TawaPresetConfig>(DEFAULT_PRESET_CONFIG);
  const [dynamicRules, setDynamicRules] = useState<string[]>(activeWorld?.config?.rules || []);
  const [combinedRegexScripts, setCombinedRegexScripts] = useState<import('../../../types').RegexScript[]>([]);
  const [gameTime, setGameTime] = useState<GameTime>(activeWorld?.gameTime || INITIAL_GAME_TIME);

  const reloadRegexScripts = useCallback(async () => {
    try {
        const s = await dbService.getSettings() as AppSettings;
        setSettings(s);
        const globals = s?.regex_scripts || [];
        const scopeds = activeWorldRef.current?.extensions?.regex_scripts || [];
        const presets = activeWorldRef.current?.config?.regexScripts || [];
        setCombinedRegexScripts([...globals, ...scopeds, ...presets]);
    } catch (e) {
        console.error("Failed to load regex scripts", e);
    }
  }, []);

  const combinedRegexScriptsRef = useRef<import('../../../types').RegexScript[]>([]);
  useEffect(() => { combinedRegexScriptsRef.current = combinedRegexScripts; }, [combinedRegexScripts]);

  useEffect(() => {
    const handleReload = () => reloadRegexScripts();
    window.addEventListener('reload_regex_scripts', handleReload);
    return () => window.removeEventListener('reload_regex_scripts', handleReload);
  }, [reloadRegexScripts]);

  const handleTawaConfigChange = useCallback((config: TawaPresetConfig) => {
      setTawaPresetConfig(config);
  }, []);

  const handleAvatarSelect = async (image: ImageMetadata) => {
    if (!selectingAvatarFor) return;

    if (selectingAvatarFor.type === 'player') {
        const updatedWorld = {
            ...activeWorld,
            player: { ...activeWorld.player, avatar: image.data }
        };
        onUpdateWorld(updatedWorld);
    } else if (selectingAvatarFor.type === 'entity' && selectingAvatarFor.id) {
        const updatedEntities = activeWorld.entities.map(e => 
            e.id === selectingAvatarFor.id ? { ...e, avatar: image.data } : e
        );
        const updatedWorld = {
            ...activeWorld,
            entities: updatedEntities
        };
        onUpdateWorld(updatedWorld);
    }
    
    setSelectingAvatarFor(null);
    setShowImageLibrary(false);
  };

  // LSR State
  const [lsrTables, setLsrTables] = useState<LsrTableDefinition[]>([]);
  const [lsrRuntimeData, setLsrRuntimeData] = useState<Record<string, unknown[]>>(activeWorld?.lsrData || {});
  const [activeLsrTableId, setActiveLsrTableId] = useState<string | null>(null);
  const [lsrViewMode, setLsrViewMode] = useState<'table' | 'timeline'>('table');
  const { isMobile } = useResponsive();

  const [isReadyRef_flag, setIsReadyRef_flag] = useState(false); // Just a dummy to prevent unused
  const [tavoSelectState, setTavoSelectState] = useState<{options: any[], title?: string, defaultValue?: any, resolve: (val: any) => void} | null>(null);

  useEffect(() => {
    tavoRegistry.activeWorld = activeWorld || null;
    tavoRegistry.updateWorld = onUpdateWorld || null;
    tavoRegistry.getHistory = () => historyRef.current;
    tavoRegistry.updateHistory = (h: ChatMessage[]) => {
        setHistory(h);
        historyRef.current = h;
    };
    tavoRegistry.showSelect = (options: any[], title?: string, defaultValue?: any) => {
        return new Promise<any>((resolve) => {
            setTavoSelectState({ options, title, defaultValue, resolve });
        });
    };
    tavoRegistry.generateText = async (promptText: string, options: any) => {
        // Implement tavo.generate
        const { dbService } = await import('../../../services/db/indexedDB');
        const settings = await dbService.getSettings() as any; // We need current settings
        const { getAiClient } = await import('../../../services/ai/client');
        const { getAiModel } = await import('../../../services/ai/gameplay/service');
        const { buildPromptFromHistory } = await import('../../../services/ai/gameplay/prompts');
        const client = getAiClient(settings);
        const modelName = getAiModel(settings);

        let finalPrompt = promptText;
        if (options?.context) {
            // Build context
            const ctxText = buildPromptFromHistory(
               options.preset ? { ...activeWorld?.config?.tawaPreset, ...options.preset } : activeWorld?.config?.tawaPreset as any,
               historyRef.current,
               activeWorld!,
               gameTimeRef.current,
               promptText, // Append to the end as userInput
               settings
            );
            finalPrompt = ctxText.prompt;
        }

        const modelOpts: any = {
            model: modelName,
            contents: finalPrompt,
            config: {
                temperature: options?.settings?.temperature ?? 0.7,
                topP: options?.settings?.topP ?? 0.9,
            }
        };
        
        if (options?.settings?.maxOutputTokens || options?.settings?.maxCompletionTokens) {
            modelOpts.config.maxOutputTokens = options.settings.maxOutputTokens || options.settings.maxCompletionTokens;
        }

        const response = await client.models.generateContent(modelOpts);
        return response.text() || "";
    };

    return () => {
        tavoRegistry.generateText = null;
        tavoRegistry.showSelect = null;
    };
  }, [activeWorld, onUpdateWorld, setHistory]);

  // --- DERIVED STATE (MUST BE BEFORE HOOKS THAT USE THEM) ---
  const totalPages = history.length <= 11 ? 1 : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
  const startIndex = currentPage === 1 ? 0 : 11 + (currentPage - 2) * MESSAGES_PER_PAGE;
  const endIndex = currentPage === 1 ? 11 : startIndex + MESSAGES_PER_PAGE;
  const displayedMessages = history.slice(startIndex, endIndex);

  const initializedRef = useRef(false);
  const isReadyRef = useRef(false); // Guard for syncing state - ALWAYS false initially
  const lastWorldRef = useRef<WorldData | null>(null);
  const initialStartedRef = useRef(false); // Guard for initial generation
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for state data to ensure up-to-date values in callbacks without triggering re-renders or loops
  const tokenHistoryRef = useRef<{tokens: number, words: number, timestamp: number}[]>(activeWorld?.savedState?.aiMonitor?.tokenHistory || []);
  const totalTokensRef = useRef<number>(activeWorld?.savedState?.aiMonitor?.totalTokens || 0);
  const lastTurnTotalTimeRef = useRef<number>(activeWorld?.savedState?.aiMonitor?.lastTurnTotalTime || 0);
  const historyRef = useRef<ChatMessage[]>(activeWorld?.savedState?.history || []);
  const turnCountRef = useRef<number>(activeWorld?.savedState?.turnCount || 0);
  const gameTimeRef = useRef<GameTime>(activeWorld?.gameTime || INITIAL_GAME_TIME);
  const lsrRuntimeDataRef = useRef<Record<string, unknown[]>>(activeWorld?.lsrData || {});
  const activeWorldSummaryRef = useRef<string | undefined>(activeWorld?.summary);
  const lastActionRef = useRef<string | undefined>(lastAction);
  const activeWorldRef = useRef<WorldData | null>(activeWorld);
  const dynamicRulesRef = useRef<string[]>(activeWorld?.config?.rules || []);
  const tawaPresetConfigRef = useRef<TawaPresetConfig>(tawaPresetConfig);

  // Helper to sync state back to App.tsx
  const syncWorldState = useCallback((currentHistory?: ChatMessage[], currentTurn?: number, currentTime?: GameTime, currentLsrData?: Record<string, unknown[]>, currentSummary?: string) => {
    if (!isReadyRef.current) return; // Guard against stale sync during init
    // console.log(`GameplayScreen: Syncing state to App.tsx (Turn ${currentTurn !== undefined ? currentTurn : turnCountRef.current})...`);
    if (onUpdateWorld) {
      // Wrap in setTimeout to avoid "Cannot update a component while rendering" error
      setTimeout(() => {
        onUpdateWorld({
          summary: currentSummary || activeWorldSummaryRef.current,
          lsrData: currentLsrData || lsrRuntimeDataRef.current,
          config: {
            ...activeWorldRef.current?.config,
            rules: dynamicRulesRef.current,
            tawaPreset: tawaPresetConfigRef.current
          },
          savedState: {
            history: currentHistory || historyRef.current,
            turnCount: currentTurn !== undefined ? currentTurn : turnCountRef.current,
            gameTime: currentTime || gameTimeRef.current,
            aiMonitor: {
              tokenHistory: tokenHistoryRef.current,
              totalTokens: totalTokensRef.current,
              lastTurnTotalTime: lastTurnTotalTimeRef.current
            }
          }
        });
      }, 0);
    }
  }, [onUpdateWorld]);

  // Sync refs with state
  useEffect(() => { tokenHistoryRef.current = tokenHistory; }, [tokenHistory]);
  useEffect(() => { totalTokensRef.current = totalTokens; }, [totalTokens]);
  useEffect(() => { lastTurnTotalTimeRef.current = lastTurnTotalTime; }, [lastTurnTotalTime]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { turnCountRef.current = turnCount; }, [turnCount]);
  useEffect(() => { gameTimeRef.current = gameTime; }, [gameTime]);
  useEffect(() => { lsrRuntimeDataRef.current = lsrRuntimeData; }, [lsrRuntimeData]);
  useEffect(() => { activeWorldSummaryRef.current = activeWorld?.summary; }, [activeWorld?.summary]);
  useEffect(() => { lastActionRef.current = lastAction; }, [lastAction]);
  useEffect(() => { activeWorldRef.current = activeWorld; }, [activeWorld]);
  useEffect(() => { dynamicRulesRef.current = dynamicRules; }, [dynamicRules]);
  useEffect(() => { combinedRegexScriptsRef.current = combinedRegexScripts; }, [combinedRegexScripts]);
  useEffect(() => { tawaPresetConfigRef.current = tawaPresetConfig; }, [tawaPresetConfig]);

  // CẢI TIẾN: Đồng bộ dữ liệu LSR sang danh sách thực thể (entities) để có thể tương tác
  useEffect(() => {
    if (!isReadyRef.current || !lsrRuntimeData || !activeWorld) return;

    const currentEntities = activeWorld.entities || [];
    const newEntities: Entity[] = [...currentEntities];
    let hasChanges = false;

    // Helper to add entity if not exists
    const addEntityIfNew = (name: string, type: Entity['type'], description?: string) => {
        if (!name || name.trim() === "" || name.length < 2) return;
        
        // CẢI TIẾN: Không thêm người chơi (PC) vào danh sách thực thể NPC
        const playerName = activeWorld.player.name;
        if (playerName && (name.toLowerCase() === playerName.toLowerCase() || name.toLowerCase() === "user" || name.toLowerCase() === "player")) return;

        // Tránh trùng lặp (không phân biệt hoa thường)
        const exists = newEntities.some(e => e.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
            newEntities.push({
                id: `lsr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: name.trim(),
                type,
                description: description || `Thực thể được phát hiện qua hệ thống LSR.`,
                personality: "",
                avatar: ""
            });
            hasChanges = true;
        }
    };

    // Table #1 & #2: Characters
    ['1', '2'].forEach(tableId => {
        const rows = lsrRuntimeData[tableId] as any[] || [];
        rows.forEach(row => {
            const name = row['0'];
            if (name) addEntityIfNew(name, 'NPC', row['3'] || row['6']); 
        });
    });

    // Table #6: Items
    const itemRows = lsrRuntimeData['6'] as any[] || [];
    itemRows.forEach(row => {
        const name = row['0'];
        if (name) addEntityIfNew(name, 'ITEM', row['5']); 
    });

    // Table #8: Locations
    const locRows = lsrRuntimeData['8'] as any[] || [];
    locRows.forEach(row => {
        const name = row['0'];
        if (name) addEntityIfNew(name, 'LOCATION', row['2']); 
    });

    if (hasChanges && onUpdateWorld) {
        // console.log("GameplayScreen: Syncing new entities from LSR data...", newEntities.length);
        onUpdateWorld({ entities: newEntities });
    }
  }, [lsrRuntimeData, activeWorld, onUpdateWorld]);

  // Sync dynamic rules and tawa preset back to world state when they change
  useEffect(() => {
    if (isReadyRef.current && (dynamicRules.length > 0 || combinedRegexScripts.length > 0)) {
      syncWorldState();
    }
  }, [dynamicRules, combinedRegexScripts, syncWorldState]);

  useEffect(() => {
    if (isReadyRef.current) {
      syncWorldState();
    }
  }, [tawaPresetConfig, syncWorldState]);

  // Task: Scheduled Vectorization (Every 10 turns)
  const lastVectorizedTurnRef = useRef<number>(-1);
  
  useEffect(() => {
      if (!activeWorld || !settings?.enableVectorMemory || !isReadyRef.current) return;
      
      const currentTurn = turnCount;
      const shouldVectorize = currentTurn > 0 && currentTurn % 50 === 0 && currentTurn !== lastVectorizedTurnRef.current;
      
      if (shouldVectorize) {
          lastVectorizedTurnRef.current = currentTurn;
          // Small delay to ensure state is settled
          setTimeout(() => {
              vectorService.vectorizeAllHistory(historyRef.current, settings);
          }, 2000);
      }
  }, [turnCount, activeWorld, settings, isReadyRef]);

  // Timer Logic
  useEffect(() => {
      if (isLoading) {
          processingStartTimeRef.current = Date.now();
          setCurrentProcessingTime(0);
          timerRef.current = setInterval(() => {
              setCurrentProcessingTime(prev => prev + 100);
          }, 100);
      } else {
          if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
          }
          if (processingStartTimeRef.current) {
              const total = Date.now() - processingStartTimeRef.current;
              setLastTurnTotalTime(total);
              lastTurnTotalTimeRef.current = total; // Update ref immediately
              processingStartTimeRef.current = null;
              // Sync one last time to capture the final processing time
              syncWorldState();
          }
      }
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, [isLoading, syncWorldState]);

  // Initialize active LSR table
  useEffect(() => {
    if (lsrTables.length > 0 && !activeLsrTableId) {
      setActiveLsrTableId(lsrTables[0].id);
    }
  }, [lsrTables, activeLsrTableId]);

  const formatTime = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const milliseconds = Math.floor((ms % 1000) / 100);
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
  };

  const updateTokenHistory = (tokens: number, text?: string) => {
      if (!tokens) return;
      const words = text ? text.trim().split(/\s+/).length : 0;
      const newEntry = { tokens, words, timestamp: Date.now() };
      
      // Update state for UI
      setTokenHistory(prev => {
          const updated = [newEntry, ...prev].slice(0, 5);
          tokenHistoryRef.current = updated; // Update ref
          return updated;
      });
      setTotalTokens(prev => {
          const updated = prev + tokens;
          totalTokensRef.current = updated; // Update ref
          return updated;
      });
  };

  // Sync AI Monitor data whenever it changes to persist across navigation
  // REMOVED to prevent infinite loop. Syncing is now handled manually after AI responses.


  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const AIMonitor = () => {
    // Determine effective proxy and model
    let activeProxy = settings?.proxies?.find(p => p.id === settings.activeProxyId);
    if (!activeProxy && (settings?.proxyEnabled || settings?.proxyUrl)) {
        activeProxy = {
            id: 'legacy',
            name: settings?.proxyName || 'Legacy Proxy',
            url: settings?.proxyUrl || '',
            key: settings?.proxyKey || '',
            model: settings?.proxyModel || '',
            models: settings?.proxyModels || [],
            isActive: true,
            type: (settings?.proxyUrl?.includes('moonshot') || settings?.proxyUrl?.includes('kimi')) ? 'openai' : (settings?.proxyEnabled ? 'openai' : 'google')
        } as any;
    }

    const isProxy = !!activeProxy?.url && !!activeProxy?.key;
    const activeModel = (activeProxy && activeProxy.model) ? activeProxy.model : settings?.aiModel;
    
    return (
        <div className="p-3 bg-stone-300 dark:bg-slate-900/80 rounded-lg border border-stone-400 dark:border-slate-700 space-y-2 font-mono text-[10px] mt-2">
            <div className="flex justify-between items-center border-b border-stone-400 dark:border-slate-800 pb-1.5">
                <span className="text-stone-500 dark:text-slate-500 uppercase font-bold">AI Monitor</span>
                <div className="flex items-center gap-2">
                    {isLoading && <div className="w-1.5 h-1.5 rounded-full bg-mystic-accent animate-pulse" />}
                    <span className={isLoading ? "text-mystic-accent" : "text-stone-400 dark:text-slate-600"}>
                        {isLoading ? "PROCESSING" : "IDLE"}
                    </span>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex flex-col">
                    <span className="text-stone-500 dark:text-slate-500 uppercase">Connection</span>
                    <span className={isProxy ? "text-sky-500" : "text-emerald-500"}>
                        {isProxy ? `REVERSE PROXY (${activeProxy?.name || 'Unknown'})` : "DIRECT API"}
                    </span>
                </div>

                <div className="flex flex-col">
                    <span className="text-stone-500 dark:text-slate-500 uppercase">Active Model</span>
                    <span className="text-stone-700 dark:text-slate-300 truncate" title={activeModel}>
                        {activeModel}
                    </span>
                </div>

                <div className="flex flex-col">
                    <span className="text-stone-500 dark:text-slate-500 uppercase">Timer</span>
                    <span className="text-amber-500 font-bold">
                        {formatTime(isLoading ? currentProcessingTime : lastTurnTotalTime)}
                    </span>
                </div>

                <div className="flex flex-col">
                    <div className="flex justify-between items-center cursor-pointer hover:text-mystic-accent transition-colors" onClick={() => setShowTokenDetails(!showTokenDetails)}>
                        <span className="text-stone-500 dark:text-slate-500 uppercase">Tokens (Last 5)</span>
                        <span className="text-[8px] opacity-50">{showTokenDetails ? "Ẩn" : "Hiện"} chi tiết</span>
                    </div>
                    <div className="flex gap-1 items-end h-4 mt-1">
                        {tokenHistory.length > 0 ? tokenHistory.map((entry, i) => (
                            <div 
                                key={i} 
                                className="bg-mystic-accent/30 border-t border-mystic-accent w-2" 
                                style={{ height: `${Math.min(100, (entry.tokens / 4000) * 100)}%` }}
                                title={`${entry.tokens} tokens, ${entry.words} words`}
                            />
                        )) : <span className="text-stone-400">No data</span>}
                    </div>
                    
                    {showTokenDetails && tokenHistory.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-stone-400/30 dark:border-slate-800/50 pt-1">
                            {tokenHistory.map((entry, i) => (
                                <div key={i} className="flex justify-between text-[9px] text-stone-600 dark:text-slate-400">
                                    <span>#{tokenHistory.length - i}</span>
                                    <span>{formatNumber(entry.tokens)} tkn</span>
                                    <span>{formatNumber(entry.words)} chữ</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col border-t border-stone-400 dark:border-slate-800 pt-1">
                    <div className="flex justify-between items-center cursor-pointer hover:text-mystic-accent transition-colors" onClick={() => setShowStatsDetails(!showStatsDetails)}>
                        <span className="text-stone-500 dark:text-slate-500 uppercase">Thống kê</span>
                        <span className="text-[8px] opacity-50">{showStatsDetails ? "Ẩn" : "Hiện"} chi tiết</span>
                    </div>
                    
                    {showStatsDetails && (
                        <div className="flex flex-col gap-0.5 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex justify-between">
                                <span>Gần nhất:</span>
                                <span className="text-stone-700 dark:text-slate-300">{tokenHistory.length > 0 ? formatNumber(tokenHistory[0].tokens) : 0} tkn</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Số chữ:</span>
                                <span className="text-stone-700 dark:text-slate-300">{tokenHistory.length > 0 ? formatNumber(tokenHistory[0].words) : 0} chữ</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tổng cộng:</span>
                                <span className="text-mystic-accent font-bold">{formatNumber(totalTokens)} tkn</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Trung bình:</span>
                                <span className="text-stone-700 dark:text-slate-300">
                                    {tokenHistory.length > 0 
                                        ? formatNumber(Math.round(tokenHistory.reduce((a, b) => a + b.tokens, 0) / tokenHistory.length)) 
                                        : 0} tkn
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  };
  // Refs for auto-scrolling
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // --- Handlers (Defined as functions to avoid ReferenceError) ---

  // --- Auto-Scroll & Pagination Logic ---
  useEffect(() => {
    const totalPages = history.length <= 11 ? 1 : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
    // Auto switch to last page when new message arrives
    if (history.length > 0) {
        setCurrentPage(totalPages);
    }
  }, [history.length]);

  // Scroll handler to detect if user is at the bottom
  const handleScroll = () => {
    if (scrollViewportRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
        // Check if user is near bottom (e.g. 50px tolerance)
        const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
        shouldAutoScrollRef.current = isAtBottom;
    }
  };

  useEffect(() => {
    if (pendingScrollTurnRef.current !== null) {
      const turnNumber = pendingScrollTurnRef.current;
      // Đợi một chút để DOM cập nhật sau khi chuyển trang
      const timer = setTimeout(() => {
        const element = document.getElementById(`turn-${turnNumber}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          pendingScrollTurnRef.current = null;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentPage, displayedMessages]);

  useEffect(() => {
      if (shouldAutoScrollRef.current) {
          // Khi AI vừa kết thúc lượt, ưu tiên cuộn đến đầu dòng "Lượt" mới nhất
          if (!isLoading && history.length > 0) {
              const lastMsg = history[history.length - 1];
              if (lastMsg.role === 'model' && lastMsg.turnNumber !== undefined) {
                  // Đợi DOM render xong ID
                  const scrollTimeout = setTimeout(() => {
                      const element = document.getElementById(`turn-${lastMsg.turnNumber}`);
                      if (element) {
                          element.scrollIntoView({ behavior: 'smooth' });
                          setLastNavigatedTurn(lastMsg.turnNumber);
                      } else if (chatEndRef.current) {
                          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
                      }
                  }, 150);
                  return () => clearTimeout(scrollTimeout);
              }
          }

          if (chatEndRef.current) {
              chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
      }
  }, [history, isLoading]);
  
  // Force scroll when page changes (navigating history)
  useEffect(() => {
      if (chatEndRef.current && pendingScrollTurnRef.current === null) {
          chatEndRef.current.scrollIntoView({ behavior: 'auto' });
          shouldAutoScrollRef.current = true; 
      }
  }, [currentPage]);


  // --- Handlers ---
  const triggerInitialSave = useCallback(async (world: WorldData, time: GameTime) => {
      if (!isReadyRef.current) return;
      try {
          // console.log("GameplayScreen: Triggering Initial Save (Bản lưu lượt 0)...");
          const worldData: WorldData = {
              ...world,
              lsrData: lsrRuntimeDataRef.current,
              config: {
                  ...world.config,
                  rules: dynamicRulesRef.current,
                  tawaPreset: tawaPresetConfigRef.current,
                  regexScripts: combinedRegexScriptsRef.current
              },
              savedState: {
                  history: [],
                  turnCount: 0,
                  gameTime: time,
                  aiMonitor: {
                      tokenHistory: tokenHistoryRef.current,
                      totalTokens: totalTokensRef.current,
                      lastTurnTotalTime: lastTurnTotalTimeRef.current
                  }
              }
          };
          const worldName = world.world.worldName || 'Unknown_World';
          const slotId = `initial-${worldName.replace(/\s+/g, '_')}-start`;

          await dbService.saveAutosave({
              id: slotId,
              name: `${worldName} - Bản lưu lượt 0`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              data: worldData
          });
      } catch (err) {
          console.error("Initial save failed", err);
      }
  }, []);

  const triggerAutosave = useCallback(async (currentHistory: ChatMessage[], currentTurn: number, currentTime: GameTime, currentLsrData?: Record<string, unknown[]>) => {
      if (!activeWorldRef.current || !isReadyRef.current) return;
      try {
          // console.log(`GameplayScreen: Triggering Autosave for Turn ${currentTurn}...`);
          const worldData: WorldData = {
              ...activeWorldRef.current,
              lsrData: currentLsrData || lsrRuntimeDataRef.current, // Use provided data or ref
              config: {
                  ...activeWorldRef.current.config,
                  rules: dynamicRulesRef.current,
                  tawaPreset: tawaPresetConfigRef.current,
                  regexScripts: combinedRegexScriptsRef.current
              },
              savedState: {
                  history: currentHistory,
                  turnCount: currentTurn,
                  gameTime: currentTime,
                  aiMonitor: {
                      tokenHistory: tokenHistoryRef.current,
                      totalTokens: totalTokensRef.current,
                      lastTurnTotalTime: lastTurnTotalTimeRef.current
                  }
              }
          };
          
          const worldName = activeWorldRef.current.world.worldName || 'Unknown_World';
          const slotId = `autosave-${worldName.replace(/\s+/g, '_')}-${currentTurn}`;

          await dbService.saveAutosave({
              id: slotId,
              name: `${worldName} - Lượt ${currentTurn} (Tự động)`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              data: worldData
          });
      } catch (err) {
          console.error("Autosave failed", err);
      }
  }, []);

  const handleSend = async (textToSend: string) => {
    if (!textToSend || isLoading || !activeWorld || !settings) return;

    // Apply Format User Input regex (Placement 1) - Destructive only
    let finalUserText = textToSend;
    const isDebug = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
    const currentPlayerName = activeWorld.player?.name || 'User';
    const currentCharName = activeWorld.entities?.[0]?.name || 'Character';

    if (combinedRegexScripts) {
         finalUserText = getRegexedString(finalUserText, 1, combinedRegexScripts, {
             userName: currentPlayerName,
             charName: currentCharName,
             depth: 0,
             isDebug,
             isPrompt: false,
             isMarkdown: false 
         });
    }

    setLastAction(textToSend); // Giữ text nguyên bản cho input box history? Tốt hơn là giữ raw
    setLastNavigatedTurn(null);

    // Thời gian sẽ được AI quyết định trong phản hồi tiếp theo
    const userMsg: ChatMessage = { 
        role: 'user', 
        text: finalUserText, 
        timestamp: Date.now(),
        gameTime: gameTime, // Giữ nguyên thời gian hiện tại cho tin nhắn người dùng
        turnNumber: turnCount + 1 // User action starts the new turn
    };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    syncWorldState(newHistory, turnCount, gameTime);
    
    // Force auto-scroll on send
    shouldAutoScrollRef.current = true;
    
    if (settings.streamResponse) {
        await runStreamGeneration(userMsg.text, newHistory, settings, undefined, activeWorld, gameTime);
    } else {
        setIsLoading(true);
        const effectiveWorldData: WorldData = {
            ...activeWorld,
            lsrData: lsrRuntimeDataRef.current, // Sử dụng dữ liệu LSR hiện tại từ Ref để tránh stale
            gameTime: gameTime,
            savedState: {
                history: newHistory,
                turnCount: turnCount,
                gameTime: gameTime
            },
            config: {
                ...activeWorld.config,
                rules: dynamicRules,
                tawaPreset: tawaPresetConfig,
                regexScripts: combinedRegexScripts
            }
        };

        const result = await gameplayAiService.generateStoryTurn(
            userMsg.text,
            newHistory, 
            effectiveWorldData,
            settings,
            tawaPresetConfig,
            gameTime
        );
        if (result.usage?.totalTokenCount) {
            updateTokenHistory(result.usage.totalTokenCount, result.text);
        } else if (result.text) {
            // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
            const estimatedTokens = Math.ceil(result.text.length / 4);
            updateTokenHistory(estimatedTokens, result.text);
        }
        processAIResponse(result.text, false, gameTime);
        
        // Trigger Memory Archiving check
    }
  };

  // Fetch saves when history modal opens
  useEffect(() => {
    if (showHistoryModal) {
      const fetchSaves = async () => {
        try {
          const saves = await dbService.getAllSaves();
          const autosaves = saves.filter(s => s.id.startsWith('autosave-')).sort((a, b) => b.updatedAt - a.updatedAt);
          const manuals = saves.filter(s => s.id.startsWith('manual-')).sort((a, b) => b.updatedAt - a.updatedAt);
          const initials = saves.filter(s => s.id.startsWith('initial-')).sort((a, b) => b.updatedAt - a.updatedAt);
          setAutosaveList(autosaves);
          setManualSaveList(manuals);
          setInitialSaveList(initials);
        } catch (err) {
          console.error("Failed to fetch saves", err);
        }
      };
      fetchSaves();
    }
  }, [showHistoryModal]);

  const handleLoadSave = (save: SaveFile) => {
    if (!save.data) return;
    const worldData = save.data as WorldData;
    if (!worldData.savedState) {
        return;
    }
    
    // Restore state
    const time = worldData.savedState.gameTime || INITIAL_GAME_TIME;
    setGameTime(time);
    gameTimeRef.current = time;
    
    setTurnCount(worldData.savedState.turnCount);
    turnCountRef.current = worldData.savedState.turnCount;
    
    setHistory(worldData.savedState.history);
    historyRef.current = worldData.savedState.history;
    
    setLsrRuntimeData(worldData.lsrData || {});
    lsrRuntimeDataRef.current = worldData.lsrData || {};
    
    // Mark as ready
    isReadyRef.current = true;
    
    // Update activeWorld in parent
    if (onUpdateWorld) {
        onUpdateWorld(worldData);
    }
    
    setShowHistoryModal(false);
  };

  const handleDeleteSave = async (id: string) => {
      try {
          await dbService.deleteSave(id);
          // Refresh lists
          const saves = await dbService.getAllSaves();
          setAutosaveList(saves.filter(s => s.id.startsWith('autosave-')).sort((a, b) => b.updatedAt - a.updatedAt));
          setManualSaveList(saves.filter(s => s.id.startsWith('manual-')).sort((a, b) => b.updatedAt - a.updatedAt));
          setInitialSaveList(saves.filter(s => s.id.startsWith('initial-')).sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (err) {
          console.error("Failed to delete save", err);
      }
  };

    const handleRegenerate = async (msgIndex: number) => {
        if (isLoading || !activeWorld || !settings) return;
        
        // Determine context: history up to msgIndex - 1 (the user message triggering this)
        const prevHistory = history.slice(0, msgIndex);
        const userTriggerMsg = history[msgIndex - 1];
        
        // CRITICAL FIX: Use the gameTime from the user message as the starting point for regeneration
        // This prevents time from "stacking" or advancing incorrectly when retrying.
        const startTime = userTriggerMsg?.gameTime || gameTime;

        // Handle Turn 0 correctly: if msgIndex is 0, it's the opening narrative
        const userInput = msgIndex === 0 ? "Hãy bắt đầu câu chuyện." : (userTriggerMsg?.text || "Continue");

        // Force auto-scroll on regenerate
        shouldAutoScrollRef.current = true;

        if (settings.streamResponse) {
            // Pass the correct startTime to runStreamGeneration
            await runStreamGeneration(userInput, history, settings, msgIndex, activeWorld, startTime);
        } else {
            setIsLoading(true);
            const effectiveWorldData: WorldData = {
                ...activeWorld,
                lsrData: lsrRuntimeDataRef.current,
                config: {
                    ...activeWorld.config,
                    rules: dynamicRules,
                    tawaPreset: tawaPresetConfig,
                    regexScripts: combinedRegexScripts
                }
            };

            const result = await gameplayAiService.generateStoryTurn(
                userInput,
                prevHistory,
                effectiveWorldData,
                settings,
                tawaPresetConfig,
                startTime // Use startTime here too
            );
            
            if (result.usage?.totalTokenCount) {
                updateTokenHistory(result.usage.totalTokenCount, result.text);
            } else if (result.text) {
                // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
                const estimatedTokens = Math.ceil(result.text.length / 4);
                updateTokenHistory(estimatedTokens, result.text);
            }
            
            // Apply Format AI Output regex (Placement 2) - Permanently (Destructive only)
            let finalRegenText = result.text;
            const isDebugRegen = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
            const playerNameToUseRegen = activeWorld.player?.name || 'User';
            if (combinedRegexScripts) {
                finalRegenText = getRegexedString(finalRegenText, 2, combinedRegexScripts, {
                    userName: playerNameToUseRegen,
                    charName: 'Character',
                    depth: 0,
                    isDebug: isDebugRegen,
                    isPrompt: false,
                    isMarkdown: false 
                });
            }
            
            // updateMessageSwipes needs to handle time sync correctly
            updateMessageSwipes(msgIndex, finalRegenText, startTime);
            setIsLoading(false);
        }
    };

  const runStreamGeneration = useCallback(async (
      userInput: string, 
      currentHistory: ChatMessage[], 
      currentSettings: AppSettings,
      regenerateIndex?: number,
      world?: WorldData,
      time?: GameTime
  ) => {
      setIsLoading(true);
      const effectiveWorldData: WorldData = {
          ...(world || activeWorldRef.current!),
          lsrData: lsrRuntimeDataRef.current, // Sử dụng dữ liệu LSR hiện tại từ state
          gameTime: time || gameTimeRef.current,
          savedState: {
              history: currentHistory,
              turnCount: turnCountRef.current,
              gameTime: time || gameTimeRef.current
          },
          config: {
              ...(world || activeWorldRef.current!).config,
              rules: dynamicRulesRef.current,
              tawaPreset: tawaPresetConfigRef.current,
              regexScripts: combinedRegexScriptsRef.current
          }
      };

        const workingHistory = regenerateIndex !== undefined 
            ? [...currentHistory.slice(0, regenerateIndex + 1)] 
            : [...currentHistory];
        let targetIndex = regenerateIndex;

        let presetName = 'Mặc định';
        try {
            const activeId = localStorage.getItem('tawa_active_preset_id_v2') || 'default';
            const presetsRaw = localStorage.getItem('tawa_presets_list_v2');
            if (presetsRaw) {
                const presets = JSON.parse(presetsRaw);
                const active = presets.find((p: any) => p.id === activeId);
                if (active) presetName = active.name;
            }
        } catch(e) {
          // Ignored empty catch block
        }
        const defaultMetadata = {
            presetUsed: presetName,
            cotUsed: tawaPresetConfigRef.current?.cot?.label || 'Không dùng',
            worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`
        };

        // If NOT regenerating, create a placeholder message first
        if (targetIndex === undefined) {
            const placeholderMsg: ChatMessage = {
                role: 'model',
                text: "",
                timestamp: Date.now(),
                gameTime: time || gameTimeRef.current,
                swipes: [""],
                swipeIndex: 0,
                choices: [],
                turnNumber: currentHistory.length === 0 ? 0 : turnCountRef.current + 1,
                userAction: currentHistory.length === 0 ? undefined : userInput,
                metadata: defaultMetadata
            };
            workingHistory.push(placeholderMsg);
            targetIndex = workingHistory.length - 1;
            
            // Update state with placeholder
            setHistory([...workingHistory]);
        } else {
            // If regenerating, prepare the new swipe slot
            // workingHistory[targetIndex] should now exist because we passed the full history
            const msg = { ...(workingHistory[targetIndex] || {}) } as ChatMessage;
            
            // Ensure role and basic properties are present
            if (!msg.role) msg.role = 'model';
            msg.metadata = defaultMetadata;
            
            const newSwipes = [...(msg.swipes || [msg.text || ""]), ""]; // Add empty slot
            msg.swipes = newSwipes;
            msg.swipeIndex = newSwipes.length - 1;
            msg.text = ""; // Clear current text for streaming visual
            
            // Ensure turn info is present even for legacy messages being regenerated
            if (msg.turnNumber === undefined) {
                msg.turnNumber = targetIndex === 0 ? 0 : turnCountRef.current;
            }
            if (msg.userAction === undefined && targetIndex > 0) {
                msg.userAction = userInput;
            }
            
            workingHistory[targetIndex] = msg;
            // Update state for visual feedback
            setHistory([...workingHistory]);
        }

        // Small delay to ensure state update (optional but safe)
        await new Promise(r => setTimeout(r, 0));

        const stream = gameplayAiService.generateStoryTurnStream(
            userInput,
            regenerateIndex !== undefined ? currentHistory.slice(0, regenerateIndex) : currentHistory,
            effectiveWorldData,
            currentSettings,
            tawaPresetConfigRef.current,
            time || gameTimeRef.current
        );

      let accumulatedText = "";
      let lastTokenCount = 0;
      let lastUIUpdateTime = 0;
      const UI_UPDATE_INTERVAL = 150; // Tần suất cập nhật UI (ms) - Giúp ổn định khi chuyển tab

      for await (const chunk of stream) {
          if (typeof chunk === 'string') {
              accumulatedText += chunk;
          } else {
              if (chunk.text) accumulatedText += chunk.text;
              if (chunk.usageMetadata?.totalTokenCount) {
                  lastTokenCount = chunk.usageMetadata.totalTokenCount;
              }
          }
          
          const now = Date.now();
          // Chỉ cập nhật UI nếu đã qua khoảng thời gian chỉ định hoặc là chunk cuối (thông qua việc kết thúc loop)
          if (now - lastUIUpdateTime > UI_UPDATE_INTERVAL) {
              if (targetIndex !== undefined && workingHistory[targetIndex]) {
                  const msg = { ...workingHistory[targetIndex] };
                  
                  const swipes = [...(msg.swipes || [""])];
                  const currentSwipeIdx = msg.swipeIndex || 0;
                  
                  // FILTER: Remove thinking blocks from UI display during streaming
                  let displayContent = accumulatedText;
                  const thinkingPatterns = [
                      /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*?<\/(?:thinking|think|thinhking|thought|thoughts)>/gi,
                      /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*$/gi, // Handle unclosed thinking tag while streaming
                  ];
                  thinkingPatterns.forEach(pattern => {
                      displayContent = displayContent.replace(pattern, "");
                  });
                  
                  swipes[currentSwipeIdx] = displayContent;
                  
                  const branchesContent = extractTagContent(accumulatedText, 'branches') || 
                                          extractTagContent(accumulatedText, 'choices') || 
                                          extractTagContent(accumulatedText, 'actions');
                  const choicesList = parseChoices(branchesContent);

                  msg.swipes = swipes;
                  msg.text = accumulatedText;
                  msg.choices = choicesList;
                  
                  workingHistory[targetIndex] = msg;
                  setHistory([...workingHistory]);
                  lastUIUpdateTime = now;
              }
          }
      }

      // ĐẢM BẢO CẬP NHẬT LẦN CUỐI CÙNG KHI KẾT THÚC LUỒNG
      if (targetIndex !== undefined && workingHistory[targetIndex]) {
          const msg = { ...workingHistory[targetIndex] };
          const swipes = [...(msg.swipes || [""])];
          const currentSwipeIdx = msg.swipeIndex || 0;
          
          // FILTER: Remove thinking blocks from UI display
          let displayContent = accumulatedText;
          const thinkingPatterns = [
              /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*?<\/(?:thinking|think|thinhking|thought|thoughts)>/gi,
              /<(?:thinking|think|thinhking|thought|thoughts)>[\s\S]*$/gi,
          ];
          thinkingPatterns.forEach(pattern => {
              displayContent = displayContent.replace(pattern, "");
          });
          
          swipes[currentSwipeIdx] = displayContent;
          
          const branchesContent = extractTagContent(accumulatedText, 'branches') || 
                                  extractTagContent(accumulatedText, 'choices') || 
                                  extractTagContent(accumulatedText, 'actions');
          const choicesList = parseChoices(branchesContent);

          msg.swipes = swipes;
          msg.text = accumulatedText;
          msg.choices = choicesList;
          
          workingHistory[targetIndex] = msg;
          setHistory([...workingHistory]);
      }

      // Update token history once after stream completes
      if (lastTokenCount > 0) {
          updateTokenHistory(lastTokenCount, accumulatedText);
      } else if (accumulatedText.length > 0) {
          // Fallback: Ước tính token nếu không có dữ liệu (thường do dùng Proxy)
          const estimatedTokens = Math.ceil(accumulatedText.length / 4);
          updateTokenHistory(estimatedTokens, accumulatedText);
      }

      // Finalize parsing (Branches/Choices and Time)
      let finalTime = time || gameTimeRef.current;

      // Trích xuất thời gian tiêu tốn hoặc thiết lập lại thời gian từ AI
      const setTimeStr = extractTagContent(accumulatedText, 'set_time');
      if (setTimeStr) {
          const parts = setTimeStr.split('|').map(p => parseInt(p.trim(), 10));
          if (parts.length === 5 && !parts.some(isNaN)) {
              finalTime = {
                  year: parts[0],
                  month: parts[1],
                  day: parts[2],
                  hour: parts[3],
                  minute: parts[4]
              };
          }
      } else {
          const timeCostStr = extractTagContent(accumulatedText, 'time_cost');
          let timeCost = parseInt(timeCostStr || '1', 10); // Mặc định 1 phút nếu không có thẻ
          if (isNaN(timeCost) || timeCost < 1) timeCost = 1; // Đảm bảo tối thiểu 1 phút
          finalTime = advanceTime(finalTime, timeCost);
      }

      setGameTime(finalTime);
      
      // Extract incrementalSummary
      const incrementalSummary = extractTagContent(accumulatedText, 'incrementalSummary');
      
      // Task: Parse LSR Data for immediate sync after stream
      const tableStored = extractTagContent(accumulatedText, 'table_stored');
      let nextLsrData = lsrRuntimeDataRef.current;
      if (tableStored) {
          // console.log("GameplayScreen: Detected <table_stored> tag. Parsing...");
          const parsedData = LsrParser.parseLsrString(tableStored);
          // Guard: Only overwrite if we actually found some data in the tag
          if (Object.keys(parsedData).length > 0) {
              nextLsrData = parsedData;
              // console.log("GameplayScreen: Parsed LSR Data from <table_stored>:", nextLsrData);
              setLsrRuntimeData(nextLsrData);
          } else {
              console.warn("GameplayScreen: <table_stored> was present but empty or unparseable. Keeping current data.");
          }
      } else {
          const tableEdit = extractTagContent(accumulatedText, 'tableEdit');
          if (tableEdit) {
              // console.log("GameplayScreen: Detected <tableEdit> tag. Merging edits...");
              const parsedEdits = LsrParser.parseLsrString(tableEdit);
              if (Object.keys(parsedEdits).length > 0) {
                  // console.log("GameplayScreen: Parsed LSR Edits:", parsedEdits);
                  nextLsrData = LsrParser.mergeLsrData(lsrRuntimeDataRef.current, parsedEdits);
                  setLsrRuntimeData(nextLsrData);
              }
          }
      }
      
      // CRITICAL: Calculate finalHistory EXPLICITLY from workingHistory
      if (targetIndex !== undefined && workingHistory[targetIndex]) {
          const msg = { ...workingHistory[targetIndex] };
          
          const branchesContent = extractTagContent(accumulatedText, 'branches') || 
                                  extractTagContent(accumulatedText, 'choices') || 
                                  extractTagContent(accumulatedText, 'actions');
          const choicesList = parseChoices(branchesContent);
          
          const finalAccumulatedText = accumulatedText;
          
          msg.choices = choicesList;
          msg.gameTime = finalTime;
          msg.incrementalSummary = incrementalSummary;
          msg.text = finalAccumulatedText; // Ensure text is fully captured and formatted
          
          let presetName = 'Mặc định';
          try {
              const activeId = localStorage.getItem('tawa_active_preset_id_v2') || 'default';
              const presetsRaw = localStorage.getItem('tawa_presets_list_v2');
              if (presetsRaw) {
                  const presets = JSON.parse(presetsRaw);
                  const active = presets.find((p: any) => p.id === activeId);
                  if (active) presetName = active.name;
              }
          } catch(e: any) {
              console.warn("GameplayScreen: Failed to parse presets:", e);
          }
          msg.metadata = {
              presetUsed: presetName,
              cotUsed: tawaPresetConfigRef.current?.cot?.label || 'Không dùng',
              worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`
          };

          // Also update the current swipe if regenerating
          if (msg.swipes && msg.swipeIndex !== undefined) {
               msg.swipes[msg.swipeIndex] = finalAccumulatedText;
          }
          
          workingHistory[targetIndex] = msg;
      }
      
      const finalHistory = [...workingHistory];
      setHistory(finalHistory);

      if (targetIndex !== undefined && regenerateIndex === undefined) {
          // Only increment turnCount if it's NOT the initial message (Turn 0)
          const isInitial = currentHistory.length === 0;
          const newTurnCount = isInitial ? turnCountRef.current : turnCountRef.current + 1;
          
          if (!isInitial) {
              setTurnCount(newTurnCount);
          }
          
          // console.log(`GameplayScreen: Finalizing Turn ${newTurnCount}. History length: ${finalHistory.length}`);
          
          // Trigger Autosave after stream completes
          triggerAutosave(finalHistory, newTurnCount, finalTime, nextLsrData);
          // Sync state after stream completes
          syncWorldState(finalHistory, newTurnCount, finalTime, nextLsrData, incrementalSummary);
      } else {
          // If regenerating or no target, just sync current state
          syncWorldState(finalHistory, turnCountRef.current, finalTime, nextLsrData, incrementalSummary);
      }
      setIsLoading(false);
      
      // Trigger Memory Archiving check after stream
  }, [syncWorldState, triggerAutosave]);

  const processAIResponse = useCallback((responseText: string, initial = false, time?: GameTime) => {
    const branchesContent = extractTagContent(responseText, 'branches') || 
                            extractTagContent(responseText, 'choices') || 
                            extractTagContent(responseText, 'actions');
    const choicesList = parseChoices(branchesContent);

    // Trích xuất thời gian tiêu tốn hoặc thiết lập lại thời gian từ AI
    const setTimeStr = extractTagContent(responseText, 'set_time');
    let updatedTime = time || gameTimeRef.current;

    if (setTimeStr) {
        const parts = setTimeStr.split('|').map(p => parseInt(p.trim(), 10));
        if (parts.length === 5 && !parts.some(isNaN)) {
            updatedTime = {
                year: parts[0],
                month: parts[1],
                day: parts[2],
                hour: parts[3],
                minute: parts[4]
            };
        }
    } else {
        const timeCostStr = extractTagContent(responseText, 'time_cost');
        let timeCost = parseInt(timeCostStr || (initial ? '0' : '1'), 10);
        if (!initial && (isNaN(timeCost) || timeCost < 1)) timeCost = 1; // Đảm bảo tối thiểu 1 phút cho hành động (trừ mở đầu)
        
        if (timeCost > 0 || initial) {
            updatedTime = advanceTime(updatedTime, timeCost);
        }
    }
    
    setGameTime(updatedTime);

    // Extract incrementalSummary
    const incrementalSummary = extractTagContent(responseText, 'incrementalSummary');
    
    let finalResponseText = responseText;
    const isDebugAI = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
    const playerNameToUse = activeWorldRef.current?.player?.name || 'User';
    if (combinedRegexScriptsRef.current) {
        finalResponseText = getRegexedString(finalResponseText, 2, combinedRegexScriptsRef.current, {
            userName: playerNameToUse,
            charName: 'Character',
            depth: 0,
            isDebug: isDebugAI,
            isPrompt: false,
            isMarkdown: false 
        });
    }

    let presetName = 'Mặc định';
    try {
        const activeId = localStorage.getItem('tawa_active_preset_id_v2') || 'default';
        const presetsRaw = localStorage.getItem('tawa_presets_list_v2');
        if (presetsRaw) {
            const presets = JSON.parse(presetsRaw);
            const active = presets.find((p: any) => p.id === activeId);
            if (active) presetName = active.name;
        }
    } catch(e: any) {
        console.warn("GameplayScreen: Failed to parse presets:", e);
    }

    const metadata = {
        presetUsed: presetName,
        cotUsed: tawaPresetConfigRef.current?.cot?.label || 'Không dùng',
        worldInfoConfig: `${activeWorldRef.current?.entities?.length || 0} Entities`
    };

    const modelMsg: ChatMessage = { 
        role: 'model', 
        text: finalResponseText, 
        timestamp: Date.now(),
        gameTime: updatedTime,
        choices: choicesList,
        swipes: [finalResponseText],
        swipeIndex: 0,
        turnNumber: initial ? 0 : turnCountRef.current + 1,
        userAction: initial ? undefined : lastActionRef.current,
        incrementalSummary: incrementalSummary,
        metadata: metadata
    };
    
    const newHistory = [...historyRef.current, modelMsg];
    // Task: Parse LSR Data for immediate sync
    const tableStored = extractTagContent(responseText, 'table_stored');
    let nextLsrData = lsrRuntimeDataRef.current;
    if (tableStored) {
        // console.log("GameplayScreen (processAIResponse): Detected <table_stored>. Parsing...");
        const parsedData = LsrParser.parseLsrString(tableStored);
        if (Object.keys(parsedData).length > 0) {
            nextLsrData = parsedData;
            // console.log("GameplayScreen (processAIResponse): Parsed LSR Data:", nextLsrData);
            setLsrRuntimeData(nextLsrData);
        } else {
            console.warn("GameplayScreen (processAIResponse): <table_stored> was empty or unparseable.");
        }
    } else {
        const tableEdit = extractTagContent(responseText, 'tableEdit');
        if (tableEdit) {
            // console.log("GameplayScreen (processAIResponse): Detected <tableEdit>. Merging edits...");
            const parsedEdits = LsrParser.parseLsrString(tableEdit);
            if (Object.keys(parsedEdits).length > 0) {
                // console.log("GameplayScreen (processAIResponse): Parsed LSR Edits:", parsedEdits);
                nextLsrData = LsrParser.mergeLsrData(lsrRuntimeDataRef.current, parsedEdits);
                setLsrRuntimeData(nextLsrData);
            }
        }
    }

    setHistory(newHistory);
    
    if (!initial) {
        const newTurnCount = turnCountRef.current + 1;
        setTurnCount(newTurnCount);
        // Sync & Autosave
        syncWorldState(newHistory, newTurnCount, updatedTime, nextLsrData, incrementalSummary);
        triggerAutosave(newHistory, newTurnCount, updatedTime, nextLsrData);
    } else {
        // Initial message (Opening)
        syncWorldState(newHistory, turnCountRef.current, updatedTime, nextLsrData, incrementalSummary);
        triggerAutosave(newHistory, turnCountRef.current, updatedTime, nextLsrData);
    }
    setIsLoading(false);
  }, [syncWorldState, triggerAutosave]);

  const handleSendInitial = useCallback(async (currentSettings: AppSettings, world: WorldData, time: GameTime) => {
    setIsLoading(true);
    // Enable auto scroll for initial load
    shouldAutoScrollRef.current = true;
    
    // Nếu có firstMessage từ thẻ SillyTavern, sử dụng trực tiếp làm initial message
    if (world.world.firstMessage && world.world.firstMessage.trim().length > 0) {
        const rawFirstMsg = world.world.firstMessage.trim();
        const testProcessed = rawFirstMsg;

        // Tawa Smart Feature: Detect "[Mở đầu]" when regex fails/disabled
        const cleanMsg = testProcessed.replace(/[\][\s]/g, '').toLowerCase();
        if (cleanMsg === 'mởđầu') {
             const tawaPrompt = "Bắt đầu câu chuyện. Thẻ nhân vật có lời chào gốc là [Mở đầu]. Hãy đóng vai làm hệ thống Tawa, tạo ra một kịch bản mở đầu hấp dẫn. Vui lòng tự tạo ra một hệ thống bảng thông tin nhân vật (character table) phù hợp với bối cảnh thế giới và thông tin thẻ, sau đó mở đầu bằng một hành động hoặc lời thoại sinh động.";
             if (currentSettings.streamResponse) {
                 await runStreamGeneration(tawaPrompt, [], currentSettings, undefined, world, time);
             } else {
                 const opening = await gameplayAiService.generateStoryTurn(
                      tawaPrompt, 
                      [], 
                      world, 
                      currentSettings,
                      tawaPresetConfig,
                      time
                  );
                  if (opening.usage?.totalTokenCount) {
                      updateTokenHistory(opening.usage.totalTokenCount, opening.text);
                  } else if (opening.text) {
                      const estimatedTokens = Math.ceil(opening.text.length / 4);
                      updateTokenHistory(estimatedTokens, opening.text);
                  }
                  processAIResponse(opening.text, true, time);
             }
             return;
        }

        processAIResponse(world.world.firstMessage, true, time);
        return;
    }

    // CẢI TIẾN: Tạo prompt mở đầu chi tiết hơn dựa trên kịch bản khởi đầu (nếu có)
    const startingScenario = world.world.startingScenario || "";
    const initialPrompt = startingScenario 
        ? `Hãy bắt đầu câu chuyện dựa trên kịch bản khởi đầu này: "${startingScenario}". Hãy viết một mở đầu cực kỳ ấn tượng, sống động và lôi cuốn.`
        : "Hãy bắt đầu câu chuyện một cách tự nhiên và lôi cuốn nhất dựa trên bối cảnh thế giới và nhân vật đã thiết lập. Hãy thiết lập bối cảnh hiện tại một cách sống động.";

    if (currentSettings.streamResponse) {
        await runStreamGeneration(initialPrompt, [], currentSettings, undefined, world, time);
    } else {
        const opening = await gameplayAiService.generateStoryTurn(
             initialPrompt, 
             [], 
             world, 
             currentSettings,
             tawaPresetConfig,
             time
         );
         if (opening.usage?.totalTokenCount) {
             updateTokenHistory(opening.usage.totalTokenCount, opening.text);
         } else if (opening.text) {
             const estimatedTokens = Math.ceil(opening.text.length / 4);
             updateTokenHistory(estimatedTokens, opening.text);
         }
         processAIResponse(opening.text, true, time);
    }
 }, [runStreamGeneration, processAIResponse, tawaPresetConfig]);

  // --- Initial Load ---
  useEffect(() => {
    // If world object reference changes, allow re-initialization
    // Use a unique property or the object itself to detect a "new session"
    if (activeWorld && activeWorld !== lastWorldRef.current) {
        // console.log("GameplayScreen: New world detected, resetting initialization.");
        initializedRef.current = false;
        lastWorldRef.current = activeWorld;
        initialStartedRef.current = false;
        isReadyRef.current = false; // Reset ready state for new world
    }

    if (initializedRef.current) return;
    initializedRef.current = true; 
    
    const init = async () => {
      // console.log("GameplayScreen: Starting initialization...");
      const s = await dbService.getSettings();
      setSettings(s);

      // Load LSR Definitions
      setLsrTables(LsrParser.parseDefinitions());

      if (activeWorld) {
          // Sync initial rules from world config
          setDynamicRules(activeWorld.config.rules || []);
          
          reloadRegexScripts();
          
          // Sync Tawa Preset from world config
          if (activeWorld.config.tawaPreset) {
              setTawaPresetConfig(activeWorld.config.tawaPreset);
          }

          // Load LSR Data
          if (activeWorld.lsrData) {
              setLsrRuntimeData(activeWorld.lsrData);
          }

          const worldDataWithState = activeWorld as WorldData;
          if (worldDataWithState.savedState && worldDataWithState.savedState.history.length > 0) {
              // console.log("GameplayScreen: Loading saved state, history length:", worldDataWithState.savedState.history.length);
              setHistory(worldDataWithState.savedState.history);
              historyRef.current = worldDataWithState.savedState.history;
              
              setTurnCount(worldDataWithState.savedState.turnCount);
              turnCountRef.current = worldDataWithState.savedState.turnCount;
              
              if (worldDataWithState.savedState.gameTime) {
                  setGameTime(worldDataWithState.savedState.gameTime);
                  gameTimeRef.current = worldDataWithState.savedState.gameTime;
              }
              
              // Restore AI Monitor state
              if (worldDataWithState.savedState.aiMonitor) {
                  setTokenHistory(worldDataWithState.savedState.aiMonitor.tokenHistory);
                  setTotalTokens(worldDataWithState.savedState.aiMonitor.totalTokens);
                  setLastTurnTotalTime(worldDataWithState.savedState.aiMonitor.lastTurnTotalTime);
              } else {
                  setTokenHistory([]);
                  setTotalTokens(0);
                  setLastTurnTotalTime(0);
              }
              
              // Mark as ready AFTER state is set
              isReadyRef.current = true;
              // console.log("GameplayScreen: Initialization complete (Loaded Save).");
          } else {
            // console.log("GameplayScreen: No saved state found, starting new game.");
            // New world or empty history: Reset AI Monitor
            setTokenHistory([]);
            setTotalTokens(0);
            setLastTurnTotalTime(0);

            if (s && !initialStartedRef.current) {
                // Initial Start: Generate opening
                initialStartedRef.current = true;
                const initialTime = worldDataWithState.gameTime || INITIAL_GAME_TIME;
                setGameTime(initialTime);
                
                // Mark as ready BEFORE initial generation so it can sync
                isReadyRef.current = true;
                
                // Trigger Initial Save (Bản lưu lượt 0) BEFORE opening generation
                await triggerInitialSave(worldDataWithState, initialTime);
                
                handleSendInitial(s, worldDataWithState, initialTime);
                // console.log("GameplayScreen: Initialization complete (New Game).");
            }
          }
      }
    };
    init();
  }, [activeWorld, handleSendInitial, triggerInitialSave]);

  const updateMessageSwipes = (index: number, newText: string, overrideTime?: GameTime) => {
       // Task: Parse LSR Data for immediate sync during swipe/regen
       const tableStored = extractTagContent(newText, 'table_stored');
       let nextLsrData = lsrRuntimeDataRef.current;
       if (tableStored) {
           // console.log("GameplayScreen (updateMessageSwipes): Detected <table_stored>. Parsing...");
           nextLsrData = LsrParser.parseLsrString(tableStored);
           // console.log("GameplayScreen (updateMessageSwipes): Parsed LSR Data:", nextLsrData);
           setLsrRuntimeData(nextLsrData);
       } else {
           const tableEdit = extractTagContent(newText, 'tableEdit');
           if (tableEdit) {
               // console.log("GameplayScreen (updateMessageSwipes): Detected <tableEdit>. Parsing edits...");
               const parsedEdits = LsrParser.parseLsrString(tableEdit);
               // console.log("GameplayScreen (updateMessageSwipes): Parsed LSR Edits:", parsedEdits);
               nextLsrData = LsrParser.mergeLsrData(lsrRuntimeDataRef.current, parsedEdits);
               setLsrRuntimeData(nextLsrData);
           }
       }

       setHistory(prev => {
            // Truncate history to the current index to ensure story divergence
            const updated = prev.slice(0, index + 1);
            const msg = { ...(updated[index] || {}) } as ChatMessage;
            
            // Ensure role is present
            if (!msg.role) msg.role = 'model';
            
            const branchesContent = extractTagContent(newText, 'branches') || 
                                    extractTagContent(newText, 'choices') || 
                                    extractTagContent(newText, 'actions');
            const choicesList = parseChoices(branchesContent);

            const currentSwipes = msg.swipes || [msg.text];
            const newSwipes = [...currentSwipes, newText];
            
            msg.swipes = newSwipes;
            msg.swipeIndex = newSwipes.length - 1;
            msg.text = newText;
            msg.choices = choicesList; // Update choices to latest generation

            // Calculate final time for this swipe
            let finalTime = overrideTime || gameTime;
            const setTimeStr = extractTagContent(newText, 'set_time');
            if (setTimeStr) {
                const parts = setTimeStr.split('|').map(p => parseInt(p.trim(), 10));
                if (parts.length === 5 && !parts.some(isNaN)) {
                    finalTime = { year: parts[0], month: parts[1], day: parts[2], hour: parts[3], minute: parts[4] };
                }
            } else {
                const timeCostStr = extractTagContent(newText, 'time_cost');
                let timeCost = parseInt(timeCostStr || '1', 10);
                if (isNaN(timeCost) || timeCost < 1) timeCost = 1;
                finalTime = advanceTime(finalTime, timeCost);
            }
            
            msg.gameTime = finalTime;
            setGameTime(finalTime);
            
            // Extract incrementalSummary
            const incrementalSummary = extractTagContent(newText, 'incrementalSummary');
            msg.incrementalSummary = incrementalSummary;

            // Ensure turn info is present even for legacy messages being regenerated
            if (msg.turnNumber === undefined) {
                msg.turnNumber = index === 0 ? 0 : turnCount;
            }
            if (msg.userAction === undefined && index > 0) {
                msg.userAction = updated[index - 1].text;
            }

            updated[index] = msg;
            
            // Sync state back to parent
            syncWorldState(updated, turnCount, finalTime, nextLsrData, incrementalSummary);
            return updated;
       });
  };

  const handleMessageUpdate = useCallback((index: number, newText: string) => {
    setHistory(prev => {
        const newHistory = [...prev];
        if (newHistory[index]) {
            const msgToEdit = newHistory[index];
            const currentPlayerName = activeWorldRef.current?.player?.name || 'User';
            // Apply only regex scripts that have runOnEdit = true
            let finalText = newText;
            const isDebug = typeof window !== 'undefined' && (window as any).__TAWA_REGEX_DEBUG__ === true;
            let scriptsToRunOnEdit: any[] = [];
            if (combinedRegexScriptsRef.current) {
                scriptsToRunOnEdit = [...combinedRegexScriptsRef.current.filter((s: any) => s.runOnEdit)];
            }
            if (scriptsToRunOnEdit.length > 0) {
                 const messageDepth = newHistory.length > 0 ? (newHistory.length - 1 - index) : -1;
                 const placement = msgToEdit.role === 'user' ? 1 : 2;
                 finalText = getRegexedString(finalText, placement, scriptsToRunOnEdit, {
                     userName: currentPlayerName,
                     charName: 'Character',
                     depth: messageDepth,
                     isDebug,
                     isEdit: true,
                     isPrompt: false,
                     isMarkdown: false
                 });
            }

            // Update raw text
            const msg = { ...newHistory[index] };
            msg.text = finalText;

            // Also update the specific swipe if it exists
            if (msg.swipes && msg.swipeIndex !== undefined) {
                const newSwipes = [...msg.swipes];
                newSwipes[msg.swipeIndex] = finalText;
                msg.swipes = newSwipes;
            }

            if (msg.role === 'model') {
                const branchesContent = extractTagContent(finalText, 'branches') || 
                                        extractTagContent(finalText, 'choices') || 
                                        extractTagContent(finalText, 'actions');
                msg.choices = parseChoices(branchesContent);
            }
            newHistory[index] = msg;
        }
        return newHistory;
    });
  }, []);

  const handleEntityClick = useCallback((id: string) => {
    const entity = activeWorld?.entities.find(e => e.id === id);
    if (entity) setSelectedEntity(entity);
  }, [activeWorld?.entities]);

  // Handle messages from HTML widget iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // In a real app we'd want to check event.origin, but here widgets are dynamically generated
      const data = event.data;
      if (data && typeof data === 'object') {
        const type = data.type;
        const text = data.text;
        
        switch (type) {
          case 'sendReply':
          case 'send_input':
          case 'sendInput':
            if (text && typeof text === 'string' && !isLoading) {
              handleSend(text, false); // false = not an implicit action usually
            }
            break;
          case 'edit_last_message':
          case 'editLastMessage':
             if (text && typeof text === 'string' && history.length > 0) {
                 const lastUserMsgIndex = [...history].reverse().findIndex(m => m.role === 'user');
                 if (lastUserMsgIndex !== -1) {
                     const realIndex = history.length - 1 - lastUserMsgIndex;
                     handleMessageUpdate(realIndex, text);
                 }
             }
             break;
          default:
             break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isLoading, history, handleSend, handleMessageUpdate]);

  const handleSwipe = (msgIndex: number, direction: 'prev' | 'next') => {
      const msg = history[msgIndex];
      if (!msg.swipes || msg.swipes.length === 0) return;
      
      const currentIndex = msg.swipeIndex || 0;
      let newIndex = currentIndex;

      if (direction === 'prev') {
          if (currentIndex > 0) newIndex--;
      } else {
          if (currentIndex < msg.swipes.length - 1) {
              newIndex++;
          } else {
              // Trigger Regenerate if at the end
              handleRegenerate(msgIndex);
              return;
          }
      }

      const newText = msg.swipes[newIndex];
      
      // Task: Parse LSR Data for immediate sync during swipe
      const tableStored = extractTagContent(newText, 'table_stored');
      let nextLsrData = lsrRuntimeDataRef.current;
      if (tableStored) {
          // console.log("GameplayScreen (handleSwipe): Detected <table_stored>. Parsing...");
          const parsedData = LsrParser.parseLsrString(tableStored);
          if (Object.keys(parsedData).length > 0) {
              nextLsrData = parsedData;
              setLsrRuntimeData(nextLsrData);
          }
      } else {
          const tableEdit = extractTagContent(newText, 'tableEdit');
          if (tableEdit) {
              // console.log("GameplayScreen (handleSwipe): Detected <tableEdit>. Merging edits...");
              const parsedEdits = LsrParser.parseLsrString(tableEdit);
              if (Object.keys(parsedEdits).length > 0) {
                  nextLsrData = LsrParser.mergeLsrData(lsrRuntimeDataRef.current, parsedEdits);
                  setLsrRuntimeData(nextLsrData);
              }
          }
      }

      // Extract incrementalSummary
      const incrementalSummary = extractTagContent(newText, 'incrementalSummary');

      setHistory(prev => {
          const updated = [...prev];
          const updatedMsg = { ...updated[msgIndex] };
          
          updatedMsg.swipeIndex = newIndex;
          updatedMsg.text = newText;
          
          // Re-parse choices for this specific swipe version
          const branchesContent = extractTagContent(newText, 'branches') || 
                                  extractTagContent(newText, 'choices') || 
                                  extractTagContent(newText, 'actions');
          updatedMsg.choices = parseChoices(branchesContent);
          updatedMsg.incrementalSummary = incrementalSummary;

          updated[msgIndex] = updatedMsg;

          // Sync state back to parent
          syncWorldState(updated, turnCount, gameTime, nextLsrData, incrementalSummary);

          return updated;
      });
  };

  const handleExit = () => {
    onNavigate(GameState.MENU);
  };

  const scrollToTurn = (turnNumber: number) => {
    // Tìm index của tin nhắn đầu tiên thuộc lượt này
    const msgIndex = history.findIndex(m => m.turnNumber === turnNumber);
    if (msgIndex === -1) return;

    // Tính toán trang chứa tin nhắn này
    const targetPage = msgIndex < 11 ? 1 : 1 + Math.ceil((msgIndex - 11) / MESSAGES_PER_PAGE);

    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
      pendingScrollTurnRef.current = turnNumber;
    } else {
      const element = document.getElementById(`turn-${turnNumber}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
    setLastNavigatedTurn(turnNumber);
    shouldAutoScrollRef.current = false;
  };

  const findCurrentTurnInView = () => {
    if (!scrollViewportRef.current) return null;
    const viewport = scrollViewportRef.current;
    const viewportRect = viewport.getBoundingClientRect();
    const midPoint = viewportRect.top + viewportRect.height / 3; // Check top third

    // Find all turn elements in the current viewport
    const turnElements = Array.from(viewport.querySelectorAll('[id^="turn-"]'));
    let closestTurn = null;
    let minDistance = Infinity;

    for (const el of turnElements) {
      const rect = el.getBoundingClientRect();
      // If the element is visible in the viewport
      if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
        const distance = Math.abs(rect.top - midPoint);
        if (distance < minDistance) {
          minDistance = distance;
          const turnId = el.id.replace('turn-', '');
          closestTurn = parseInt(turnId, 10);
        }
      }
    }
    return closestTurn;
  };

  const scrollToTop = () => {
    // Lấy danh sách tất cả các số lượt hiện có, sắp xếp tăng dần
    const allTurns = Array.from(new Set(history
        .filter(m => m.turnNumber !== undefined)
        .map(m => m.turnNumber as number)
    )).sort((a, b) => a - b);

    if (allTurns.length === 0) {
      if (scrollViewportRef.current) {
        scrollViewportRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Ưu tiên sử dụng lượt đang hiển thị nếu có
    const currentTurn = findCurrentTurnInView() ?? lastNavigatedTurn;

    let targetTurn: number;
    if (currentTurn === null) {
      // Nếu không xác định được, nhảy đến lượt cuối cùng
      targetTurn = allTurns[allTurns.length - 1];
    } else {
      const currentIndex = allTurns.indexOf(currentTurn);
      if (currentIndex > 0) {
        targetTurn = allTurns[currentIndex - 1];
      } else {
        // Nếu đã ở lượt đầu, quay lại lượt cuối
        targetTurn = allTurns[allTurns.length - 1];
      }
    }

    scrollToTurn(targetTurn);
  };

  const scrollToBottom = () => {
    // Lấy danh sách tất cả các số lượt hiện có, sắp xếp tăng dần
    const allTurns = Array.from(new Set(history
        .filter(m => m.turnNumber !== undefined)
        .map(m => m.turnNumber as number)
    )).sort((a, b) => a - b);

    if (allTurns.length === 0) {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    // Ưu tiên sử dụng lượt đang hiển thị nếu có
    const currentTurn = findCurrentTurnInView() ?? lastNavigatedTurn;

    let targetTurn: number;
    if (currentTurn === null) {
      // Nếu không xác định được, nhảy đến lượt đầu tiên
      targetTurn = allTurns[0];
    } else {
      const currentIndex = allTurns.indexOf(currentTurn);
      if (currentIndex !== -1 && currentIndex < allTurns.length - 1) {
        targetTurn = allTurns[currentIndex + 1];
      } else {
        // Nếu đã ở lượt cuối, cuộn xuống cuối hẳn
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
        setLastNavigatedTurn(null);
        shouldAutoScrollRef.current = true;
        return;
      }
    }

    scrollToTurn(targetTurn);
  };

  const handleManualSave = async () => {
    if (!activeWorld) return;
    setIsSaving(true);
    
    const worldName = activeWorld?.world?.worldName || 'Unknown_World';
    const playerName = activeWorld?.player?.name || 'Unknown_Hero';
    const turnCountValue = history.filter(m => m.role === 'user').length;
    
    // 1. Prepare Save Data
    const saveData: WorldData = {
        ...activeWorld,
        lsrData: lsrRuntimeData, // CRITICAL: Include latest LSR data
        savedState: {
            history: history,
            turnCount: turnCountValue,
            gameTime: gameTime,
            aiMonitor: {
                tokenHistory: tokenHistoryRef.current,
                totalTokens: totalTokensRef.current,
                lastTurnTotalTime: lastTurnTotalTimeRef.current
            }
        },
        config: {
            ...activeWorld.config,
            rules: dynamicRules,
            tawaPreset: tawaPresetConfig,
            regexScripts: combinedRegexScripts
        }
    };
    
    // 2. Save to Database (Internal)
    // Use deterministic ID for manual save: manual-[worldName]-[turnCount]
    const saveId = `manual-${worldName.replace(/\s+/g, '_')}-${turnCount}`;
    const saveFile: SaveFile = {
        id: saveId,
        name: `${worldName} - Turn ${turnCount} (Manual)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: saveData
    };

    try {
        await dbService.saveGameState(saveFile);
        
        // 3. Download to Computer
        // Format: ARK_save_[world_name]_[player_name]_[turn_number].json
        const fileName = `ARK_save_${worldName.replace(/\s+/g, '_')}_${playerName.replace(/\s+/g, '_')}_${turnCountValue}.json`;
        
        const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to save game:", error);
    } finally {
        setIsSaving(false);
    }
  };
  
  const toggleStreamResponse = async () => {
      if (!settings) return;
      const newSetting = !settings.streamResponse;
      setSettings({ ...settings, streamResponse: newSetting });
      await dbService.saveSettings({ ...settings, streamResponse: newSetting });
  };

  const handleGoToSettings = () => {
    syncWorldState();
    onNavigate(GameState.SETTINGS);
  };

  const handleUpdateContextConfig = (newConfig: ContextWindowConfig) => {
    if (onUpdateWorld && activeWorld) {
      onUpdateWorld({
        config: {
          ...activeWorld.config,
          contextConfig: newConfig
        }
      });
    }
  };

  const toggleContextItem = (key: keyof ContextWindowConfig['items']) => {
    if (!activeWorld) return;
    const config = activeWorld.config.contextConfig || {
      items: {
        playerProfile: true, worldInfo: true, longTermMemory: true, relevantMemories: true,
        entities: true, npcRegistry: true, timeSystem: true, reinforcement: true
      },
      maxEntities: 10, recentHistoryCount: 100
    };
    const newConfig = {
      ...config,
      items: {
        ...config.items,
        [key]: !config.items[key]
      }
    };
    handleUpdateContextConfig(newConfig);
  };

  const updateContextMaxEntities = (val: number) => {
    if (!activeWorld) return;
    const config = activeWorld.config.contextConfig || { maxEntities: 10, recentHistoryCount: 100, items: {} as any };
    handleUpdateContextConfig({ ...config, maxEntities: val });
  };

  const updateContextHistoryCount = (val: number) => {
    if (!activeWorld) return;
    const config = activeWorld.config.contextConfig || { maxEntities: 10, recentHistoryCount: 100, items: {} as any };
    handleUpdateContextConfig({ ...config, recentHistoryCount: val });
  };

  const renderContextWindowModal = () => {
    if (!activeWorld) return null;
    const config = activeWorld.config.contextConfig || {
      items: {
        playerProfile: true, worldInfo: true, longTermMemory: true, relevantMemories: true,
        entities: true, npcRegistry: true, timeSystem: true, reinforcement: true
      },
      maxEntities: 10, recentHistoryCount: 100
    };

    return (
      <AnimatePresence>
        {showContextModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-md p-2">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-stone-200 dark:bg-mystic-950 border border-stone-400 dark:border-slate-800 w-[99vw] h-[99vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-mystic-900/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-mystic-accent/20 rounded-lg text-mystic-accent">
                    <Database size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-stone-800 dark:text-slate-100">Cấu hình Cửa sổ Ngữ cảnh</h2>
                    <p className="text-xs text-stone-500 dark:text-slate-500 uppercase tracking-widest font-bold">Kiểm soát dữ liệu gửi cho AI Tawa</p>
                  </div>
                </div>

                <div className="flex bg-stone-400/30 dark:bg-slate-800/50 rounded-lg p-1">
                    <button
                        onClick={() => setActiveContextTab('config')}
                        className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                            activeContextTab === 'config'
                                ? 'bg-mystic-accent text-mystic-900 shadow-md'
                                : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                        }`}
                    >
                        Tùy chỉnh
                    </button>
                    <button
                        onClick={() => setActiveContextTab('debugger')}
                        className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 ${
                            activeContextTab === 'debugger'
                                ? 'bg-mystic-accent text-mystic-900 shadow-md'
                                : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                        }`}
                    >
                        <Code size={14} /> Debugger
                    </button>
                </div>

                <button 
                  onClick={() => setShowContextModal(false)}
                  className="p-2 hover:bg-red-500/20 text-stone-500 hover:text-red-500 rounded-full transition-all"
                >
                  <X size={32} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-hidden flex flex-col bg-stone-100 dark:bg-mystic-950">
                {activeContextTab === 'config' ? (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Toggles */}
                    <div className="space-y-6">
                  <h3 className="text-sm font-black text-mystic-accent uppercase tracking-[0.2em] border-b border-mystic-accent/30 pb-2">Thành phần Ngữ cảnh</h3>
                  
                  <div className="space-y-3">
                    {[
                      { key: 'playerProfile', label: 'Hồ sơ nhân vật', desc: 'Thông tin chi tiết về nhân vật của bạn' },
                      { key: 'worldInfo', label: 'Thông tin thế giới', desc: 'Bối cảnh, thể loại và cốt truyện chung' },
                      { key: 'longTermMemory', label: 'Trí nhớ dài hạn (Summary)', desc: 'Bản tóm tắt các sự kiện đã qua' },
                      { key: 'relevantMemories', label: 'Ký ức liên quan (RAG)', desc: 'Các đoạn hội thoại cũ được tìm thấy qua Vector Search' },
                      { key: 'entities', label: 'Thực thể (NPCs/Items)', desc: 'Thông tin về các nhân vật và vật phẩm trong thế giới' },
                      { key: 'npcRegistry', label: 'Danh sách tổng NPC (Registry)', desc: 'Danh sách rút gọn tất cả NPC để AI tham chiếu ID' },
                      { key: 'timeSystem', label: 'Hệ thống thời gian', desc: 'Ngày, tháng, năm và lượt chơi hiện tại' },
                      { key: 'reinforcement', label: 'Chỉ thị củng cố (Reinforcement)', desc: 'Các lệnh ép AI duy trì chất lượng văn phong' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800 hover:border-mystic-accent/50 transition-all group">
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">{item.label}</h4>
                          <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">{item.desc}</p>
                        </div>
                        <button 
                          onClick={() => toggleContextItem(item.key as keyof ContextWindowConfig['items'])}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.items[item.key as keyof typeof config.items] ? 'bg-mystic-accent' : 'bg-stone-400 dark:bg-slate-700'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.items[item.key as keyof typeof config.items] ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Numeric Limits */}
                <div className="space-y-6">
                  <h3 className="text-sm font-black text-mystic-accent uppercase tracking-[0.2em] border-b border-mystic-accent/30 pb-2">Giới hạn Số lượng</h3>
                  
                  <div className="space-y-6">
                    {/* Max Entities */}
                    <div className="p-5 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">Số lượng Thực thể tối đa (NPCs)</h4>
                          <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">Giới hạn số lượng NPC/Vật phẩm gửi cho AI mỗi lượt</p>
                        </div>
                        <div className="text-2xl font-black text-mystic-accent">{config.maxEntities}</div>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="50" 
                        value={config.maxEntities} 
                        onChange={(e) => updateContextMaxEntities(parseInt(e.target.value))}
                        className="w-full h-2 bg-stone-300 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-mystic-accent"
                      />
                      <div className="flex justify-between text-[10px] text-stone-500 mt-2 font-bold">
                        <span>1 NPC</span>
                        <span>50 NPCs</span>
                      </div>
                    </div>

                    {/* Recent History Count */}
                    <div className="p-5 bg-stone-200 dark:bg-slate-900/50 rounded-xl border border-stone-300 dark:border-slate-800">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200">Lịch sử gần đây (Recent History)</h4>
                          <p className="text-[10px] text-stone-500 dark:text-slate-500 mt-0.5">Số lượng tin nhắn gần nhất AI sẽ đọc trực tiếp</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            min="1" 
                            max="500" 
                            value={config.recentHistoryCount} 
                            onChange={(e) => updateContextHistoryCount(parseInt(e.target.value) || 1)}
                            className="w-16 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded px-2 py-1 text-center font-black text-mystic-accent outline-none focus:border-mystic-accent"
                          />
                          <span className="text-xs font-bold text-stone-500">tin nhắn</span>
                        </div>
                      </div>
                      <p className="text-[10px] italic text-amber-600 dark:text-amber-500/70 bg-amber-500/5 p-2 rounded border border-amber-500/20">
                        * Mặc định là 100. Số lượng càng cao AI càng nhớ tốt các sự kiện vừa xảy ra, nhưng sẽ tốn nhiều Token hơn.
                      </p>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="p-6 bg-mystic-accent/5 border border-mystic-accent/20 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black text-mystic-accent uppercase tracking-widest flex items-center gap-2">
                      <Zap size={14} /> Tại sao cần cấu hình này?
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-slate-400 leading-relaxed">
                      Cửa sổ ngữ cảnh là "bộ nhớ tạm thời" của AI. Bằng cách tắt các mục không cần thiết hoặc giảm số lượng tin nhắn lịch sử, bạn có thể:
                    </p>
                    <ul className="text-xs text-stone-600 dark:text-slate-400 space-y-1 list-disc pl-4">
                      <li>Tiết kiệm Token (giảm chi phí/tăng tốc độ phản hồi).</li>
                      <li>Tránh việc AI bị "loãng" thông tin bởi quá nhiều NPC phụ.</li>
                      <li>Tập trung sự chú ý của AI vào các thành phần quan trọng nhất.</li>
                    </ul>
                  </div>
                </div>
              </div>
              ) : (
                <div className="flex-1 h-full p-2">
                  <ContextDebuggerView 
                      worldData={activeWorld}
                      settings={settings}
                      history={history}
                      turnCount={turnCount}
                      presetConfig={tawaPresetConfig}
                      gameTime={gameTime}
                      lastUserMessage={lastAction}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
              <div className="p-4 border-t border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-mystic-900/80 flex justify-center shrink-0">
                <Button 
                  onClick={() => setShowContextModal(false)}
                  className="px-12 py-3 bg-mystic-accent text-mystic-900 font-black uppercase tracking-widest hover:bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  Xác nhận & Đóng
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  const renderSidebarContent = () => {
      const totalPages = history.length <= 11 ? 1 : 1 + Math.ceil((history.length - 11) / MESSAGES_PER_PAGE);
      return (
      <div className="h-full flex flex-col bg-stone-300 dark:bg-mystic-900 shadow-xl">
          <div className="p-1 border-b border-stone-400 dark:border-slate-800 bg-stone-400/50 dark:bg-mystic-800/50 shrink-0 space-y-1">
              <button onClick={() => setShowCharModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                  <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><User className="text-mystic-accent" size={16}/></div>
                  <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs truncate">{activeWorld.player.name}</h3></div>
              </button>
              <button onClick={() => setShowGlobalModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                  <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-green-400"><Globe className="text-green-600 dark:text-green-400" size={16}/></div>
                  <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Thông tin toàn cục</h3></div>
              </button>
              <button onClick={() => setShowHistoryModal(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                  <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-blue-400"><History className="text-blue-600 dark:text-blue-400" size={16}/></div>
                  <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Lịch Sử & Load Save</h3></div>
              </button>
              <button onClick={() => setShowImageLibrary(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                  <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><ImageIcon className="text-mystic-accent" size={16}/></div>
                  <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Thư Viện Ảnh</h3></div>
              </button>
              <button onClick={() => setShowLogConsole(true)} className="w-full flex items-center gap-2 p-1.5 bg-stone-200 dark:bg-slate-800/50 hover:bg-stone-400 dark:hover:bg-slate-700 border border-stone-400 dark:border-slate-700 rounded transition-all group">
                  <div className="w-8 h-8 rounded-full bg-stone-300 dark:bg-slate-900 border border-stone-400 dark:border-slate-600 flex items-center justify-center shrink-0 group-hover:border-mystic-accent"><Terminal className="text-mystic-accent" size={16}/></div>
                  <div className="text-left"><h3 className="font-normal text-stone-800 dark:text-slate-200 text-xs">Log Console</h3></div>
              </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1 space-y-2">
              {/* Mobile Controls Section */}
              <div className="md:hidden p-2 space-y-3 bg-stone-400/20 dark:bg-slate-800/20 rounded-lg border border-stone-400/50 dark:border-slate-700/50 mb-2">
                  <div className="text-[10px] font-bold text-stone-500 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                      <Zap size={12} /> Điều khiển nhanh
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      {/* Thử Lại Button */}
                      <Button 
                          variant="ghost" 
                          onClick={() => {
                              const lastModelIdx = [...history].reverse().findIndex(m => m.role === 'model');
                              if (lastModelIdx !== -1) {
                                  const actualIdx = history.length - 1 - lastModelIdx;
                                  handleRegenerate(actualIdx);
                              }
                          }} 
                          disabled={isLoading || !history.some(m => m.role === 'model')} 
                          className="h-10 text-[10px] font-bold uppercase tracking-tighter border border-stone-400 dark:border-slate-700 hover:border-mystic-accent/50 flex items-center justify-center gap-2"
                      >
                          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                          Thử Lại
                      </Button>

                      {/* Toggle Input Button */}
                      <button 
                          onClick={() => setIsInputCollapsed(!isInputCollapsed)}
                          className={`h-10 rounded border transition-all flex items-center justify-center gap-2 shadow-sm ${
                              isInputCollapsed 
                              ? 'bg-mystic-accent/10 border-mystic-accent/30 text-mystic-accent' 
                              : 'bg-stone-200 dark:bg-slate-800 border-stone-400 dark:border-slate-700 text-stone-500'
                          }`}
                      >
                          {isInputCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                          <span className="text-[10px] font-bold uppercase">
                              {isInputCollapsed ? 'Mở Rộng' : 'Thu Gọn'}
                          </span>
                      </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                      {/* Pagination Group */}
                      <div className="flex items-center h-10 bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded overflow-hidden flex-1">
                          <button 
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className="h-full px-3 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-r border-stone-400 dark:border-slate-700"
                          >
                              <ChevronLeft size={16} />
                          </button>
                          <div className="flex-1 flex flex-col items-center justify-center">
                              <span className="text-[10px] font-bold text-stone-600 dark:text-slate-400 leading-none">
                                  {currentPage}/{totalPages}
                              </span>
                              <span className="text-[7px] uppercase opacity-50 font-bold">Trang</span>
                          </div>
                          <button 
                              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                              disabled={currentPage === totalPages}
                              className="h-full px-3 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-l border-stone-400 dark:border-slate-700"
                          >
                              <ChevronRight size={16} />
                          </button>
                      </div>

                      {/* Scroll Controls */}
                      <div className="flex items-center gap-1">
                          <button 
                              onClick={scrollToTop}
                              className="h-10 w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent transition-all"
                          >
                              <ChevronsUp size={18} />
                          </button>
                          <button 
                              onClick={scrollToBottom}
                              className="h-10 w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent transition-all"
                          >
                              <ChevronsDown size={18} />
                          </button>
                      </div>
                  </div>
              </div>

              {/* Stream Toggle */}
              <button 
                  onClick={toggleStreamResponse}
                  className="w-full p-2 flex justify-between items-center text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors bg-stone-200 dark:bg-slate-800/30 rounded border border-stone-400 dark:border-slate-700 mb-2"
              >
                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300">
                       <Zap size={14} className={settings?.streamResponse ? "text-yellow-500 dark:text-yellow-400" : "text-stone-400 dark:text-slate-500"} />
                       Streaming
                  </div>
                  <div className={settings?.streamResponse ? "text-green-600 dark:text-green-400" : "text-stone-300 dark:text-slate-600"}>
                       {settings?.streamResponse ? <ToggleRight size={20}/> : <ToggleLeft size={20}/>}
                  </div>
              </button>

              <WorldInfoSidebar 
                 lorebook={activeWorld.lorebook} 
                 onUpdateLorebook={(l) => onUpdateWorld && onUpdateWorld({ lorebook: l })} 
              />
              <RulesManager rules={dynamicRules} onUpdate={setDynamicRules} />
              <RegexScriptsManager 
                activeWorld={activeWorld} 
                onUpdateWorld={onUpdateWorld} 
                playerName={activeWorld.player.name} 
                charName={activeWorld.entities?.[0]?.name || "Character"}
                onScriptsChanged={reloadRegexScripts}
              />
              
              <button 
                onClick={() => setShowContextModal(true)}
                className="w-full p-2 flex justify-between items-center text-left hover:bg-mystic-accent/10 dark:hover:bg-mystic-accent/5 transition-all bg-stone-200 dark:bg-slate-800/30 rounded border border-stone-400 dark:border-slate-700 group"
              >
                <div className="flex items-center gap-2 text-[10px] font-bold text-mystic-accent uppercase">
                  <Database size={14} className="group-hover:scale-110 transition-transform" />
                  Cửa sổ Ngữ cảnh
                </div>
                <div className="text-[8px] bg-mystic-accent/20 px-1.5 py-0.5 rounded text-mystic-accent font-bold">Config</div>
              </button>

              <TawaPresetManager onConfigChange={handleTawaConfigChange} initialPreset={activeWorld?.config?.tawaPreset} />
              <AIMonitor />
          </div>
          <div className="p-1 border-t border-stone-400 dark:border-slate-800 bg-stone-200 dark:bg-mystic-900/95 flex flex-row gap-1 mt-auto shrink-0">
              <Button variant="ghost" className="flex-1 text-[12px] h-9 px-1 justify-center border border-stone-400 dark:border-slate-700 hover:bg-stone-400 dark:hover:bg-slate-800 font-mono font-bold leading-[20px]" icon={<Settings size={12}/>} onClick={handleGoToSettings} title="Cài đặt hệ thống">Cài đặt</Button>
              <Button variant="outline" className="flex-1 text-[12px] h-9 px-1 justify-center border border-stone-400 dark:border-slate-700 font-mono font-bold" icon={<Save size={12}/>} onClick={handleManualSave} isLoading={isSaving} disabled={isLoading} title="Lưu thủ công và tải file (.json)">Lưu</Button>
              <Button variant="danger" className="flex-1 text-[12px] h-9 px-1 justify-center border-red-900/30 font-mono font-bold" icon={<LogOut size={12}/>} onClick={handleExit} title="Thoát ra Menu chính">Thoát</Button>
          </div>
      </div>
  );
  };

  // --- RENDER ---
  if (!activeWorld) return null;

  const lastMessage = history[history.length - 1];
  const activeChoices = (lastMessage?.role === 'model' && lastMessage.choices) ? lastMessage.choices : [];

  return (
    <div className="flex h-full w-full bg-stone-300 dark:bg-mystic-900 font-sans overflow-hidden">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col h-full relative z-10 min-w-0">
            {/* Header ... */}
            <header className="h-14 md:h-16 shrink-0 bg-stone-200 dark:bg-mystic-900 border-b border-stone-400 dark:border-slate-800 flex items-center justify-center relative px-4 z-30 shadow-sm">
                 <button 
                    className="md:hidden absolute left-4 text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white"
                    onClick={() => setShowMobileSidebar(true)}
                 >
                     <Menu size={20} />
                 </button>
                 <div className="flex flex-col items-center">
                     <h1 className="font-bold text-stone-800 dark:text-slate-200 text-xs md:text-sm tracking-wide leading-tight font-mono truncate max-w-[180px] md:max-w-none">
                         {activeWorld.world.worldName}
                     </h1>
                     <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[9px] md:text-[10px] font-mono font-bold text-mystic-accent bg-mystic-accent/10 px-1.5 md:px-2 py-0.5 rounded-full border border-mystic-accent/20 leading-none">
                            Lượt: {turnCount}
                        </span>
                        <span className="text-[9px] md:text-[10px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 md:px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 leading-none">
                            <Clock size={8} className="md:size-2.5" />
                            {formatGameTime(gameTime)}
                        </span>
                     </div>
                 </div>
            </header>

            <DynamicHUD worldData={activeWorld} gameTime={gameTime} turnCount={turnCount} />

            {/* Chat Area */}
            <div 
                ref={scrollViewportRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-5 space-y-4 w-full bg-stone-300 dark:bg-mystic-900"
            >
                    {displayedMessages.map((msg, idx) => {
                        const globalIndex = startIndex + idx;
                        const isModel = msg.role === 'model';
                        const swipes = msg.swipes || [msg.text];
                        const swipeIndex = msg.swipeIndex || 0;
                        const displayText = swipes[swipeIndex] || "";
                        
                        // Check if this message is currently being streamed
                        // It is streaming if we are loading AND it is the very last message in the entire history
                        const isStreamingMsg = isLoading && (globalIndex === history.length - 1);

                        return (
                        <motion.div 
                                key={`${currentPage}-${idx}`}
                                id={isModel && msg.turnNumber !== undefined ? `turn-${msg.turnNumber}` : undefined}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex w-full ${!isModel ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`relative rounded-lg p-3 md:p-5 leading-relaxed shadow-md text-base flex flex-col gap-2 ${
                                    !isModel 
                                        ? 'bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-800 dark:text-slate-200 rounded-tr-none max-w-[90%] md:max-w-[85%]' 
                                        : 'bg-transparent text-stone-800 dark:text-slate-300 pl-0 w-full'
                                }`}>
                                    <TawaMessageRenderer 
                                        index={globalIndex}
                                        text={displayText}
                                        onUpdate={handleMessageUpdate}
                                        isStreaming={isStreamingMsg} // Pass prop
                                        regexScripts={combinedRegexScripts}
                                        entities={activeWorld.entities}
                                        onEntityClick={handleEntityClick}
                                        turnNumber={isModel ? msg.turnNumber : undefined}
                                        userAction={isModel ? msg.userAction : undefined}
                                        playerName={activeWorld.player.name}
                                        playerAvatar={activeWorld.player.avatar}
                                        messageRole={isModel ? 'assistant' : 'user'}
                                        contentBeautify={settings?.contentBeautify}
                                        totalCount={history.length}
                                        metadata={msg.metadata}
                                    />

                                    {/* Swipe Controls for AI Messages */}
                                    {isModel && !isStreamingMsg && (
                                        <div className="flex items-center gap-2 mt-1 select-none w-full border-t border-stone-400 dark:border-slate-800/50 pt-2">
                                            <div className="flex items-center bg-stone-300 dark:bg-slate-800/50 rounded-lg p-0.5 border border-stone-400 dark:border-slate-700/50">
                                                <button 
                                                    onClick={() => handleSwipe(globalIndex, 'prev')}
                                                    disabled={swipeIndex === 0}
                                                    className="p-1 hover:bg-stone-400 dark:hover:bg-slate-700 rounded text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Phiên bản cũ hơn"
                                                >
                                                    <ChevronLeft size={14} />
                                                </button>
                                                <span className="text-[10px] font-mono text-stone-400 dark:text-slate-500 px-2 min-w-[40px] text-center">
                                                    {swipeIndex + 1}/{swipes.length}
                                                </span>
                                                <button 
                                                    onClick={() => handleSwipe(globalIndex, 'next')}
                                                    className="p-1 hover:bg-stone-400 dark:hover:bg-slate-700 rounded text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white disabled:opacity-30 transition-colors"
                                                    title={swipeIndex === swipes.length - 1 ? "Tạo lại (Regenerate)" : "Phiên bản mới hơn"}
                                                >
                                                    {swipeIndex === swipes.length - 1 ? (
                                                        <RefreshCw size={14} className={isLoading ? "animate-spin text-mystic-accent" : ""} />
                                                    ) : (
                                                        <ChevronRight size={14} />
                                                    )}
                                                </button>
                                            </div>
                                            {swipes.length > 1 && (
                                                <span className="text-[10px] text-stone-400 dark:text-slate-600 italic">
                                                    {swipeIndex === swipes.length - 1 ? "Lastest" : "History"}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                    {isLoading && !history[history.length - 1]?.text && (
                        /* Only show loader if we are NOT streaming (if streaming, text updates live) */
                        <div className="flex flex-col items-center justify-center p-6 space-y-3 animate-fade-in w-full border-t border-stone-400 dark:border-slate-800/30">
                            <Loader2 className="w-8 h-8 text-mystic-accent animate-spin" />
                            <span className="text-sm font-medium text-stone-500 dark:text-slate-400 animate-pulse">
                                Đang kiến tạo diễn biến...
                            </span>
                        </div>
                    )}
                    <div ref={chatEndRef} />
            </div>

            {/* Input Area ... (Same as before) */}
            <div className="bg-stone-300 dark:bg-mystic-900 border-t border-stone-400 dark:border-slate-800 z-20 shrink-0 flex flex-col shadow-[0_-5px_15px_rgba(0,0,0,0.05)] dark:shadow-[0_-5px_15px_rgba(0,0,0,0.2)]">
                {/* Game Input Component */}
                <GameInput 
                    onSend={handleSend}
                    isLoading={isLoading}
                    lastAction={lastAction}
                    isInputCollapsed={isInputCollapsed}
                    onToggleCollapse={() => setIsInputCollapsed(!isInputCollapsed)}
                    activeChoices={activeChoices}
                    history={history}
                    isMobile={isMobile}
                >
                    {/* Thử Lại Button */}
                    <Button 
                        variant="ghost" 
                        onClick={() => {
                            const lastModelIdx = [...history].reverse().findIndex(m => m.role === 'model');
                            if (lastModelIdx !== -1) {
                                const actualIdx = history.length - 1 - lastModelIdx;
                                handleRegenerate(actualIdx);
                            }
                        }} 
                        disabled={isLoading || !history.some(m => m.role === 'model')} 
                        className="h-9 md:h-10 px-3 text-[10px] font-bold uppercase tracking-tighter border border-stone-400 dark:border-slate-700 hover:border-mystic-accent/50 whitespace-nowrap flex items-center justify-center gap-1 shrink-0"
                        title="Tạo lại phản hồi cuối cùng của AI"
                    >
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">Thử Lại</span>
                    </Button>

                    {/* Pagination Group */}
                    <div className="flex items-center h-9 md:h-10 bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded overflow-hidden shrink-0">
                        <button 
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="h-full px-2 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-r border-stone-400 dark:border-slate-700"
                            title="Trang trước"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <div className="px-2 flex flex-col items-center justify-center min-w-[40px]">
                            <span className="text-[10px] font-bold text-stone-600 dark:text-slate-400 leading-none">
                                {currentPage}/{totalPages}
                            </span>
                            <span className="text-[7px] uppercase opacity-50 font-bold">Trang</span>
                        </div>
                        <button 
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="h-full px-2 text-stone-500 hover:text-mystic-accent disabled:opacity-30 transition-colors border-l border-stone-400 dark:border-slate-700"
                            title="Trang sau"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>

                    {/* Scroll Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            onClick={scrollToTop}
                            className="h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent hover:border-mystic-accent transition-all shadow-sm"
                            title="Lên đầu lượt"
                        >
                            <ChevronsUp size={16} />
                        </button>
                        <button 
                            onClick={scrollToBottom}
                            className="h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded bg-stone-200 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 text-stone-500 hover:text-mystic-accent hover:border-mystic-accent transition-all shadow-sm"
                            title="Về cuối lượt"
                        >
                            <ChevronsDown size={16} />
                        </button>
                    </div>
                </GameInput>
            </div>
        </div>

        {/* SIDEBAR - DESKTOP */}
        <div className="hidden md:block w-80 shrink-0 h-full relative z-20 border-l border-stone-400 dark:border-slate-800">
            {renderSidebarContent()}
        </div>

        {/* SIDEBAR - MOBILE OVERLAY */}
        <AnimatePresence>
            {showMobileSidebar && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm"
                        onClick={() => setShowMobileSidebar(false)}
                    />
                    <motion.div
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-4/5 max-w-sm bg-stone-300 dark:bg-mystic-900 z-50 border-l border-stone-400 dark:border-slate-700 md:hidden"
                    >
                        {renderSidebarContent()}
                    </motion.div>
                </>
            )}
        </AnimatePresence>

        {/* MODALS */}
        {/* HISTORY & LOAD SAVE MODAL */}
        <AnimatePresence>
            {showHistoryModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-4 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-widest">
                                <Database size={20} className="text-mystic-accent"/> Dữ Liệu & Lịch Sử
                            </h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        
                        {/* Tab Navigation */}
                        <div className="flex bg-stone-300 dark:bg-slate-900/80 p-1 gap-1 border-b border-stone-400 dark:border-slate-800">
                            {[
                                { id: 'history', label: 'Cốt truyện', icon: <History size={14} /> },
                                { id: 'manual', label: 'Lưu Thủ Công', icon: <Save size={14} /> },
                                { id: 'autosave', label: 'Lưu Tự Động', icon: <Clock size={14} /> },
                                { id: 'initial', label: 'Bản lưu lượt 0', icon: <Shield size={14} /> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSaveTab(tab.id as 'manual' | 'autosave' | 'history' | 'initial')}
                                    className={`flex-1 py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${
                                        activeSaveTab === tab.id 
                                        ? 'bg-mystic-accent text-mystic-900 shadow-lg' 
                                        : 'text-stone-500 hover:bg-stone-400/20 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {tab.icon}
                                    <span className={isMobile ? 'hidden' : 'inline'}>{tab.label}</span>
                                    {isMobile && <span>{tab.label.split(' ')[0]}</span>}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-hidden bg-stone-200 dark:bg-mystic-950">
                            {activeSaveTab === 'history' ? (
                                <div className="h-full flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                        {history.filter(m => m.role === 'model').length === 0 ? (
                                            <div className="text-center text-stone-400 dark:text-slate-500 py-20">
                                                Chưa có tóm tắt cốt truyện.
                                            </div>
                                        ) : (
                                            [...history].filter(m => m.role === 'model').reverse().map((msg, idx) => (
                                                <div key={`${msg.timestamp}-${idx}`} className="bg-stone-300 dark:bg-slate-800/50 p-4 rounded-lg border border-stone-400 dark:border-slate-700 shadow-sm hover:border-blue-500/50 transition-all group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold bg-blue-600/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded uppercase tracking-wider">
                                                                Lượt {msg.turnNumber}
                                                            </span>
                                                            <span className="text-[10px] text-stone-500 dark:text-slate-500 font-mono">
                                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    {msg.userAction && (
                                                        <div className="mb-3 p-2 bg-stone-400/10 dark:bg-slate-900/30 rounded border-l-2 border-stone-400 dark:border-slate-700 italic text-xs text-stone-600 dark:text-slate-400">
                                                            "{msg.userAction}"
                                                        </div>
                                                    )}

                                                    <div className="text-sm text-stone-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                                                        {msg.incrementalSummary || <span className="text-stone-400 italic">Không có tóm tắt.</span>}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                        {(activeSaveTab === 'manual' ? manualSaveList : activeSaveTab === 'autosave' ? autosaveList : initialSaveList).length === 0 ? (
                                            <div className="text-center text-stone-400 dark:text-slate-500 py-20">
                                                Chưa có tệp lưu {activeSaveTab === 'manual' ? 'thủ công' : activeSaveTab === 'autosave' ? 'tự động' : 'lượt 0'}.
                                            </div>
                                        ) : (
                                            (activeSaveTab === 'manual' ? manualSaveList : activeSaveTab === 'autosave' ? autosaveList : initialSaveList).map((save) => (
                                                <div 
                                                    key={save.id} 
                                                    className="bg-stone-300 dark:bg-slate-800/50 p-4 rounded-xl border border-stone-400 dark:border-slate-700 shadow-sm hover:border-mystic-accent transition-all group flex flex-col gap-4"
                                                >
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200 mb-1 group-hover:text-mystic-accent transition-colors">
                                                            {save.name}
                                                        </h4>
                                                        <div className="flex items-center gap-3 text-[10px] text-stone-500 dark:text-slate-500 font-medium">
                                                            <span className="flex items-center gap-1"><Clock size={10}/> {new Date(save.updatedAt).toLocaleString()}</span>
                                                            <span className="opacity-30">|</span>
                                                            <span className="flex items-center gap-1"><Zap size={10}/> Lượt: {save.data?.savedState?.turnCount || 0}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex gap-2 pt-2 border-t border-stone-400/30 dark:border-slate-800/50">
                                                        <Button 
                                                            variant="primary" 
                                                            size="sm" 
                                                            onClick={() => handleLoadSave(save)}
                                                            className="flex-1 h-9 text-[11px] font-black uppercase tracking-widest shadow-lg shadow-mystic-accent/10"
                                                            icon={<BookOpen size={14} />}
                                                        >
                                                            Tải Dữ Liệu
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => handleDeleteSave(save.id)}
                                                            className="h-9 px-3 text-red-500 hover:bg-red-500/10 border border-stone-400/50 dark:border-slate-700 hover:border-red-500/50 transition-all"
                                                            title="Xóa tệp lưu"
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Character Modal (UPDATED WITH FULL INFO) */}
        <AnimatePresence>
            {showCharModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full h-full rounded-none shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-2 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2">
                                <User size={20} className="text-mystic-accent"/> Hồ Sơ Nhân Vật
                            </h2>
                            <button onClick={() => setShowCharModal(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-2 overflow-y-auto custom-scrollbar space-y-2 bg-stone-200 dark:bg-mystic-900">
                            <div className="flex items-start gap-2 mb-2">
                                <button 
                                    onClick={() => {
                                        setSelectingAvatarFor({ type: 'player' });
                                        setShowImageLibrary(true);
                                    }}
                                    className="w-20 h-20 rounded-full bg-stone-300 dark:bg-slate-800 border-2 border-mystic-accent flex items-center justify-center shrink-0 shadow-lg overflow-hidden group relative"
                                >
                                    {activeWorld.player.avatar ? (
                                        <img src={activeWorld.player.avatar} alt={activeWorld.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <User size={40} className="text-mystic-accent" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Edit2 size={20} className="text-white" />
                                    </div>
                                </button>
                                <div>
                                    <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-1 font-mono text-[12px]">{activeWorld.player.name}</h3>
                                    <div className="flex gap-2 text-sm text-stone-500 dark:text-slate-400">
                                        <span className="bg-stone-300 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">{activeWorld.player.gender}</span>
                                        <span className="bg-stone-300 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">{activeWorld.player.age} tuổi</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Ngoại hình</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.appearance || "Chưa có mô tả ngoại hình."}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Tính cách</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.personality || "Chưa có mô tả tính cách."}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Tiểu sử & Xuất thân</h4>
                                    <MarkdownRenderer 
                                        className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed"
                                        content={activeWorld.player.background || "Chưa có tiểu sử."}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Kỹ năng</h4>
                                        <MarkdownRenderer 
                                            className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed h-full"
                                            content={activeWorld.player.skills || "Không có kỹ năng đặc biệt."}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-bold text-mystic-accent uppercase tracking-wider">Mục tiêu</h4>
                                        <MarkdownRenderer 
                                            className="text-sm text-stone-700 dark:text-slate-300 bg-stone-300 dark:bg-slate-800/50 p-1 rounded border border-stone-400 dark:border-slate-700/50 leading-relaxed h-full"
                                            content={activeWorld.player.goal || "Chưa xác định mục tiêu."}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        
        {/* GLOBAL INFO (LSR) MODAL (UPDATED) */}
        <AnimatePresence>
            {showGlobalModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full h-full rounded-none shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="p-2 border-b border-stone-400 dark:border-slate-800 flex justify-between items-center bg-stone-300 dark:bg-slate-900/50">
                            <h2 className="text-[12px] leading-[22px] font-bold text-green-600 dark:text-green-400 flex items-center gap-2">
                                <Database size={20}/> LSR Database (Trạng thái thế giới)
                            </h2>
                            <button onClick={() => setShowGlobalModal(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-2 overflow-y-auto custom-scrollbar space-y-2 bg-stone-200 dark:bg-mystic-900">
                            {lsrTables.length === 0 ? (
                                <div className="text-center text-stone-400 dark:text-slate-500 py-10">
                                    Không tìm thấy dữ liệu cấu trúc bảng LSR.
                                </div>
                            ) : (
                                <>
                                    {/* Tab Navigation / Dropdown */}
                                    <div className="mb-4">
                                        {isMobile ? (
                                            <div className="relative">
                                                <select 
                                                    value={activeLsrTableId || ''} 
                                                    onChange={(e) => setActiveLsrTableId(e.target.value)}
                                                    className="w-full p-2 bg-stone-300 dark:bg-slate-800 border border-stone-400 dark:border-slate-700 rounded-lg text-sm text-stone-800 dark:text-slate-200 outline-none appearance-none"
                                                >
                                                    {lsrTables.map(table => (
                                                        <option key={table.id} value={table.id}>{table.name}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
                                                    <ChevronDown size={16} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-2 border-b border-stone-400 dark:border-slate-800 pb-2">
                                                {lsrTables.map(table => (
                                                    <button
                                                        key={table.id}
                                                        onClick={() => {
                                                            setActiveLsrTableId(table.id);
                                                            if (table.id === '10' || table.id === '4') {
                                                                setLsrViewMode('timeline');
                                                            } else {
                                                                setLsrViewMode('table');
                                                            }
                                                        }}
                                                        className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all ${
                                                            activeLsrTableId === table.id
                                                            ? 'bg-mystic-accent text-mystic-950 shadow-[0_-2px_10px_rgba(56,189,248,0.3)]'
                                                            : 'bg-stone-300 dark:bg-slate-800 text-stone-500 dark:text-slate-400 hover:bg-stone-400 dark:hover:bg-slate-700'
                                                        }`}
                                                    >
                                                        {table.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Active Table Content */}
                                    {lsrTables.filter(t => t.id === activeLsrTableId).map((table) => {
                                        const currentRows = lsrRuntimeData[table.id] || [];
                                        return (
                                            <div key={table.id} className="space-y-1 animate-in fade-in duration-300">
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="bg-stone-300 dark:bg-slate-800 text-stone-500 dark:text-slate-400 text-xs font-bold px-1 py-0.5 rounded">#{table.id}</span>
                                                        <h3 className="text-[12px] leading-[18px] font-bold text-stone-800 dark:text-slate-200">{table.name}</h3>
                                                    </div>
                                                    <div className="flex bg-stone-300 dark:bg-slate-800 p-0.5 rounded-lg border border-stone-400 dark:border-slate-700 select-none">
                                                        <button 
                                                            onClick={() => setLsrViewMode('table')}
                                                            className={`px-2 py-1 outline-none text-xs font-medium rounded transition-all ${lsrViewMode === 'table' ? 'bg-mystic-accent text-mystic-950 shadow-sm' : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'}`}
                                                        >
                                                            Bảng
                                                        </button>
                                                        <button 
                                                            onClick={() => setLsrViewMode('timeline')}
                                                            className={`px-2 py-1 outline-none text-xs font-medium rounded transition-all ${lsrViewMode === 'timeline' ? 'bg-mystic-accent text-mystic-950 shadow-sm' : 'text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200'}`}
                                                        >
                                                            Timeline
                                                        </button>
                                                    </div>
                                                </div>

                                                {lsrViewMode === 'timeline' ? (
                                                    <div className="relative pl-4 border-l-2 border-stone-400 dark:border-slate-700 space-y-4 py-2 mt-2 ml-2">
                                                        {currentRows.length === 0 ? (
                                                            <div className="text-sm italic text-stone-500 dark:text-slate-500">(Chưa có sự kiện)</div>
                                                        ) : (
                                                            currentRows.map((row: any, rIdx: number) => {
                                                                const timeVal = row["0"] || "Unknown Time";
                                                                let secBadgeVal = "";
                                                                let titleVal = "";
                                                                let descVal = "";
                                                                
                                                                if (table.columns.length >= 4) {
                                                                    secBadgeVal = row["1"] || "";
                                                                    titleVal = row["2"] || "";
                                                                    descVal = row["3"] || "";
                                                                    for (let i = 4; i < table.columns.length; i++) {
                                                                        if (row[i.toString()]) {
                                                                            descVal += `\n[${table.columns[i]}]: ${row[i.toString()]}`;
                                                                        }
                                                                    }
                                                                } else if (table.columns.length === 3) {
                                                                    titleVal = row["1"] || "";
                                                                    descVal = row["2"] || "";
                                                                } else {
                                                                    titleVal = row["1"] || "";
                                                                    descVal = "";
                                                                }

                                                                return (
                                                                    <div key={rIdx} className="relative group w-full">
                                                                        <div className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-stone-200 dark:bg-mystic-900 border-2 border-mystic-accent z-10 shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                                                                        <div className="bg-stone-100 dark:bg-slate-800/60 p-3 rounded-lg border border-stone-300 dark:border-slate-700 shadow-sm group-hover:border-mystic-accent/50 group-hover:shadow-[0_4px_10px_rgba(0,0,0,0.1)] dark:group-hover:shadow-[0_4px_10px_rgba(56,189,248,0.05)] transition-all">
                                                                            <div className="flex flex-col sm:flex-row gap-2 mb-2 sm:items-center">
                                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-900 text-xs font-mono font-bold text-mystic-accent border border-slate-300 dark:border-slate-700 w-fit shrink-0">
                                                                                    <Clock size={12}/>
                                                                                    {timeVal}
                                                                                </span>
                                                                                {secBadgeVal && (
                                                                                    <span className="text-xs font-medium text-stone-500 dark:text-slate-400 px-2 py-0.5 rounded-full bg-stone-300/50 dark:bg-slate-800/80 border border-stone-300 dark:border-slate-700 w-fit shrink-0">
                                                                                        {table.columns[1]}: {secBadgeVal}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {titleVal && (
                                                                                <h4 className="text-sm font-bold text-stone-800 dark:text-slate-200 mb-1.5 leading-snug">
                                                                                    {titleVal}
                                                                                </h4>
                                                                            )}
                                                                            {descVal && (
                                                                                <p className="text-[13px] text-stone-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                                                                                    {descVal}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="overflow-x-auto rounded-lg border border-stone-400 dark:border-slate-700 shadow-sm">
                                                        <table className="w-full text-sm text-left text-stone-500 dark:text-slate-400">
                                                            <thead className="text-xs text-stone-700 dark:text-slate-300 uppercase bg-stone-300 dark:bg-slate-800">
                                                                <tr>
                                                                    {table.columns.map((col, idx) => (
                                                                        <th key={idx} scope="col" className="px-1 py-1 whitespace-nowrap border-r border-stone-400 dark:border-slate-700 last:border-r-0">
                                                                            {col}
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {currentRows.length === 0 ? (
                                                                    <tr className="bg-stone-200 dark:bg-slate-900/50 border-b border-stone-400 dark:border-slate-800 hover:bg-stone-300 dark:hover:bg-slate-800/30 transition-colors">
                                                                        <td colSpan={table.columns.length} className="px-1 py-1 border-r border-stone-400 dark:border-slate-800 last:border-r-0 italic text-stone-400 dark:text-slate-600 text-center">
                                                                            (Chưa có dữ liệu)
                                                                        </td>
                                                                    </tr>
                                                                ) : (
                                                                    currentRows.map((row, rIdx) => (
                                                                        <tr key={rIdx} className="bg-stone-200 dark:bg-slate-900/50 border-b border-stone-400 dark:border-slate-800 hover:bg-stone-300 dark:hover:bg-slate-800/30 transition-colors">
                                                                            {table.columns.map((_, cIdx) => (
                                                                                <td key={cIdx} className="px-1 py-1 border-r border-stone-400 dark:border-slate-800 last:border-r-0 text-stone-700 dark:text-slate-300">
                                                                                    {row[cIdx.toString()] || "-"}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {renderContextWindowModal()}

        <AnimatePresence>
            {tavoSelectState && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-100 dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh] border border-stone-300 dark:border-slate-700"
                    >
                        <div className="p-4 border-b border-stone-300 dark:border-slate-700 flex justify-between items-center bg-stone-200 dark:bg-slate-800">
                            <h3 className="font-bold text-stone-800 dark:text-slate-200">{tavoSelectState.title || 'Lựa chọn tavo'}</h3>
                            <button 
                                onClick={() => {
                                    tavoSelectState.resolve(null);
                                    setTavoSelectState(null);
                                }}
                                className="text-stone-500 hover:text-red-500 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {tavoSelectState.options.map((opt, i) => {
                                const val = typeof opt === 'string' ? opt : (opt.value !== undefined ? opt.value : opt.label);
                                const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
                                const isSelected = val === tavoSelectState.defaultValue;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            tavoSelectState.resolve(val);
                                            setTavoSelectState(null);
                                        }}
                                        className={`w-full text-left p-3 rounded-lg border flex flex-col gap-1 transition-all ${isSelected ? 'bg-mystic-accent/10 border-mystic-accent text-mystic-accent' : 'bg-white dark:bg-slate-800 border-stone-200 dark:border-slate-700 hover:border-mystic-accent/50 text-stone-700 dark:text-slate-300'}`}
                                    >
                                        <div className="font-medium text-sm flex items-center gap-2">
                                           {label}
                                        </div>
                                        {typeof opt === 'object' && opt.subtitle && <div className="text-xs text-stone-500 dark:text-slate-400 font-semibold">{opt.subtitle}</div>}
                                        {typeof opt === 'object' && opt.description && <div className="text-[10px] text-stone-400 dark:text-slate-500">{opt.description}</div>}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {selectedEntity && (
                <EntityDetailModal 
                    entity={selectedEntity} 
                    onClose={() => setSelectedEntity(null)} 
                    onUpdateAvatar={(id) => {
                        setSelectingAvatarFor({ type: 'entity', id });
                        setShowImageLibrary(true);
                    }}
                />
            )}
        </AnimatePresence>

        {/* Image Library Modal */}
        <ImageLibraryModal 
            isOpen={showImageLibrary}
            onClose={() => {
                setShowImageLibrary(false);
                setSelectingAvatarFor(null);
            }}
            onSelect={handleAvatarSelect}
            selectedId={selectingAvatarFor?.type === 'player' ? activeWorld.player.avatar : activeWorld.entities.find(e => e.id === selectingAvatarFor?.id)?.avatar}
        />

        {/* Log Console Modal */}
        <AnimatePresence>
            {showLogConsole && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-full max-w-4xl h-[80vh]"
                    >
                        <LogConsole onClose={() => setShowLogConsole(false)} />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </div>
  );
};

export default GameplayScreen;
