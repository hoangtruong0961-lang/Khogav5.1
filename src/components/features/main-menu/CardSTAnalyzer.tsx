
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, Shield, AlertCircle, CheckCircle2, Image as ImageIcon, Sparkles, Wand2, Globe, RefreshCw, Trash2 } from 'lucide-react';
import Button from '../../ui/Button';
import { WorldData, PlayerProfile, GameConfig, NarrativePerspective, AppSettings, Entity } from '../../../types';
import { getAiClient } from '../../../services/ai/client';
import { dbService } from '../../../services/db/indexedDB';
import { extractJson } from '../../../utils/regex';

interface CardSTAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameStart?: (data: WorldData) => void;
  settings?: AppSettings;
}

type AnalysisMode = 'sillytavern' | 'creative';

const STORAGE_KEY = 'ark_v1_st_analyzer_temp';

const DEFAULT_CONFIG: GameConfig = {
  difficulty: { id: 'normal', label: 'Bình thường', prompt: 'Độ khó trung bình.' },
  outputLength: { id: 'medium', label: 'Vừa phải', minWords: 150, maxWords: 400 },
  rules: [
    "Sử dụng ngôn ngữ phong phú, giàu hình ảnh.",
    "Tập trung vào cảm xúc và phản ứng của nhân vật.",
    "Mô tả chi tiết môi trường xung quanh."
  ],
  perspective: 'second' as NarrativePerspective
};

const DEFAULT_PLAYER: PlayerProfile = {
  name: "Người chơi",
  gender: "Chưa xác định",
  age: "20",
  personality: "Tò mò, thích khám phá",
  background: "Một lữ khách vô tình lạc vào thế giới này",
  appearance: "Trang phục giản dị",
  skills: "Thích nghi nhanh",
  goal: "Khám phá bí ẩn của thế giới"
};

const AutoResizingTextarea: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}> = ({ value, onChange, placeholder, className, label }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <div className="flex flex-col w-full">
      {label && <label className="text-[8px] uppercase text-white/40 font-bold mb-1 block">{label}</label>}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={adjustHeight}
        placeholder={placeholder}
        className={`w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:border-emerald-500/50 outline-none resize-none overflow-hidden transition-all ${className}`}
        rows={1}
      />
    </div>
  );
};

interface STCharacterData {
  name?: string;
  char_name?: string;
  description?: string;
  char_persona?: string;
  personality?: string;
  age?: string;
  gender?: string;
  first_mes?: string;
  mes_example?: string;
  character_book?: {
    name?: string;
    description?: string;
    extensions?: any;
    entries: Array<{
      keys: string[];
      content: string;
      name?: string;
      extensions?: any;
      enabled?: boolean;
    }>;
  };
  alternate_greetings?: string[];
  [key: string]: any;
}

interface STMetadata {
  name: string;
  size: number;
  type: string;
}

const CardSTAnalyzer: React.FC<CardSTAnalyzerProps> = ({ isOpen, onClose, onGameStart, settings }) => {
  const [mode, setMode] = useState<AnalysisMode>('sillytavern');
  const [activeStTab, setActiveStTab] = useState<'info' | 'lorebook' | 'regex' | 'tools'>('info');
  const [isGeneratingGreeting, setIsGeneratingGreeting] = useState(false);
  const [files, setFiles] = useState<Record<AnalysisMode, File | null>>({ sillytavern: null, creative: null });
  const [previewUrls, setPreviewUrls] = useState<Record<AnalysisMode, string | null>>({ sillytavern: null, creative: null });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  
  const [results, setResults] = useState<Record<AnalysisMode, {
    success: boolean;
    data?: STCharacterData;
    creativeContent?: string;
    player?: PlayerProfile | null;
    npcs?: Entity[];
    metadata?: STMetadata;
    error?: string;
  } | null>>({
    sillytavern: null,
    creative: null
  });
  
  const currentResult = results[mode];
  const file = files[mode];
  const previewUrl = previewUrls[mode];

  const updatePlayerField = (field: keyof PlayerProfile, value: string) => {
    if (!currentResult?.success) return;
    setResults(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        player: { ...prev[mode].player, [field]: value }
      }
    }));
  };

  const updateNPCField = (index: number, field: keyof Entity, value: string) => {
    if (!currentResult?.success || !currentResult.npcs) return;
    const newNPCs = [...currentResult.npcs];
    newNPCs[index] = { ...newNPCs[index], [field]: value };
    setResults(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        npcs: newNPCs
      }
    }));
  };

  const updateCreativeContent = (value: string) => {
    if (mode !== 'creative' || !currentResult?.success) return;
    setResults(prev => ({
      ...prev,
      creative: {
        ...prev.creative,
        creativeContent: value
      }
    }));
  };

  const addManualNPC = () => {
    if (!currentResult?.success) return;
    const newNpc: Entity = {
      id: `manual_npc_${Date.now()}`,
      type: 'NPC',
      name: "Nhân vật mới",
      description: "Mô tả nhân vật",
      personality: "Tính cách",
      age: "",
      gender: ""
    };
    setResults(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        npcs: [...(prev[mode].npcs || []), newNpc]
      }
    }));
  };

  const removeNPC = (index: number) => {
    if (!currentResult?.success || !currentResult.npcs) return;
    setResults(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        npcs: currentResult.npcs!.filter((_, i) => i !== index)
      }
    }));
  };
  
  const stFileInputRef = useRef<HTMLInputElement>(null);
  const creativeFileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Load temporary data on mount
  useEffect(() => {
    const loadSavedData = async () => {
      const saved = await dbService.getAsset(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.results) {
            setResults(parsed.results);
          } else if (parsed.result) {
            // Migration from old format
            setResults(prev => ({ ...prev, [parsed.mode || 'sillytavern']: parsed.result }));
          }
          setMode(parsed.mode || 'sillytavern');
          if (parsed.previewUrls) {
            setPreviewUrls(parsed.previewUrls);
          } else if (parsed.previewUrl) {
            setPreviewUrls(prev => ({ ...prev, [parsed.mode || 'sillytavern']: parsed.previewUrl }));
          }
        } catch (e) {
          console.error("Failed to load saved ST data", e);
        }
      } else {
        // Fallback to localStorage for migration
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (parsed.results) setResults(parsed.results);
            setMode(parsed.mode || 'sillytavern');
            if (parsed.previewUrl) setPreviewUrl(parsed.previewUrl);
            // Migrate to IndexedDB
            await dbService.saveAsset(STORAGE_KEY, legacy);
            localStorage.removeItem(STORAGE_KEY);
          } catch (e) {
            console.error("Failed to migrate legacy ST data", e);
          }
        }
      }
    };
    loadSavedData();
  }, []);

  // Save temporary data when results change
  useEffect(() => {
    const saveData = async () => {
      const dataToSave = {
        results,
        mode,
        previewUrls: {
          sillytavern: previewUrls.sillytavern?.startsWith('data:image') ? previewUrls.sillytavern : null,
          creative: previewUrls.creative?.startsWith('data:image') ? previewUrls.creative : null
        }
      };
      await dbService.saveAsset(STORAGE_KEY, JSON.stringify(dataToSave));
    };
    saveData();
  }, [results, mode, previewUrls]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFiles(prev => ({ ...prev, [mode]: selectedFile }));
      setResults(prev => ({ ...prev, [mode]: null }));
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setPreviewUrls(prev => ({ ...prev, [mode]: url }));
        startAnalysis(selectedFile, url);
      };
      reader.readAsDataURL(selectedFile);
      // Reset value so the same file can be re-selected if needed
      e.target.value = '';
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          setResults(prev => ({
            ...prev,
            sillytavern: {
              success: true,
              data: parsed,
              metadata: {
                name: selectedFile.name,
                size: selectedFile.size,
                type: 'application/json'
              }
            }
          }));
          setMode('sillytavern');
        } catch {
          alert("Tệp JSON không hợp lệ.");
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const exportData = () => {
    if (!currentResult?.success) return;
    const dataToExport = mode === 'sillytavern' ? currentResult.data : { creativeContent: currentResult.creativeContent };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `st_export_${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Helper to decode UTF-8 Base64 correctly (fixing font/encoding issues)
  const decodeBase64UTF8 = (str: string) => {
    try {
      // Standard atob followed by escape/decodeURIComponent to handle multi-byte characters
      return decodeURIComponent(escape(atob(str)));
    } catch {
      try {
        // Fallback for some specific encodings
        return atob(str);
      } catch {
        return null;
      }
    }
  };

  const analyzeSillyTavern = useCallback(async (uint8Array: Uint8Array) => {
    let extractedData: any = null;

    // 1. Check if it's a PNG and look for chunks
    const isPng = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
    
    if (isPng) {
      let offset = 8;
      while (offset < uint8Array.length) {
        if (offset + 8 > uint8Array.length) break;
        const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        const type = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], uint8Array[offset + 6], uint8Array[offset + 7]);
        
        if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
          const chunkData = uint8Array.slice(offset + 8, offset + 8 + length);
          const textDecoder = new TextDecoder('utf-8');
          const decodedChunk = textDecoder.decode(chunkData);
          
          if (decodedChunk.includes('chara') || decodedChunk.includes('SillyTavern')) {
            const parts = decodedChunk.split('\0');
            const potentialData = parts[parts.length - 1];
            
            const parseData = (str: string) => {
              let parsed = JSON.parse(str);
              // Normalize V2/V3 Spec
              if (parsed.data && parsed.spec === 'chara_card_v2' || parsed.spec_version) {
                parsed = { ...parsed.data, original_spec: parsed.spec || parsed.spec_version };
              }
              return parsed;
            };

            try {
              extractedData = parseData(potentialData);
              break;
            } catch {
              const decodedBase64 = decodeBase64UTF8(potentialData);
              if (decodedBase64) {
                try {
                  extractedData = parseData(decodedBase64);
                  break;
                } catch { /* continue */ }
              }
            }
          }
        }
        
        offset += 12 + length;
        if (type === 'IEND') break;
      }
    }

    // 2. Fallback: Trailing Data
    if (!extractedData) {
      const textDecoder = new TextDecoder('utf-8');
      const tailSize = Math.min(uint8Array.length, 1024 * 1024);
      const tail = uint8Array.slice(uint8Array.length - tailSize);
      const tailText = textDecoder.decode(tail);
      
      const lastBraceIndex = tailText.lastIndexOf('}');
      const firstBraceIndex = tailText.lastIndexOf('{', lastBraceIndex);
      
      if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && firstBraceIndex < lastBraceIndex) {
        const potentialJson = tailText.substring(firstBraceIndex, lastBraceIndex + 1);
        try {
          let parsed = JSON.parse(potentialJson);
          if (parsed.data && (parsed.spec === 'chara_card_v2' || parsed.spec_version)) {
            parsed = { ...parsed.data, original_spec: parsed.spec || parsed.spec_version };
          }
          extractedData = parsed;
        } catch { /* failed */ }
      }
    }

    return extractedData;
  }, []);

  const analyzeCreativeWorld = useCallback(async (base64Image: string) => {
    const ai = getAiClient(settings);
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

    const model = (activeProxy && activeProxy.model) ? activeProxy.model : (settings?.aiModel || "gemini-3-flash-preview");
    
    const prompt = `Hãy phân tích hình ảnh này và sáng tạo ra một thế giới giả tưởng (World Building) cùng với các nhân vật chính dựa trên các chi tiết trong ảnh. 
    
    Yêu cầu trả về định dạng JSON với cấu trúc sau:
    {
      "worldContent": "Mô tả chi tiết thế giới (Tên, bối cảnh, chủng tộc, hệ thống sức mạnh, cốt truyện khởi đầu). Viết bằng tiếng Việt, phong cách văn chương, lôi cuốn.",
      "player": {
        "name": "Tên người chơi phù hợp bối cảnh",
        "gender": "Giới tính",
        "age": "Tuổi",
        "personality": "Tính cách",
        "background": "Tiểu sử",
        "appearance": "Ngoại hình",
        "skills": "Kỹ năng",
        "goal": "Mục tiêu"
      },
      "npcs": [
        {
          "name": "Tên NPC",
          "type": "NPC",
          "description": "Mô tả ngoại hình và vai trò",
          "personality": "Tính cách và thái độ",
          "age": "Tuổi",
          "gender": "Giới tính"
        }
      ]
    }
    
    Lưu ý: Tạo từ 2-4 NPC quan trọng.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: file?.type || "image/png",
                data: base64Image.split(',')[1]
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text;
    const parsed = extractJson<any>(responseText);
    if (!parsed) {
      throw new Error("Cannot parse JSON from model response.");
    }
    return parsed;
  }, [settings, file?.type]);

  const startAnalysis = useCallback(async (overrideFile?: File, overrideUrl?: string) => {
    const activeFile = overrideFile || file;
    const activeUrl = overrideUrl || previewUrl;
    
    if (!activeFile || !activeUrl) return;
    
    setIsAnalyzing(true);
    setStep(1);
    setResults(prev => ({ ...prev, [mode]: null }));
    
    try {
      if (mode === 'sillytavern') {
        const arrayBuffer = await activeFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const data = await analyzeSillyTavern(uint8Array);
        
        if (data) {
          setResults(prev => ({
            ...prev,
            sillytavern: {
              success: true,
              data,
              metadata: { name: activeFile.name, size: activeFile.size, type: activeFile.type },
              player: null,
              npcs: []
            }
          }));
        } else {
          setResults(prev => ({
            ...prev,
            sillytavern: {
              success: false,
              error: "Không tìm thấy dữ liệu nhân vật SillyTavern trong ảnh này.",
              metadata: { name: activeFile.name, size: activeFile.size, type: activeFile.type }
            }
          }));
        }
      } else {
        const result = await analyzeCreativeWorld(activeUrl);
        setResults(prev => ({
          ...prev,
          creative: {
            success: true,
            creativeContent: result.worldContent,
            metadata: { name: activeFile.name, size: activeFile.size, type: activeFile.type },
            player: result.player,
            npcs: result.npcs?.map((n: Entity, i: number) => ({ ...n, id: `gen_npc_${i}_${Date.now()}` })) || []
          }
        }));
      }
    } catch {
      console.error("Analysis error: Failed to process image");
      setResults(prev => ({
        ...prev,
        [mode]: {
          success: false,
          error: "Lỗi trong quá trình xử lý. Vui lòng kiểm tra kết nối hoặc tệp tin.",
        }
      }));
    } finally {
      setIsAnalyzing(false);
    }
  }, [file, previewUrl, mode, analyzeCreativeWorld, analyzeSillyTavern]);

  useEffect(() => {
    if (previewUrl && !results[mode] && !isAnalyzing) {
      startAnalysis();
    }
  }, [mode, previewUrl, results, isAnalyzing, startAnalysis]);

  const generateCharacters = async () => {
    if (!currentResult?.success) return;
    
    setIsGeneratingCharacters(true);
    setStep(2);
    
    try {
      const ai = getAiClient(settings);
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

      const model = (activeProxy && activeProxy.model) ? activeProxy.model : (settings?.aiModel || "gemini-3-flash-preview");
      
      let context = "";
      if (mode === 'sillytavern') {
        context = `Dữ liệu nhân vật SillyTavern: ${JSON.stringify(currentResult.data)}`;
      } else {
        context = `Bối cảnh thế giới: ${currentResult.creativeContent}`;
      }

      const prompt = `Dựa trên bối cảnh/nhân vật sau đây, hãy tạo ra hồ sơ cho người chơi (PC) và một danh sách các nhân vật phụ (NPC) quan trọng.
      
      Bối cảnh: ${context}
      
      Yêu cầu:
      1. Tạo 1 hồ sơ người chơi (PC) phù hợp với thế giới này.
      2. Tạo từ 2-4 nhân vật phụ (NPC) có vai trò quan trọng (bạn bè, kẻ thù, người hướng dẫn, v.v.).
      
      Hãy trả về định dạng JSON chính xác theo cấu trúc sau:
      {
        "player": {
          "name": "Tên",
          "gender": "Giới tính",
          "age": "Tuổi",
          "personality": "Tính cách",
          "background": "Tiểu sử",
          "appearance": "Ngoại hình",
          "skills": "Kỹ năng",
          "goal": "Mục tiêu"
        },
        "npcs": [
          {
            "name": "Tên NPC",
            "type": "NPC",
            "description": "Mô tả ngoại hình và vai trò",
            "personality": "Tính cách và thái độ",
            "age": "Tuổi (nếu có)",
            "gender": "Giới tính"
          }
        ]
      }`;

      const response = await ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const parsed = extractJson<any>(response.text);
      if (!parsed) {
        throw new Error("Cannot parse JSON from character generation response.");
      }
      setResults(prev => ({
        ...prev,
        [mode]: {
          ...prev[mode],
          player: parsed.player,
          npcs: parsed.npcs?.map((n: Entity, i: number) => ({ ...n, id: `gen_npc_${i}_${Date.now()}` })) || []
        }
      }));
      
    } catch (error) {
      console.error("Character generation error:", error);
      // Fallback to defaults if AI fails
      setResults(prev => ({
        ...prev,
        [mode]: {
          ...prev[mode],
          player: DEFAULT_PLAYER,
          npcs: []
        }
      }));
    } finally {
      setIsGeneratingCharacters(false);
    }
  };

  const generateAltGreetings = async () => {
    if (!currentResult?.success || !currentResult.data) return;
    
    setIsGeneratingGreeting(true);
    
    try {
      const ai = getAiClient(settings);
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
      const model = (activeProxy && activeProxy.model) ? activeProxy.model : (settings?.aiModel || "gemini-3-flash-preview");
      
      const cd = currentResult.data;
      const prompt = `Dựa trên thông tin nhân vật sau, hãy tạo ra 3 câu chào mở đầu (First Message / Greeting) thay thế. 
      Độ dài trung bình từ 150-300 từ. Cố gắng thay đổi bối cảnh, điểm nhìn hoặc cảm xúc hiện tại của nhân vật.
      Thêm hành động vào giữa cặp dấu * * hoặc mô tả chi tiết biểu cảm.
      
      Tên: ${cd.name || cd.char_name || 'Nhân vật'}
      Tính cách (Personality): ${cd.personality || ''}
      Mô tả (Description): ${cd.description || cd.char_persona || ''}
      Kịch bản (Scenario): ${cd.scenario || ''}
      Lời chào gốc: ${cd.first_mes || ''}
      
      Hãy trả về chính xác ĐỊNH DẠNG JSON là một mảng các chuỗi, ví dụ: 
      ["câu chào 1", "câu chào 2", "câu chào 3"]`;

      const response = await ai.models.generateContent({
        model: model,
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed)) {
        setResults(prev => {
          if (!prev.sillytavern || !prev.sillytavern.data) return prev;
          return {
            ...prev,
            sillytavern: {
              ...prev.sillytavern,
              data: {
                ...prev.sillytavern.data,
                alternate_greetings: parsed
              }
            }
          };
        });
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tạo lời chào thay thế.");
    } finally {
      setIsGeneratingGreeting(false);
    }
  };

  const handleStartGame = () => {
    if (!currentResult?.success || !onGameStart) return;

    let worldData: WorldData;

    if (mode === 'sillytavern' && currentResult.data) {
      const data = currentResult.data;
      const charName = data.name || data.char_name || "Nhân vật bí ẩn";
      
      const fullContext = `DỮ LIỆU NHÂN VẬT GỐC (SillyTavern):\n${JSON.stringify(data, null, 2)}`;

      const mainNpc: Entity = {
        id: 'main_npc',
        type: 'NPC',
        name: charName,
        description: data.description || data.char_persona || "",
        personality: data.personality || "",
        age: data.age || "",
        gender: data.gender || ""
      };

      let lorebook: import('../../../services/ai/lorebook/types').Lorebook | undefined;
      if (data.character_book && Array.isArray(data.character_book.entries)) {
        const entries: Record<string, import('../../../services/ai/lorebook/types').LorebookEntry> = {};
        data.character_book.entries.forEach((entry, idx) => {
          const uid = entry.name ? `${entry.name}_${idx}` : `st_entry_${idx}`;
          const order = entry.order !== undefined ? entry.order : (entry.insertion_order !== undefined ? entry.insertion_order : idx);
          entries[uid] = {
            uid,
            key: entry.keys || [],
            content: entry.content || '',
            comment: entry.name,
            constant: entry.constant || false,
            case_sensitive: entry.case_sensitive || false,
            depth: entry.depth !== undefined ? entry.depth : 0,
            position: entry.position !== undefined ? entry.position : 0, 
            disable: entry.enabled === false,
            order: order
          };
        });
        lorebook = {
          name: data.character_book.name || `Hồ sơ của ${charName}`,
          description: data.character_book.description || "",
          entries,
        };
      }

      // Extract Regex Scripts automatically
      const stScripts = [
        ...(Array.isArray(data.extensions?.regex_scripts) ? data.extensions.regex_scripts : []),
        ...(Array.isArray(data.character_book?.extensions?.regex_scripts) ? data.character_book.extensions.regex_scripts : [])
      ];
      let regexScripts: import('../../../types').RegexScript[] = [];
      if (stScripts.length > 0) {
        regexScripts = stScripts.map((s: any) => ({
          id: crypto.randomUUID(),
          scriptName: s.scriptName || s.name || 'ST Regex Script',
          findRegex: s.findRegex || s.regex || '',
          replaceString: s.replaceString !== undefined ? s.replaceString : (s.replacement || ''),
          trimStrings: s.trimStrings || [],
          substituteRegex: s.substituteRegex || 0,
          disabled: s.disabled !== undefined ? s.disabled : (!s.isEnabled),
          runOnEdit: s.runOnEdit || false,
          markdownOnly: s.markdownOnly || false,
          promptOnly: s.promptOnly || false,
          minDepth: s.minDepth !== undefined ? s.minDepth : null,
          maxDepth: s.maxDepth !== undefined ? s.maxDepth : null,
          placement: s.placement || [0, 1, 2]
        }));
      }

      worldData = {
        player: currentResult.player || DEFAULT_PLAYER,
        world: {
          worldName: `Thế giới của ${charName}`,
          genre: "Nhập vai nhân vật",
          context: fullContext,
          startingScenario: data.first_mes || data.mes_example || "Hành trình bắt đầu.",
          firstMessage: data.first_mes || ""
        },
        config: { ...DEFAULT_CONFIG, regexScripts },
        entities: [mainNpc, ...(currentResult.npcs || [])],
        lorebook
      };
    } else if (mode === 'creative' && currentResult.creativeContent) {
      const content = currentResult.creativeContent;
      const lines = content.split('\n');
      const worldNameLine = lines.find(l => l.includes('Tên thế giới') || l.includes('1.'));
      const worldName = worldNameLine ? worldNameLine.split(':')[1]?.trim() || "Thế giới mới" : "Thế giới mới";

      worldData = {
        player: currentResult.player || DEFAULT_PLAYER,
        world: {
          worldName,
          genre: "Giả tưởng (World Building)",
          context: content,
          startingScenario: "Bạn vừa đặt chân đến vùng đất này. Hãy bắt đầu hành trình của mình."
        },
        config: DEFAULT_CONFIG,
        entities: currentResult.npcs || []
      };
    } else {
      return;
    }

    onGameStart(worldData);
    onClose();
  };

  const resetAll = () => {
    setFiles(prev => ({ ...prev, [mode]: null }));
    setPreviewUrls(prev => ({ ...prev, [mode]: null }));
    setResults(prev => ({ ...prev, [mode]: null }));
    setStep(1);
    if (mode === 'sillytavern' && stFileInputRef.current) stFileInputRef.current.value = '';
    if (mode === 'creative' && creativeFileInputRef.current) creativeFileInputRef.current.value = '';
    dbService.saveAsset(STORAGE_KEY, JSON.stringify({ 
      results: { ...results, [mode]: null }, 
      mode, 
      previewUrls: { ...previewUrls, [mode]: null } 
    }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col overflow-hidden"
      >
        {/* Header with Integrated Actions */}
        <div className="p-3 border-b border-white/10 flex flex-wrap items-center gap-4 bg-zinc-900/50">
          {/* Tabs */}
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => { setMode('sillytavern'); setStep(1); }}
              className={`px-4 py-2 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest ${
                mode === 'sillytavern' 
                ? 'bg-mystic-accent text-mystic-900' 
                : 'text-white/40 hover:bg-white/5'
              }`}
            >
              SillyTavern
            </button>
            <button 
              onClick={() => { setMode('creative'); setStep(1); }}
              className={`px-4 py-2 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest ${
                mode === 'creative' 
                ? 'bg-purple-500 text-white' 
                : 'text-white/40 hover:bg-white/5'
              }`}
            >
              Sáng tạo
            </button>
          </div>

          <div className="h-6 w-px bg-white/10 hidden md:block" />

          {/* Main Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            {isAnalyzing && (
              <div className="flex items-center gap-2 px-3 h-9 bg-white/5 rounded-lg border border-white/10">
                <div className="w-3 h-3 border-2 border-mystic-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Đang xử lý...</span>
              </div>
            )}

            {mode === 'creative' && currentResult?.success && step === 1 && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                onClick={() => startAnalysis()}
                disabled={isAnalyzing}
              >
                <RefreshCw size={14} className={`mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                Reroll
              </Button>
            )}

            {currentResult?.success && step === 1 && (
              <Button 
                variant="primary" 
                size="sm"
                className="h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 border-emerald-400"
                onClick={mode === 'creative' && currentResult.player ? () => setStep(2) : generateCharacters}
                disabled={isGeneratingCharacters}
              >
                {isGeneratingCharacters ? 'Đang tạo...' : (mode === 'creative' && currentResult.player ? 'Xem NV' : 'Tạo NV')}
              </Button>
            )}

            {currentResult?.success && step === 2 && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 text-emerald-400"
                onClick={generateCharacters}
                disabled={isGeneratingCharacters}
              >
                Reroll
              </Button>
            )}

            {currentResult?.success && (
              <Button 
                variant="primary" 
                size="sm"
                className={`h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest ${mode === 'creative' ? 'bg-purple-600 hover:bg-purple-500 border-purple-400' : ''}`}
                onClick={handleStartGame}
              >
                Chơi ngay
              </Button>
            )}
          </div>

          <div className="h-6 w-px bg-white/10 hidden md:block" />

          {/* Utility Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button 
              variant="ghost" 
              size="sm"
              className="h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5"
              onClick={() => importInputRef.current?.click()}
            >
              Nhập
            </Button>
            
            {currentResult?.success && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 px-4 text-[10px] leading-[10px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5"
                onClick={exportData}
              >
                Xuất
              </Button>
            )}

            <Button 
              variant="ghost" 
              size="sm"
              className="h-9 w-9 p-0 flex items-center justify-center border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={resetAll}
              title="Dọn sạch"
            >
              <Trash2 size={16} />
            </Button>
          </div>

          <input 
            type="file" 
            ref={importInputRef} 
            onChange={handleImportJson} 
            accept=".json,application/json" 
            className="hidden" 
          />

          <div className="flex-1" />

          {/* Close Button */}
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all font-bold"
          >
            X
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-2">
            
            {/* Left Column: Upload & Preview */}
            <div className="space-y-2">
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 overflow-hidden h-full flex flex-col">
                <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <ImageIcon size={12} className="text-mystic-accent" /> Tải Ảnh Lên
                </h3>
                
                <div 
                  onClick={() => mode === 'sillytavern' ? stFileInputRef.current?.click() : creativeFileInputRef.current?.click()}
                  className={`relative flex-1 min-h-[400px] rounded-lg border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden ${
                    previewUrl ? (mode === 'sillytavern' ? 'border-mystic-accent/30 bg-mystic-950/10' : 'border-purple-500/30 bg-purple-950/10') : 'border-white/5 hover:border-white/10 bg-white/5'
                  }`}
                >
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-contain" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-white text-xs font-bold uppercase tracking-widest">Thay đổi ảnh</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                        <Upload className="text-white/30" size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-white/80 font-bold text-sm">Nhấn để chọn ảnh</p>
                        <p className="text-white/40 text-[10px] mt-1 uppercase tracking-wider">Hỗ trợ PNG, JPG, WEBP</p>
                      </div>
                    </>
                  )}
                </div>
                
                <input 
                  type="file" 
                  ref={stFileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={creativeFileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>

            {/* Right Column: Results */}
            <div className="space-y-2">
              <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 min-h-[500px] flex flex-col h-full">
                <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                  {step === 1 ? (
                    <>
                      {mode === 'sillytavern' ? <FileText size={12} className="text-mystic-accent" /> : <Globe size={12} className="text-purple-400" />}
                      Bước 1: Kết quả {mode === 'sillytavern' ? 'trích xuất' : 'kiến tạo'}
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-emerald-400" />
                      Bước 2: Tổng hợp nhân vật
                    </>
                  )}
                </h3>

                <div className="flex-1 flex flex-col">
                  {step === 1 && (
                    <>
                      {!currentResult && !isAnalyzing && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                          {mode === 'sillytavern' ? <FileText size={48} className="mb-4" /> : <Sparkles size={48} className="mb-4" />}
                          <p className="text-sm">Vui lòng tải ảnh để bắt đầu</p>
                        </div>
                      )}

                      {isAnalyzing && (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <div className={`w-12 h-12 border-2 ${mode === 'sillytavern' ? 'border-mystic-accent' : 'border-purple-500'} border-t-transparent rounded-full animate-spin mb-4`}></div>
                          <p className={`text-sm ${mode === 'sillytavern' ? 'text-mystic-accent' : 'text-purple-400'} animate-pulse font-bold uppercase tracking-widest`}>
                            {mode === 'sillytavern' ? 'Đang giải mã dữ liệu...' : 'AI đang quan sát và sáng tạo...'}
                          </p>
                        </div>
                      )}

                      {currentResult && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col">
                          {currentResult.success ? (
                            <div className="space-y-4 flex-1 flex flex-col">
                              <div className={`p-4 ${mode === 'sillytavern' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-purple-500/10 border-purple-500/30 text-purple-400'} rounded-xl flex items-center gap-3`}>
                                <CheckCircle2 size={20} />
                                <span className="font-bold text-sm">
                                  {mode === 'sillytavern' ? 'Đã trích xuất dữ liệu thành công!' : 'Thế giới đã được kiến tạo!'}
                                </span>
                              </div>
                              
                              <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex-1 overflow-hidden flex flex-col">
                                {mode === 'sillytavern' ? (
                                  <div className="flex-1 flex flex-col min-h-0 bg-transparent">
                                    <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                                      <button onClick={() => setActiveStTab('info')} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${activeStTab === 'info' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:bg-white/5'}`}>Cơ bản</button>
                                      {currentResult.data?.character_book && (
                                        <button onClick={() => setActiveStTab('lorebook')} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${activeStTab === 'lorebook' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:bg-white/5'}`}>Lorebook</button>
                                      )}
                                      {((currentResult.data?.extensions?.regex_scripts?.length) || (currentResult.data?.character_book?.extensions?.regex_scripts?.length)) ? (
                                        <button onClick={() => setActiveStTab('regex')} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${activeStTab === 'regex' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:bg-white/5'}`}>Regex</button>
                                      ) : null}
                                      <button onClick={() => setActiveStTab('tools')} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${activeStTab === 'tools' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/40 hover:bg-white/5'}`}>Phân tích & Công cụ</button>
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                                      {activeStTab === 'info' && (
                                        <div className="space-y-4">
                                          <div className="space-y-2">
                                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Thông tin chung</h4>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="bg-black/40 p-2 rounded border border-white/5"><span className="text-[9px] text-white/40 block mb-1">Tên</span><div className="text-xs font-bold text-white max-h-[36px] overflow-hidden leading-tight">{currentResult.data?.name || currentResult.data?.char_name || "N/A"}</div></div>
                                              <div className="bg-black/40 p-2 rounded border border-white/5"><span className="text-[9px] text-white/40 block mb-1">Spec</span><div className="text-xs font-bold text-white uppercase">{currentResult.data?.original_spec || "V1 / Unspecified"}</div></div>
                                            </div>
                                          </div>
                                          <AutoResizingTextarea label="Tính cách" value={currentResult.data?.personality || ''} onChange={() => {}} className="text-xs text-white/80" />
                                          <AutoResizingTextarea label="Mô tả / Persona" value={currentResult.data?.description || currentResult.data?.char_persona || ''} onChange={() => {}} className="text-xs text-white/70" />
                                          <AutoResizingTextarea label="Kịch bản (Scenario)" value={currentResult.data?.scenario || ''} onChange={() => {}} className="text-xs text-white/60" />
                                          <AutoResizingTextarea label="Lời chào đầu (First message)" value={currentResult.data?.first_mes || ''} onChange={() => {}} className="text-xs text-white/80 italic border-l-2 border-l-emerald-500 pl-2" />
                                        </div>
                                      )}
                                      
                                    {activeStTab === 'lorebook' && currentResult.data?.character_book && (
                                        <div className="space-y-3">
                                          <div className="bg-black/40 p-3 rounded border border-emerald-500/20">
                                            <h4 className="text-xs font-bold text-emerald-400 mb-1">{currentResult.data.character_book.name || "Embedded Lorebook"}</h4>
                                            {currentResult.data.character_book.description && <p className="text-[10px] text-white/60">{currentResult.data.character_book.description}</p>}
                                            <p className="text-[10px] text-emerald-500/70 mt-2">{currentResult.data.character_book.entries?.length || 0} mục (entries)</p>
                                          </div>
                                          <div className="space-y-2">
                                            {currentResult.data.character_book.entries?.map((entry: any, i: number) => (
                                              <div key={i} className="bg-white/5 p-3 rounded border border-white/10 space-y-2 flex flex-col">
                                                <div className="flex items-center justify-between">
                                                  <div className="text-[10px] font-bold text-emerald-400">
                                                    Từ Khóa (Keys): <span className="text-white/80">{entry.keys?.join(', ') || 'N/A'}</span>
                                                  </div>
                                                  {entry.constant && <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[8px] font-bold uppercase">Constant</span>}
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[9px] text-white/50">
                                                    <div className="bg-black/40 px-2 py-1 rounded">Position: <span className="text-white">{entry.position !== undefined ? entry.position : 'N/A'}</span></div>
                                                    <div className="bg-black/40 px-2 py-1 rounded">Order: <span className="text-white">{entry.order !== undefined ? entry.order : 'N/A'}</span></div>
                                                    <div className="bg-black/40 px-2 py-1 rounded">Depth: <span className="text-white">{entry.depth !== undefined ? entry.depth : 'N/A'}</span></div>
                                                    <div className="bg-black/40 px-2 py-1 rounded">Case Sensitive: <span className="text-white">{entry.case_sensitive ? 'Yes' : 'No'}</span></div>
                                                </div>
                                                <div className="text-xs text-white/70 whitespace-pre-wrap bg-black/30 p-2 rounded max-h-[150px] overflow-y-auto custom-scrollbar">{entry.content}</div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {activeStTab === 'regex' && (
                                        <div className="space-y-4">
                                          <div className="bg-black/40 p-3 rounded-xl border border-blue-500/20 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] items-center gap-1 font-black text-blue-400 uppercase tracking-widest flex">
                                                  <AlertCircle size={12} /> Trình quản lý Regex Scripts
                                                </h4>
                                                <div className="flex gap-2">
                                                    <button
                                                      onClick={() => {
                                                          setResults(prev => {
                                                              if (!prev.sillytavern?.data) return prev;
                                                              const newData = { ...prev.sillytavern.data };
                                                              if (newData.extensions?.regex_scripts) {
                                                                  newData.extensions = {...newData.extensions};
                                                                  newData.extensions.regex_scripts = newData.extensions.regex_scripts.map((s: any) => ({...s, disabled: false}));
                                                              }
                                                              if (newData.character_book?.extensions?.regex_scripts) {
                                                                  newData.character_book = {...newData.character_book};
                                                                  newData.character_book.extensions = {...newData.character_book.extensions};
                                                                  newData.character_book.extensions.regex_scripts = newData.character_book.extensions.regex_scripts.map((s: any) => ({...s, disabled: false}));
                                                              }
                                                              return { ...prev, sillytavern: { ...prev.sillytavern, data: newData } };
                                                          });
                                                      }}
                                                      className="px-2 py-1 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                                    >
                                                        BẬT TẤT CẢ
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setResults(prev => {
                                                            if (!prev.sillytavern?.data) return prev;
                                                            const newData = { ...prev.sillytavern.data };
                                                            if (newData.extensions?.regex_scripts) {
                                                                newData.extensions = {...newData.extensions};
                                                                newData.extensions.regex_scripts = newData.extensions.regex_scripts.map((s: any) => ({...s, disabled: true}));
                                                            }
                                                            if (newData.character_book?.extensions?.regex_scripts) {
                                                                newData.character_book = {...newData.character_book};
                                                                newData.character_book.extensions = {...newData.character_book.extensions};
                                                                newData.character_book.extensions.regex_scripts = newData.character_book.extensions.regex_scripts.map((s: any) => ({...s, disabled: true}));
                                                            }
                                                            return { ...prev, sillytavern: { ...prev.sillytavern, data: newData } };
                                                        });
                                                      }}
                                                      className="px-2 py-1 text-[9px] font-bold rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                                    >
                                                        TẮT TẤT CẢ
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-white/50 leading-relaxed">
                                              Các quy tắc Regex này được đi kèm trong thẻ. Bạn có thể bật/tắt để cho phép hoặc không cho phép tự động phân tích khi chơi.
                                            </p>
                                            
                                            <div className="space-y-3 mt-4">
                                              {(['extensions', 'bookExt'] as const).map(srcType => {
                                                const scripts = srcType === 'extensions' 
                                                  ? currentResult.data?.extensions?.regex_scripts 
                                                  : currentResult.data?.character_book?.extensions?.regex_scripts;
                                                
                                                if (!scripts || scripts.length === 0) return null;
                                                
                                                return scripts.map((script: any, index: number) => {
                                                  const isDisabled = script.disabled !== undefined ? script.disabled : (!script.isEnabled);
                                                  return (
                                                    <div key={`${srcType}_${index}`} className={`bg-white/5 p-3 rounded-lg text-xs border ${isDisabled ? 'border-red-500/30 opacity-50' : 'border-blue-500/30'}`}>
                                                      <div className="flex items-center justify-between mb-2">
                                                        <div className="font-bold text-white/90">{script.scriptName || 'ST Regex Script'}</div>
                                                        <button
                                                          onClick={() => {
                                                            setResults(prev => {
                                                              if (!prev.sillytavern?.data) return prev;
                                                              const newData = { ...prev.sillytavern.data };
                                                              if (srcType === 'extensions' && newData.extensions?.regex_scripts) {
                                                                newData.extensions = {...newData.extensions};
                                                                newData.extensions.regex_scripts = [...newData.extensions.regex_scripts];
                                                                newData.extensions.regex_scripts[index] = { ...script, disabled: !isDisabled };
                                                              } else if (srcType === 'bookExt' && newData.character_book?.extensions?.regex_scripts) {
                                                                newData.character_book = {...newData.character_book};
                                                                newData.character_book.extensions = {...newData.character_book.extensions};
                                                                newData.character_book.extensions.regex_scripts = [...newData.character_book.extensions.regex_scripts];
                                                                newData.character_book.extensions.regex_scripts[index] = { ...script, disabled: !isDisabled };
                                                              }
                                                              return { ...prev, sillytavern: { ...prev.sillytavern, data: newData } };
                                                            });
                                                          }}
                                                          className={`px-2 py-1 text-[9px] font-bold rounded ${isDisabled ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}
                                                        >
                                                          {isDisabled ? 'ĐÃ TẮT' : 'ĐANG BẬT'}
                                                        </button>
                                                      </div>
                                                      <div className="flex flex-wrap gap-2 text-[9px] text-white/50 mb-2">
                                                        <div className="bg-black/40 px-2 py-1 rounded flex items-center gap-1">
                                                          Vị trí (Placement): 
                                                          <span className="text-white font-bold">
                                                            {script.placement?.map((p: number) => {
                                                              switch(p) {
                                                                case 1: return 'User';
                                                                case 2: return 'AI';
                                                                case 3: return 'Command';
                                                                case 5: return 'World Info';
                                                                case 6: return 'LSR';
                                                                case 7: return 'CoT';
                                                                case 0: return 'Any UI'; // Typically what 0 means
                                                                default: return p;
                                                              }
                                                            }).join(', ') || '0, 1, 2'}
                                                          </span>
                                                        </div>
                                                        {script.markdownOnly && <div className="bg-blue-500/20 px-2 py-1 rounded text-blue-300 font-bold border border-blue-500/30">Display Only (Markdown)</div>}
                                                        {script.promptOnly && <div className="bg-amber-500/20 px-2 py-1 rounded text-amber-300 font-bold border border-amber-500/30">Prompt Only</div>}
                                                        {script.runOnEdit && <div className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300 font-bold border border-emerald-500/30">Run On Edit</div>}
                                                        {(script.minDepth !== undefined || script.maxDepth !== undefined) && (
                                                          <div className="bg-purple-500/20 px-2 py-1 rounded text-purple-300 font-bold border border-purple-500/30">
                                                            Depth: {script.minDepth !== undefined ? script.minDepth : '∞'} - {script.maxDepth !== undefined ? script.maxDepth : '∞'}
                                                          </div>
                                                        )}
                                                      </div>
                                                      <div className="text-white/60 font-mono text-[10px] break-all bg-black/50 p-2 rounded">
                                                        <span className="text-pink-400">/{script.findRegex}/</span>
                                                      </div>
                                                      <div className="mt-1 text-white/60 font-mono text-[10px] break-all bg-black/50 p-2 rounded relative group">
                                                        <div className="absolute -top-2 left-2 bg-black text-[8px] text-zinc-400 px-1">Thay thế (Replace)</div>
                                                        <span className="text-emerald-400 whitespace-pre-wrap">{script.replaceString}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                });
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {activeStTab === 'tools' && (
                                        <div className="space-y-4 pr-1">
                                          <div className="bg-black/40 p-3 rounded-xl border border-white/5 space-y-2">
                                           <h4 className="text-[10px] items-center gap-1 font-black text-emerald-400 uppercase tracking-widest flex">
                                             <AlertCircle size={12} /> Báo cáo chất lượng
                                           </h4>
                                           <div className="text-xs text-white/70 space-y-1">
                                             <p>• Token Description ước tính: <strong>{Math.round((currentResult.data?.description?.length || currentResult.data?.char_persona?.length || 0) / 4)} tokens</strong></p>
                                             <p>• Độ dài First Message ước tính: <strong>{Math.round((currentResult.data?.first_mes?.length || 0) / 4)} tokens</strong></p>
                                             {!currentResult.data?.scenario && <p className="text-amber-400 mt-2 flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0"/> Cảnh báo: Thẻ thiếu "Scenario" (kịch bản gốc).</p>}
                                             {Math.round((currentResult.data?.description?.length || currentResult.data?.char_persona?.length || 0) / 4) > 1500 && <p className="text-amber-400 mt-2 flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0"/> Cảnh báo: Mô tả khá dài, có thể gây lag do tràn ngữ cảnh.</p>}
                                           </div>
                                          </div>
                                          
                                          <div className="bg-black/40 p-3 rounded-xl border border-purple-500/20 space-y-3">
                                            <h4 className="text-[10px] items-center gap-1 font-black text-purple-400 uppercase tracking-widest flex">
                                              <Wand2 size={12} /> Auto-generate First Message
                                            </h4>
                                            <p className="text-[10px] text-white/50 leading-relaxed">Sử dụng AI để tạo ra các tình huống mở đầu mới thú vị hơn dựa trên profile nhân vật.</p>
                                            
                                            <Button onClick={generateAltGreetings} disabled={isGeneratingGreeting} className="w-full text-xs font-bold py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30">
                                              {isGeneratingGreeting ? "Đang tạo..." : "Tạo 3 lời chào thay thế"}
                                            </Button>
                                            
                                            {currentResult.data?.alternate_greetings && currentResult.data.alternate_greetings.length > 0 && (
                                              <div className="mt-4 space-y-2">
                                                {currentResult.data.alternate_greetings.map((greet: string, i: number) => (
                                                  <div key={i} className="p-2 bg-white/5 rounded-lg border border-white/10 relative group hover:border-emerald-500/50 transition-colors">
                                                    <p className="text-xs text-white/80 whitespace-pre-wrap">{greet}</p>
                                                    <button 
                                                      onClick={() => {
                                                        setResults(prev => {
                                                          if (!prev.sillytavern || !prev.sillytavern.data) return prev;
                                                          return {
                                                            ...prev,
                                                            sillytavern: { 
                                                              ...prev.sillytavern, 
                                                              data: { ...prev.sillytavern.data, first_mes: greet } 
                                                            }
                                                          };
                                                        });
                                                        alert("Đã cập nhật làm Lời chào (First Message) chính thức!");
                                                      }} 
                                                      className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                      Dùng thay thế
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex-1 overflow-auto custom-scrollbar p-2">
                                    <AutoResizingTextarea 
                                      value={currentResult.creativeContent || ''}
                                      onChange={updateCreativeContent}
                                      className="font-serif italic text-sm text-slate-200 leading-relaxed bg-transparent border-none p-0 focus:ring-0"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                              <AlertCircle className="text-red-500 mt-0.5" size={20} />
                              <div>
                                <p className="text-red-500 font-bold text-sm">Xử lý thất bại</p>
                                <p className="text-red-400/70 text-xs mt-1">{currentResult.error}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {step === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex-1 flex flex-col space-y-4">
                      {isGeneratingCharacters ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                          <p className="text-sm text-emerald-400 animate-pulse font-bold uppercase tracking-widest">
                            AI đang tổng hợp nhân vật...
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
                          {/* Player Profile */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                              <Shield size={12} /> Hồ sơ người chơi (PC)
                            </h4>
                            {currentResult.player && (
                              <div className="bg-black/40 rounded-xl p-4 border border-emerald-500/20 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <AutoResizingTextarea 
                                    label="Tên"
                                    value={currentResult.player.name}
                                    onChange={(val) => updatePlayerField('name', val)}
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <AutoResizingTextarea 
                                      label="Tuổi"
                                      value={currentResult.player.age}
                                      onChange={(val) => updatePlayerField('age', val)}
                                    />
                                    <AutoResizingTextarea 
                                      label="Giới tính"
                                      value={currentResult.player.gender}
                                      onChange={(val) => updatePlayerField('gender', val)}
                                    />
                                  </div>
                                </div>
                                <AutoResizingTextarea 
                                  label="Tính cách"
                                  value={currentResult.player.personality}
                                  onChange={(val) => updatePlayerField('personality', val)}
                                  className="italic text-white/80"
                                />
                                <AutoResizingTextarea 
                                  label="Tiểu sử"
                                  value={currentResult.player.background}
                                  onChange={(val) => updatePlayerField('background', val)}
                                  className="text-xs text-white/60 leading-relaxed"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                  <AutoResizingTextarea 
                                    label="Ngoại hình"
                                    value={currentResult.player.appearance || ''}
                                    onChange={(val) => updatePlayerField('appearance', val)}
                                    className="text-xs text-white/60"
                                  />
                                  <AutoResizingTextarea 
                                    label="Kỹ năng"
                                    value={currentResult.player.skills || ''}
                                    onChange={(val) => updatePlayerField('skills', val)}
                                    className="text-xs text-white/60"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* NPCs */}
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText size={12} /> Nhân vật phụ (NPCs)
                              </h4>
                              <button 
                                onClick={addManualNPC}
                                className="text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                              >
                                <Wand2 size={10} /> Thêm NPC thủ công
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              {currentResult.npcs?.map((npc, idx) => (
                                <div key={npc.id ? `${npc.id}-${idx}` : idx} className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-3 hover:border-emerald-500/30 transition-all group relative">
                                  <button 
                                    onClick={() => removeNPC(idx)}
                                    className="absolute top-2 right-2 p-1 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X size={14} />
                                  </button>
                                  
                                  <div className="flex gap-4">
                                    <div className="flex-1">
                                      <AutoResizingTextarea 
                                        label="Tên NPC"
                                        value={npc.name}
                                        onChange={(val) => updateNPCField(idx, 'name', val)}
                                        className="font-bold"
                                      />
                                    </div>
                                    <div className="w-32 flex gap-1">
                                      <AutoResizingTextarea 
                                        label="Tuổi"
                                        value={npc.age}
                                        onChange={(val) => updateNPCField(idx, 'age', val)}
                                        className="text-[10px]"
                                      />
                                      <AutoResizingTextarea 
                                        label="GT"
                                        value={npc.gender}
                                        onChange={(val) => updateNPCField(idx, 'gender', val)}
                                        className="text-[10px]"
                                      />
                                    </div>
                                  </div>
                                  
                                  <AutoResizingTextarea 
                                    label="Tính cách"
                                    value={npc.personality}
                                    onChange={(val) => updateNPCField(idx, 'personality', val)}
                                    className="text-xs text-white/80 italic"
                                  />
                                  
                                  <AutoResizingTextarea 
                                    label="Mô tả & Vai trò"
                                    value={npc.description}
                                    onChange={(val) => updateNPCField(idx, 'description', val)}
                                    className="text-[11px] text-white/50 leading-relaxed"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CardSTAnalyzer;
