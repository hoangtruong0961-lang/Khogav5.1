
import { AppSettings, ChatMessage, WorldData, TawaPresetConfig, GameTime } from "../../../types";
import { buildGameplaySystemPrompt, getReinforcementInstruction } from "./prompts";
import { DEFAULT_PRESET_CONFIG } from "../../../constants/tawa_modules";
import { getAiClient } from "../client";
import { GenerateContentResponse } from "@google/genai";
import { vectorService } from "../vectorService";
import { LsrParser } from "../../lsr/LsrParser";
import { ContextCompressor } from "../../../utils/compression";
import { getRegexedString } from "../../../utils/regex";

// Task 3.3 Step 2: History Slicing Constant
// Default to 100 as requested by user
const MAX_HISTORY_CONTEXT = 100;
const EMBEDDING_SCHEDULE_INTERVAL = 50;

export const gameplayAiService = {
  // --- GAMEPLAY STORY GENERATION (With Tawa Protocol) ---

  async generateStoryTurn(
    input: string, 
    history: ChatMessage[], 
    worldData: WorldData, 
    settings: AppSettings,
    presetConfig?: TawaPresetConfig,
    gameTime?: GameTime 
  ): Promise<{ text: string, usage?: Record<string, unknown> }> {
    try {
        const currentTurn = Math.floor(history.length / 2);
        
        const combinedRegexScripts = [
            ...(settings.regex_scripts || []),
            ...(worldData.extensions?.regex_scripts || []),
            ...(worldData.config?.regexScripts || [])
        ];

        const applyRegex = (text: string, placement: number, depth: number) => {
            return getRegexedString(text, placement, combinedRegexScripts, {
                userName: worldData.player?.name || 'User',
                charName: worldData.entities?.[0]?.name || 'Character',
                isPrompt: true,
                depth,
                isDebug: false
            });
        };

        // --- COMPRESSION: Clean user input, then apply regex ---
        let cleanedInput = ContextCompressor.cleanText(input);
        cleanedInput = applyRegex(cleanedInput, 1, 0);

        // Task 3.3 Step 1: Vector Search (RAG)
        // Find relevant memories from the distant past - ONLY EVERY X TURNS to save API quota
        // OPTIMIZATION: Only search if history is longer than context window, otherwise it's redundant
        const shouldCallEmbedding = settings.enableVectorMemory && currentTurn > 0 && currentTurn % EMBEDDING_SCHEDULE_INTERVAL === 0;
        const shouldSearchEmbedding = shouldCallEmbedding && history.length >= MAX_HISTORY_CONTEXT;
        
        const similarVectors = shouldSearchEmbedding 
            ? await vectorService.searchSimilarVectors(cleanedInput, settings, 5)
            : [];
        
        const relevantMemories = similarVectors
            .map(v => `[${new Date(v.timestamp).toLocaleString()}] ${v.role === 'user' ? 'User' : 'AI'}: ${v.text}`)
            .join('\n\n');

        // Task 3.3 Step 2: Slice History
        // Use user-defined history count or fallback to default
        const historyCount = worldData.config.contextConfig?.recentHistoryCount || MAX_HISTORY_CONTEXT;
        const slicedHistory = history.slice(-historyCount);

        // --- COMPRESSION: Clean History (Safe compression only) ---
        const compressedHistory = slicedHistory.map((msg, index) => {
            const depth = slicedHistory.length - index; // depth relative to current message
            const placementVal = msg.role === 'model' || msg.role === 'system' ? 2 : 1;
            let processedText = ContextCompressor.cleanText(msg.text);
            processedText = applyRegex(processedText, placementVal, depth);
            
            return {
                ...msg,
                text: processedText
            };
        });

        // Task: Relevance-based Entity Sorting (Prioritizing Female NPCs)
        const maxEntities = worldData.config.contextConfig?.maxEntities || 20;
        
        // Simple relevance scoring: Check if entity name appears in recent history or current input
        const recentText = [...compressedHistory.map(m => m.text), cleanedInput].join(' ').toLowerCase();
        
        const sortedEntities = [...worldData.entities].sort((a, b) => {
            const aMentioned = recentText.includes(a.name.toLowerCase()) ? 1 : 0;
            const bMentioned = recentText.includes(b.name.toLowerCase()) ? 1 : 0;
            
            // Priority 1: Mentioned in recent context
            if (aMentioned !== bMentioned) return bMentioned - aMentioned;
            
            // Priority 2: Gender Priority (Female first)
            const aIsFemale = a.gender === 'Nữ' || a.description?.toLowerCase().includes('nữ') || a.description?.toLowerCase().includes('female') ? 1 : 0;
            const bIsFemale = b.gender === 'Nữ' || b.description?.toLowerCase().includes('nữ') || b.description?.toLowerCase().includes('female') ? 1 : 0;
            if (aIsFemale !== bIsFemale) return bIsFemale - aIsFemale;

            // Priority 3: NPCs over Items
            if (a.type !== b.type) {
                if (a.type === 'NPC') return -1;
                if (b.type === 'NPC') return 1;
            }
            
            return 0;
        });

        const processedEntities = limitedEntities.map(e => {
            if (!e.description) return e;
            return {
                ...e,
                description: applyRegex(e.description, 5, 0)
            };
        });

        // Task: Stringify LSR Data for AI
        const lsrTables = LsrParser.parseDefinitions();
        let tableDataString = worldData.lsrData 
            ? LsrParser.stringifyLsrData(worldData.lsrData, lsrTables)
            : "";
        
        // --- COMPRESSION: Minify LSR Data ---
        tableDataString = ContextCompressor.minifyLsr(tableDataString);
        tableDataString = applyRegex(tableDataString, 6, 0);

        // Use provided config or fallback to default
        const activeConfig = presetConfig || DEFAULT_PRESET_CONFIG;

        let processedLorebook = undefined;
        if (worldData.lorebook) {
            processedLorebook = { ...worldData.lorebook, entries: { ...worldData.lorebook.entries } };
            // Apply placement 5 (World Book) to custom lorebook
            Object.keys(processedLorebook.entries).forEach(key => {
                processedLorebook.entries[key] = {
                    ...processedLorebook.entries[key],
                    content: applyRegex(processedLorebook.entries[key].content, 5, 0)
                };
            });
        }

        const systemInstruction = buildGameplaySystemPrompt(
          worldData.world,
          worldData.player,
          processedEntities, // Detailed list (limited & regex processed)
          worldData.entities, // Full list (minimalist)
          relevantMemories, // Task 3.3 Step 3: Inject Memories
          currentTurn,
          activeConfig, 
          worldData.config,
          settings, // NEW: Pass settings
          gameTime,
          cleanedInput,
          worldData.summary ? applyRegex(ContextCompressor.cleanText(worldData.summary), 5, 0) : undefined, // Apply placement 5 to summary
          tableDataString, // NEW: Pass LSR data
          processedLorebook, // Pass Regexed Lorebook
          history, // NEW: Pass Recent Chat History
          worldData.tavoVars || {} // Tavo Vars
        );

        // 2. Prepare Config
        // Determine effective proxy and model
        let activeProxy = settings.proxies?.find(p => p.id === settings.activeProxyId);
        if (!activeProxy && (settings.proxyEnabled || settings.proxyUrl)) {
            activeProxy = {
                id: 'legacy',
                name: settings.proxyName || 'Legacy Proxy',
                url: settings.proxyUrl || '',
                key: settings.proxyKey || '',
                model: settings.proxyModel || '',
                models: settings.proxyModels || [],
                isActive: true,
                type: (settings.proxyUrl?.includes('moonshot') || settings.proxyUrl?.includes('kimi')) ? 'openai' : (settings.proxyEnabled ? 'openai' : 'google')
            };
        }

        const modelToUse = (activeProxy && activeProxy.model) 
            ? activeProxy.model 
            : settings.aiModel;

        const generationConfig: Record<string, unknown> = {
            temperature: activeConfig.aiConfigOverrides?.temperature,
            topK: activeConfig.aiConfigOverrides?.topK,
            topP: activeConfig.aiConfigOverrides?.topP,
            maxOutputTokens: activeConfig.aiConfigOverrides?.maxOutputTokens ?? 65000,
            frequencyPenalty: activeConfig.aiConfigOverrides?.frequencyPenalty,
            presencePenalty: activeConfig.aiConfigOverrides?.presencePenalty,
            repetitionPenalty: activeConfig.aiConfigOverrides?.repetitionPenalty,
            minP: activeConfig.aiConfigOverrides?.minP,
            topA: activeConfig.aiConfigOverrides?.topA,
        };

        // Apply Thinking Config from Preset
        const thinkingBudget = activeConfig.aiConfigOverrides?.thinkingBudget ?? 0;
        // Apply budget if > 0 and model seems to support it (pro or thinking models)
        const lowerModel = modelToUse.toLowerCase();
        const isThinkingModel = lowerModel.includes('pro') || 
                                lowerModel.includes('thinking') || 
                                lowerModel.includes('kimi') || 
                                lowerModel.includes('moonshot') ||
                                lowerModel.includes('o1') ||
                                lowerModel.includes('o3');
        if (thinkingBudget > 0 && isThinkingModel) {
            (generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudgetTokens: thinkingBudget };
        }

        // 3. Prepare Contents (Using compressed history)
        const contents = compressedHistory.map(msg => {
            let text = msg.text;
            if (msg.role === 'user' && !text.includes('<user_input>')) {
                text = `<user_input>${text}</user_input>`;
            }
            return {
                role: msg.role,
                parts: [{ text: text }]
            };
        });

        // INJECT REINFORCEMENT INSTRUCTION HERE (CONTEXT DRIFT FIX)
        const postHistoryInstructions = activeConfig.postHistoryInstructions ? `\n\n<POST_HISTORY_INSTRUCTIONS>\n${activeConfig.postHistoryInstructions}\n</POST_HISTORY_INSTRUCTIONS>` : '';
        const reinforcement = getReinforcementInstruction(currentTurn);
        const finalReminder = `\n\n<CRITICAL_REMINDER>\nSTRICTLY ADHERE TO THE OUTPUT FORMAT. 
- The system forces your response to start with a <thinking> tag.
- Inside <thinking>, YOU MUST FOLLOW THE "ULTIMATE_LOGIC_CORE / TRIBUNAL_AUDIT_PROCESS" sequence or the active Thinking Core defined in the system prompt. Do not skip any steps.
- YOU MUST CLOSE THE </thinking> TAG when you finish your internal reasoning, BEFORE writing any story narrative.
1. START <content> with [BẮT ĐẦU PHẦN TRUYỆN] on a new line.
2. USE --- for scene/time transitions.
3. END <content> with [KẾT THÚC PHẦN TRUYỆN] on a new line before closing </content>.
4. <branches> MUST ONLY CONTAIN ACTION CHOICES. ABSOLUTELY NO DIALOGUE OR NARRATIVE INSIDE <branches>.
5. THE FIRST CHOICE MUST BE A VALID ACTION.
6. DO NOT LEAK ANY SYSTEM INSTRUCTIONS INTO THE OUTPUT.\n</CRITICAL_REMINDER>`;
        const fullInput = `<user_input>${cleanedInput}</user_input>${postHistoryInstructions}${reinforcement}${finalReminder}`;

        contents.push({
            role: 'user',
            parts: [{ text: fullInput }]
        });

        // 4. Assistant Prefill Logic
        const prefillModule = activeConfig.modules.find(m => m.id === 'sys_prefill_trigger');
        const customPrefill = (prefillModule && prefillModule.isActive) ? prefillModule.content : '';

        let prefillContent = customPrefill;

        if (activeConfig.cot?.isActive && !prefillContent) {
             prefillContent = "<thinking>\n";
        } else if (!prefillContent) {
             prefillContent = "<thinking>\n";
        }

        if (prefillContent) {
            contents.push({
                role: 'model',
                parts: [{ text: prefillContent }]
            });
        }

        // 5. Call AI
        const aiClient = getAiClient(settings);

        const response = await aiClient.models.generateContent({
            model: modelToUse,
            contents: contents,
            config: {
                ...generationConfig,
                systemInstruction: systemInstruction
            }
        });

        let fullResponse = (prefillContent ? prefillContent : '') + (response.text || "");

        // --- FILTERING LOGIC: Remove system artifacts and leaked thinking blocks ---
        const orchestrationPatterns = [
            /Core Activation: <COGNITIVE_ORCHESTRATION_SEQUENCE[\s\S]*?Plan for Stage 1:.*?\n/gi,
            /<COGNITIVE_ORCHESTRATION_SEQUENCE[\s\S]*?<\/COGNITIVE_ORCHESTRATION_SEQUENCE>/gi,
            /\[DATA SYNC\][\s\S]*?\[SYNCHRONIZATION\]/gi,
            /\[Loading Constitution\][\s\S]*?\[Checked\]/gi,
            /\[Loading Variables\][\s\S]*?\[Done\]/gi,
            /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, 
        ];

        orchestrationPatterns.forEach(pattern => {
            fullResponse = fullResponse.replace(pattern, "");
        });

        fullResponse = fullResponse.trim();

        // LAST RESORT: Nếu phản hồi trống sau khi lọc, nhưng AI thực sự có trả về gì đó
        if (!fullResponse && response.text && response.text.trim().length > 0) {
            // Thử lấy lại văn bản gốc nhưng bỏ qua các thẻ kỹ thuật rõ ràng nhất
            fullResponse = response.text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
        }

        if (prefillContent && !fullResponse.startsWith(prefillContent)) {
            fullResponse = prefillContent + fullResponse;
        }

        // Task 3.3 Step 4: Save Vectors Async (Fire and forget) - ONLY EVERY X TURNS
        if (shouldCallEmbedding) {
            (async () => {
                 const userMsgId = `msg-${Date.now()}-user`;
                 const aiMsgId = `msg-${Date.now() + 1}-model`;
                 await vectorService.saveVector(userMsgId, cleanedInput, 'user', settings);
                 if (fullResponse) {
                     await vectorService.saveVector(aiMsgId, fullResponse, 'model', settings);
                 }
            })();
        }

        return { 
            text: fullResponse || "Hệ thống không phản hồi. Vui lòng thử lại.", 
            usage: response.usageMetadata 
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let userFriendlyMessage = `[LỖI HỆ THỐNG: Không thể nhận phản hồi từ AI. Chi tiết: ${errorMessage}]`;
        
        if (errorMessage.toLowerCase().includes('safety') || errorMessage.toLowerCase().includes('blocked')) {
            userFriendlyMessage = `[CẢNH BÁO AN TOÀN: Phản hồi của AI đã bị chặn bởi bộ lọc nội dung của Google. Điều này thường xảy ra khi nội dung truyện quá nhạy cảm hoặc vi phạm chính sách. Bạn có thể thử 'Regenerate' với hành động khác hoặc điều chỉnh 'Safety Settings' trong phần Cài đặt.]`;
        } else if (errorMessage.includes('PAYMENT_REQUIRED') || errorMessage.includes('402')) {
            userFriendlyMessage = `[LỖI THANH TOÁN (402): Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng vào Cài đặt > API & Proxy để chọn API Key mới bằng nút 'Chọn API Key (Paid)'.]`;
        } else if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
            userFriendlyMessage = `[GIỚI HẠN LƯU LƯỢNG: Bạn đã đạt giới hạn yêu cầu của AI. Vui lòng đợi một lát rồi thử lại.]`;
        } else if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
            userFriendlyMessage = `[LỖI MODEL (404): Không tìm thấy Model AI yêu cầu. Vui lòng kiểm tra lại tên Model trong phần Cài đặt AI & Proxy. Nếu dùng Proxy, hãy thử 'Tải danh sách Model' lại.]`;
        }

        return { 
            text: `<span style="color: #ef4444; font-style: italic; font-size: 0.875rem;">${userFriendlyMessage}</span>`,
            usage: null
        };
    }
  },

  // --- STREAMING STORY GENERATION ---
  async *generateStoryTurnStream(
    input: string, 
    history: ChatMessage[], 
    worldData: WorldData, 
    settings: AppSettings,
    presetConfig?: TawaPresetConfig,
    gameTime?: GameTime
  ): AsyncGenerator<GenerateContentResponse | string, void, unknown> {
    try {
        const currentTurn = Math.floor(history.length / 2);
        const activeConfig = presetConfig || DEFAULT_PRESET_CONFIG;

        const combinedRegexScripts = [
            ...(settings.regex_scripts || []),
            ...(worldData.extensions?.regex_scripts || []),
            ...(worldData.config?.regexScripts || [])
        ];

        const applyRegex = (text: string, placement: number, depth: number) => {
            return getRegexedString(text, placement, combinedRegexScripts, {
                userName: worldData.player?.name || 'User',
                charName: worldData.entities?.[0]?.name || 'Character',
                isPrompt: true,
                depth,
                isDebug: false
            });
        };

        // --- COMPRESSION: Clean user input ---
        let cleanedInput = ContextCompressor.cleanText(input);
        cleanedInput = applyRegex(cleanedInput, 1, 0);

        // Task 3.3 Step 1: Vector Search (RAG) - ONLY EVERY X TURNS
        // OPTIMIZATION: Only search if history is longer than context window, otherwise it's redundant
        const shouldCallEmbeddingStream = settings.enableVectorMemory && currentTurn > 0 && currentTurn % EMBEDDING_SCHEDULE_INTERVAL === 0;
        const shouldSearchEmbeddingStream = shouldCallEmbeddingStream && history.length >= MAX_HISTORY_CONTEXT;
        
        const similarVectors = shouldSearchEmbeddingStream 
            ? await vectorService.searchSimilarVectors(cleanedInput, settings, 5)
            : [];
            
        const relevantMemories = similarVectors
            .map(v => `[${new Date(v.timestamp).toLocaleString()}] ${v.role === 'user' ? 'User' : 'AI'}: ${v.text}`)
            .join('\n\n');

        // Task 3.3 Step 2: Slice History
        const historyCount = worldData.config.contextConfig?.recentHistoryCount || MAX_HISTORY_CONTEXT;
        const slicedHistory = history.slice(-historyCount);

        // --- COMPRESSION: Clean History (Safe compression only) ---
        const compressedHistory = slicedHistory.map((msg, index) => {
            const depth = slicedHistory.length - index; // depth relative to current message
            const placementVal = msg.role === 'model' || msg.role === 'system' ? 2 : 1;
            let processedText = ContextCompressor.cleanText(msg.text);
            processedText = applyRegex(processedText, placementVal, depth);
            
            return {
                ...msg,
                text: processedText
            };
        });

        // Task: Relevance-based Entity Sorting (Prioritizing Female NPCs)
        const maxEntities = worldData.config.contextConfig?.maxEntities || 20;
        
        // Simple relevance scoring: Check if entity name appears in recent history or current input
        const recentText = [...compressedHistory.map(m => m.text), cleanedInput].join(' ').toLowerCase();
        
        const sortedEntities = [...worldData.entities].sort((a, b) => {
            const aMentioned = recentText.includes(a.name.toLowerCase()) ? 1 : 0;
            const bMentioned = recentText.includes(b.name.toLowerCase()) ? 1 : 0;
            
            // Priority 1: Mentioned in recent context
            if (aMentioned !== bMentioned) return bMentioned - aMentioned;
            
            // Priority 2: Gender Priority (Female first)
            const aIsFemale = a.gender === 'Nữ' || a.description?.toLowerCase().includes('nữ') || a.description?.toLowerCase().includes('female') ? 1 : 0;
            const bIsFemale = b.gender === 'Nữ' || b.description?.toLowerCase().includes('nữ') || b.description?.toLowerCase().includes('female') ? 1 : 0;
            if (aIsFemale !== bIsFemale) return bIsFemale - aIsFemale;

            // Priority 3: NPCs over Items
            if (a.type !== b.type) {
                if (a.type === 'NPC') return -1;
                if (b.type === 'NPC') return 1;
            }
            
            return 0; // Keep original order for the rest
        });

        const limitedEntities = sortedEntities.slice(0, maxEntities);

        // Task: Stringify LSR Data for AI
        const lsrTables = LsrParser.parseDefinitions();
        let tableDataString = worldData.lsrData 
            ? LsrParser.stringifyLsrData(worldData.lsrData, lsrTables)
            : "";
        
        // --- COMPRESSION: Minify LSR Data ---
        tableDataString = ContextCompressor.minifyLsr(tableDataString);

        let processedLorebook = undefined;
        if (worldData.lorebook) {
            processedLorebook = { ...worldData.lorebook, entries: { ...worldData.lorebook.entries } };
            Object.keys(processedLorebook.entries).forEach(key => {
                processedLorebook.entries[key] = {
                    ...processedLorebook.entries[key],
                    content: applyRegex(processedLorebook.entries[key].content, 5, 0)
                };
            });
        }

        const systemInstruction = buildGameplaySystemPrompt(
          worldData.world,
          worldData.player,
          limitedEntities, // Inject Memories
          worldData.entities, // Full list (minimalist)
          relevantMemories, // Inject Memories
          currentTurn,
          activeConfig, 
          worldData.config,
          settings, // NEW: Pass settings
          gameTime,
          cleanedInput,
          worldData.summary ? ContextCompressor.cleanText(worldData.summary) : undefined, // CLEANED: Safe compression
          tableDataString, // NEW: Pass LSR data
          processedLorebook, // NEW: Pass Regexed Lorebook
          history, // Pass history for dryRun
          worldData.tavoVars || {} // Pass tavoVars
        );

        // Determine effective proxy and model
        let activeProxy = settings.proxies?.find(p => p.id === settings.activeProxyId);
        if (!activeProxy && (settings.proxyEnabled || settings.proxyUrl)) {
            activeProxy = {
                id: 'legacy',
                name: settings.proxyName || 'Legacy Proxy',
                url: settings.proxyUrl || '',
                key: settings.proxyKey || '',
                model: settings.proxyModel || '',
                models: settings.proxyModels || [],
                isActive: true,
                type: (settings.proxyUrl?.includes('moonshot') || settings.proxyUrl?.includes('kimi')) ? 'openai' : (settings.proxyEnabled ? 'openai' : 'google')
            };
        }

        const modelToUse = (activeProxy && activeProxy.model) 
            ? activeProxy.model 
            : settings.aiModel;

        const generationConfig: Record<string, unknown> = {
            temperature: activeConfig.aiConfigOverrides?.temperature,
            topK: activeConfig.aiConfigOverrides?.topK,
            topP: activeConfig.aiConfigOverrides?.topP,
            maxOutputTokens: activeConfig.aiConfigOverrides?.maxOutputTokens ?? 65000,
            frequencyPenalty: activeConfig.aiConfigOverrides?.frequencyPenalty,
            presencePenalty: activeConfig.aiConfigOverrides?.presencePenalty,
            repetitionPenalty: activeConfig.aiConfigOverrides?.repetitionPenalty,
            minP: activeConfig.aiConfigOverrides?.minP,
            topA: activeConfig.aiConfigOverrides?.topA,
        };

        // Apply Thinking Config from Preset
        const thinkingBudget = activeConfig.aiConfigOverrides?.thinkingBudget ?? 0;
        const lowerModel = modelToUse.toLowerCase();
        const isThinkingModel = lowerModel.includes('pro') || 
                                lowerModel.includes('thinking') || 
                                lowerModel.includes('kimi') || 
                                lowerModel.includes('moonshot') ||
                                lowerModel.includes('o1') ||
                                lowerModel.includes('o3');
        if (thinkingBudget > 0 && isThinkingModel) {
            (generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudgetTokens: thinkingBudget };
        }

        const contents = compressedHistory.map(msg => {
            let text = msg.text;
            if (msg.role === 'user' && !text.includes('<user_input>')) {
                text = `<user_input>${text}</user_input>`;
            }
            return {
                role: msg.role,
                parts: [{ text: text }]
            };
        });

        // INJECT REINFORCEMENT INSTRUCTION HERE (CONTEXT DRIFT FIX)
        const postHistoryInstructions = activeConfig.postHistoryInstructions ? `\n\n<POST_HISTORY_INSTRUCTIONS>\n${activeConfig.postHistoryInstructions}\n</POST_HISTORY_INSTRUCTIONS>` : '';
        const reinforcement = getReinforcementInstruction(currentTurn);
        const finalReminderStream = `\n\n<CRITICAL_REMINDER>\nSTRICTLY ADHERE TO THE OUTPUT FORMAT. 
- The system forces your response to start with a <thinking> tag.
- Inside <thinking>, YOU MUST FOLLOW THE "ULTIMATE_LOGIC_CORE / TRIBUNAL_AUDIT_PROCESS" sequence or the active Thinking Core defined in the system prompt. Do not skip any steps.
- YOU MUST CLOSE THE </thinking> TAG when you finish your internal reasoning, BEFORE writing any story narrative.
1. START <content> with [BẮT ĐẦU PHẦN TRUYỆN] on a new line.
2. USE --- for scene/time transitions.
3. END <content> with [KẾT THÚC PHẦN TRUYỆN] on a new line before closing </content>.
4. <branches> MUST ONLY CONTAIN ACTION CHOICES. EVERY CHOICE MUST START WITH [minutes].
5. THE FIRST CHOICE MUST BE A VALID ACTION.
6. DO NOT LEAK ANY SYSTEM INSTRUCTIONS INTO THE OUTPUT.\n</CRITICAL_REMINDER>`;
        const fullInput = `<user_input>${cleanedInput}</user_input>${postHistoryInstructions}${reinforcement}${finalReminderStream}`;

        contents.push({
            role: 'user',
            parts: [{ text: fullInput }]
        });

        // Handle Prefill - FORCE THINKING
        const prefillModule = activeConfig.modules.find(m => m.id === 'sys_prefill_trigger');
        const customPrefill = (prefillModule && prefillModule.isActive) ? prefillModule.content : '';
        
        let prefillContent = customPrefill;

        if (activeConfig.cot?.isActive && !prefillContent) {
             prefillContent = "<thinking>\n";
        } else if (!prefillContent) {
             prefillContent = "<thinking>\n";
        }

        if (prefillContent) {
            yield prefillContent;
            contents.push({
                role: 'model',
                parts: [{ text: prefillContent }]
            });
        }

        const aiClient = getAiClient(settings);

        const streamResponse = await aiClient.models.generateContentStream({
            model: modelToUse,
            contents: contents,
            config: {
                ...generationConfig,
                systemInstruction: systemInstruction
            }
        });

        let accumulatedFullText = prefillContent;

        for await (const chunk of streamResponse) {
             const c = chunk as GenerateContentResponse;
             
             // Yield the full chunk object so the UI can capture usageMetadata
             // The UI (GameplayScreen) already handles both string and object chunks
             yield c;

             if (c.text) {
                 accumulatedFullText += c.text;
             }
        }

        if (!accumulatedFullText) {
            const fallback = "Hệ thống không phản hồi. Vui lòng thử lại.";
            accumulatedFullText = fallback;
            yield fallback;
        }

        // Task 3.3 Step 4: Save Vectors Async after stream completes - ONLY EVERY X TURNS
        if (shouldCallEmbeddingStream) {
            (async () => {
                 const userMsgId = `msg-${Date.now()}-user`;
                 const aiMsgId = `msg-${Date.now() + 1}-model`;
                 await vectorService.saveVector(userMsgId, cleanedInput, 'user', settings);
                 if (accumulatedFullText) {
                     await vectorService.saveVector(aiMsgId, accumulatedFullText, 'model', settings);
                 }
            })();
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('PAYMENT_REQUIRED') || errorMessage.includes('402')) {
            yield `<span style="color: #ef4444;">[LỖI THANH TOÁN (402): Model này yêu cầu API Key có trả phí (Paid Tier) hoặc đã hết hạn mức miễn phí. Vui lòng vào Cài đặt > API & Proxy để chọn API Key mới bằng nút 'Chọn API Key (Paid)'.]</span>`;
        } else if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
            yield `<span style="color: #ef4444;">[LỖI MODEL (404): Không tìm thấy Model AI. Vui lòng kiểm tra lại Cài đặt AI & Proxy.]</span>`;
        } else if (errorMessage.toLowerCase().includes('safety') || errorMessage.toLowerCase().includes('blocked')) {
            yield `<span style="color: #ef4444;">[CẢNH BÁO AN TOÀN: Phản hồi của AI đã bị chặn bởi bộ lọc nội dung. Bạn có thể thử 'Regenerate' hoặc điều chỉnh 'Safety Settings' trong Cài đặt.]</span>`;
        } else {
            yield `<span style="color: #ef4444;">[LỖI HỆ THỐNG: ${errorMessage}]</span>`;
        }
    }
  },

};
