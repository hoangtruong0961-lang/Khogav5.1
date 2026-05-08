import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Settings2, RotateCcw, Edit2, ToggleLeft, ToggleRight, Check, X, Download, Upload, Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { TawaPresetConfig, PromptModule, PromptPosition } from '../../../../types';
import { DEFAULT_PRESET_CONFIG } from '../../../../constants/tawa_modules';
import { dbService } from '../../../../services/db/indexedDB';

interface TawaPresetManagerProps {
  onConfigChange: (config: TawaPresetConfig) => void;
  initialPreset?: TawaPresetConfig;
}

export interface SavedPreset {
  id: string;
  name: string;
  config: TawaPresetConfig;
}

const LEGACY_STORAGE_KEY = 'tawa_preset_config_v1';
const PRESETS_STORAGE_KEY = 'tawa_presets_list_v2';
const ACTIVE_PRESET_ID_KEY = 'tawa_active_preset_id_v2';

const POSITION_ORDER: Record<string, number> = { top: 1, system: 2, persona: 3, bottom: 4, final: 5 };

const convertSTtoTawa = (stJson: any): TawaPresetConfig => {
    const modules: PromptModule[] = [];
    let cot: PromptModule | null = null;
    let aiConfigOverrides: any = undefined;

    // Detect if ST Generation Config / API Settings preset
    if (stJson.temp !== undefined || stJson.temperature !== undefined || stJson.top_p !== undefined || stJson.max_length !== undefined || stJson.frequency_penalty !== undefined || stJson.presence_penalty !== undefined || stJson.repetition_penalty !== undefined || stJson.min_p !== undefined || stJson.top_a !== undefined) {
        aiConfigOverrides = {
            temperature: typeof stJson.temp === 'number' ? stJson.temp : (typeof stJson.temperature === 'number' ? stJson.temperature : undefined),
            topP: typeof stJson.top_p === 'number' ? stJson.top_p : undefined,
            topK: typeof stJson.top_k === 'number' ? stJson.top_k : undefined,
            frequencyPenalty: typeof stJson.frequency_penalty === 'number' ? stJson.frequency_penalty : undefined,
            presencePenalty: typeof stJson.presence_penalty === 'number' ? stJson.presence_penalty : undefined,
            repetitionPenalty: typeof stJson.repetition_penalty === 'number' ? stJson.repetition_penalty : undefined,
            minP: typeof stJson.min_p === 'number' ? stJson.min_p : undefined,
            topA: typeof stJson.top_a === 'number' ? stJson.top_a : undefined,
            maxOutputTokens: typeof stJson.max_length === 'number' ? stJson.max_length : (typeof stJson.max_context === 'number' ? stJson.max_context : undefined)
        };
    }
    
    // Sort ST prompts by injection order, then mapping
    const prompts = stJson.prompts || [];
    
    prompts.forEach((p: any, i: number) => {
        const mod: PromptModule = {
            id: p.identifier || `st_${Date.now()}_${i}`,
            label: p.name || `ST Prompt ${i + 1}`,
            isActive: p.enabled ?? true,
            content: p.content || '',
            position: p.role === 'system' ? 'system' : 'bottom',
            order: typeof p.injection_order === 'number' ? p.injection_order : i * 10,
            injectKey: undefined
        };

        if (p.injection_trigger && Array.isArray(p.injection_trigger) && p.injection_trigger.length > 0) {
            // Some ST prompts might have triggers, but we can't easily map them. We'll set it as active if enabled.
        }

        // Identifying COT / Jailbreak
        if (!cot && (p.identifier?.toLowerCase().includes('jailbreak') || p.name?.toLowerCase().includes('cot'))) {
            mod.isCore = true;
            cot = mod;
        } else {
            modules.push(mod);
        }
    });

    // Fallback for ST Instruct Mode or Context Templates if 'prompts' is empty or missing
    if (prompts.length === 0) {
        if (stJson.system_prompt) {
            modules.push({
                id: 'st_instruct_system', label: 'System Prompt (Instruct)',
                isActive: true, content: stJson.system_prompt, position: 'system', order: 0
            });
        }
        if (stJson.story_string) {
            modules.push({
                id: 'st_context_story', label: 'Story String (Context)',
                isActive: true, content: stJson.story_string, position: 'system', order: 10
            });
        }
    }

    let postHistoryInstructions = stJson.post_history_instructions || undefined;
    
    // Check if there is an existing st_post_history module in prompts and extract it
    const existingPostHistoryIndex = modules.findIndex(m => m.id === 'st_post_history' || m.label.includes('Post-History'));
    if (existingPostHistoryIndex !== -1 && !postHistoryInstructions) {
        postHistoryInstructions = modules[existingPostHistoryIndex].content;
        modules.splice(existingPostHistoryIndex, 1);
    }

    if (!cot) {
        cot = {
            id: 'st_dummy_cot',
            label: 'Lõi Tư Duy (ST Không có)',
            isActive: true,
            isCore: true,
            content: '',
            position: 'bottom',
            order: 9999
        };
    }

    // Clean undefined fields in overrides
    if (aiConfigOverrides) {
        Object.keys(aiConfigOverrides).forEach(key => aiConfigOverrides[key] === undefined && delete aiConfigOverrides[key]);
        if (Object.keys(aiConfigOverrides).length === 0) aiConfigOverrides = undefined;
    }

    return { cot, modules, aiConfigOverrides, postHistoryInstructions };
};

const TawaPresetManager: React.FC<TawaPresetManagerProps> = ({ onConfigChange, initialPreset }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const [presets, setPresets] = useState<SavedPreset[]>(() => {
    let baseList: SavedPreset[] = [];
    try {
      const savedList = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (savedList) {
        baseList = JSON.parse(savedList);
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        let defaultConf = DEFAULT_PRESET_CONFIG;
        if (legacy) {
          try {
            defaultConf = { ...DEFAULT_PRESET_CONFIG, ...JSON.parse(legacy) };
          } catch(e){
            console.error(e);
          }
        }
        baseList = [{ id: 'default', name: 'Mặc định (Tawa)', config: defaultConf }];
      }
    } catch(e) {
      baseList = [{ id: 'default', name: 'Mặc định (Tawa)', config: DEFAULT_PRESET_CONFIG }];
    }
    
    // Add custom world preset if not already exactly matching default
    if (initialPreset) {
      const isMatchingExisting = baseList.some(p => JSON.stringify(p.config) === JSON.stringify(initialPreset));
      if (!isMatchingExisting && !baseList.some(p => p.id === 'custom_world')) {
         baseList.push({ id: 'custom_world', name: 'Preset Thế Giới này', config: initialPreset });
      }
    }
    return baseList;
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    if (initialPreset) {
      // Find if it matches explicitly
      const savedListStr = localStorage.getItem(PRESETS_STORAGE_KEY);
      let list = savedListStr ? JSON.parse(savedListStr) : [];
      const match = list.find((p: SavedPreset) => JSON.stringify(p.config) === JSON.stringify(initialPreset));
      if (match) return match.id;
      return 'custom_world';
    }
    return localStorage.getItem(ACTIVE_PRESET_ID_KEY) || 'default';
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [importState, setImportState] = useState<{
      isOpen: boolean;
      presetName: string;
      allModules: PromptModule[];
      selectedCotId: string;
      postHistoryInstructions?: string;
      aiConfigOverrides?: TawaPresetConfig['aiConfigOverrides'];
      importedRegexes?: any[];
      activeTab: 'config' | 'modules' | 'regex';
  } | null>(null);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];
  const config = activePreset.config;

  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  // --- Handlers ---

  const updateConfig = (updater: (prev: TawaPresetConfig) => TawaPresetConfig) => {
    setPresets(prevList => {
       const newList = prevList.map(p => {
         if (p.id === activePresetId) {
           return { ...p, config: updater(p.config) };
         }
         return p;
       });
       if (activePresetId !== 'custom_world') {
           localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(newList.filter(p => p.id !== 'custom_world')));
       }
       return newList;
    });
  };

  const handleToggleModule = (moduleId: string) => {
    updateConfig(prev => ({
      ...prev,
      modules: prev.modules.map(m => m.id === moduleId ? { ...m, isActive: !m.isActive } : m)
    }));
  };

  const handleUpdateModule = (id: string, updates: Partial<PromptModule>) => {
    updateConfig(prev => ({
        ...prev,
        modules: prev.modules.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const handleUpdateContent = (id: string, newContent: string) => {
    updateConfig(prev => {
        if (id === prev.cot.id) {
            return { ...prev, cot: { ...prev.cot, content: newContent } };
        } else {
            return {
                ...prev,
                modules: prev.modules.map(m => m.id === id ? { ...m, content: newContent } : m)
            };
        }
    });
  };

  const handleAddModule = () => {
      const newId = 'custom_' + Date.now();
      updateConfig(prev => ({
          ...prev,
          modules: [...prev.modules, {
              id: newId,
              label: 'New Module',
              isActive: true,
              content: '',
              position: 'system',
              order: 100
          }]
      }));
      setEditingId(newId);
  };

  const handleDeleteModule = (id: string) => {
      if (window.confirm("Thực sự muốn xóa module này?")) {
          updateConfig(prev => ({
              ...prev,
              modules: prev.modules.filter(m => m.id !== id)
          }));
      }
  };

  const handleUpdateAIConfig = (field: keyof NonNullable<TawaPresetConfig['aiConfigOverrides']>, value: number | undefined) => {
    updateConfig(prev => {
        const currentOverrides = prev.aiConfigOverrides || {};
        const newOverrides = { ...currentOverrides, [field]: value };
        if (value === undefined) delete newOverrides[field];
        
        return {
            ...prev,
            aiConfigOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined
        };
    });
  };

  const handleReset = () => {
      try {
        const freshConfig = JSON.parse(JSON.stringify(DEFAULT_PRESET_CONFIG));
        if (activePresetId === 'default') {
            updateConfig(() => freshConfig);
        } else {
            if (window.confirm("Ghi đè preset hiện tại bằng cấu hình mặc định?")) {
               updateConfig(() => freshConfig);
            }
        }
        setEditingId(null);
      } catch (error) {
        console.error("Failed to reset config:", error);
      }
  };

  const handleExport = () => {
    try {
      const dataStr = JSON.stringify(config, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = "tawa_preset_config.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const importedJson = JSON.parse(content);
        
        let newConfig: TawaPresetConfig;
        let presetName = file.name.replace('.json', '');

        if (importedJson && importedJson.cot && importedJson.modules) {
             newConfig = importedJson;
        } else if (importedJson && (Array.isArray(importedJson.prompts) || importedJson.system_prompt || importedJson.story_string || importedJson.temp !== undefined || importedJson.temperature !== undefined)) {
             newConfig = convertSTtoTawa(importedJson);
             if (importedJson.name) {
                 presetName = importedJson.name; // Use ST Preset name if available
             }
        } else {
             alert("Tệp Preset không hợp lệ. Vui lòng cung cấp file Tawa Preset hoặc SillyTavern Preset.");
             return;
        }

        const allModules = [newConfig.cot, ...newConfig.modules].filter(Boolean) as PromptModule[];

        // KIỂM TRA REGEX SCRIPTS TRONG FILE NHẬP
        const importedRegexes = importedJson.regex_scripts || importedJson.extensions?.regex_scripts || [];

        setImportState({
            isOpen: true,
            presetName,
            allModules,
            selectedCotId: newConfig.cot ? newConfig.cot.id : 'none',
            postHistoryInstructions: newConfig.postHistoryInstructions,
            aiConfigOverrides: newConfig.aiConfigOverrides,
            importedRegexes: importedRegexes.length > 0 ? importedRegexes : undefined,
            activeTab: 'config'
        });
        
      } catch (error) {
        console.error("Lỗi khi đọc file preset:", error);
        alert("Lỗi khi đọc file preset. Tệp JSON không hợp lệ.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleConfirmImport = React.useCallback(() => {
      if (!importState) return;
      
      let finalCot: PromptModule;
      let finalModules: PromptModule[] = [];

      // 1. Determine the CoT and base imported modules
      if (importState.selectedCotId === 'keep_current') {
          finalCot = { ...config.cot };
          finalModules = [...importState.allModules];
      } else if (importState.selectedCotId === 'none') {
          finalCot = { id: 'no_cot', label: '🚫 Không Dùng CoT', isActive: false, isCore: true, content: '', position: 'bottom', order: 900 };
          finalModules = [...importState.allModules];
      } else {
          const selected = importState.allModules.find(m => m.id === importState.selectedCotId);
          if (selected) {
              finalCot = { ...selected, isCore: true };
              finalModules = importState.allModules.filter(m => m.id !== importState.selectedCotId);
          } else {
              finalCot = { ...config.cot };
              finalModules = [...importState.allModules];
          }
      }

      // 2. Ensure Tawa Core structural modules are preserved if not present
      const requiredSysModules = ['sys_prefill_trigger', 'sys_integrity_rules', 'sys_history_start', 'sys_history_end'];
      if (importState.selectedCotId === 'keep_current') {
          // If keeping current CoT, we also need to keep Tawa's thinking modules
          requiredSysModules.push('sys_tawa_start', 'sys_cot_main', 'sys_tawa_end');
      }

      requiredSysModules.forEach(sysId => {
          if (!finalModules.find(m => m.id === sysId)) {
              const originalSysMod = config.modules.find(m => m.id === sysId) || DEFAULT_PRESET_CONFIG.modules.find(m => m.id === sysId);
              if (originalSysMod) {
                  // Disable prefill trigger if not using Tawa's CoT to avoid forcing empty <thinking> logic
                  if (sysId === 'sys_prefill_trigger' && importState.selectedCotId !== 'keep_current') {
                      finalModules.push({ ...originalSysMod, isActive: false });
                  } else {
                      finalModules.push({ ...originalSysMod });
                  }
              }
          }
      });

       
      const presetId = 'preset_' + Math.floor(Math.random() * 1000000);
      const newPreset: SavedPreset = {
          id: presetId,
          name: importState.presetName,
          config: { cot: finalCot, modules: finalModules, postHistoryInstructions: importState.postHistoryInstructions, aiConfigOverrides: importState.aiConfigOverrides }
      };

      setPresets(prev => {
          const updated = [...prev, newPreset];
          localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
          return updated;
      });
      
      // Save regexes if there are any
      if (importState.importedRegexes && importState.importedRegexes.length > 0) {
          dbService.getSettings().then(settings => {
              if (settings) {
                  const currentRegexes = settings.regex_scripts || [];
                  const newRegexes = [...importState.importedRegexes!, ...currentRegexes];
                  const uniqueRegexes = newRegexes.filter((v, i, a) => 
                      a.findIndex(t => (t.id && t.id === v.id) || (t.scriptName && t.scriptName === v.scriptName)) === i
                  );
                  dbService.saveSettings({ ...settings, regex_scripts: uniqueRegexes } as any).then(() => {
                      window.dispatchEvent(new Event('reload_regex_scripts'));
                  });
              }
          });
      }

      setActivePresetId(presetId);
      localStorage.setItem(ACTIVE_PRESET_ID_KEY, presetId);
      setEditingId(null);
      setImportState(null);
  }, [importState, config.cot, config.modules, setPresets, setActivePresetId]);

  const handleDeletePreset = (id: string, isConfirmed: boolean = false) => {
    if (id === 'default' || id === 'custom_world') return;
    if (!isConfirmed) {
        setConfirmDeleteId(id);
        return;
    }
    
    setPresets(prev => {
      const newList = prev.filter(p => p.id !== id);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(newList.filter(p => p.id !== 'custom_world')));
      return newList;
    });
    if (activePresetId === id) {
      setActivePresetId('default');
      localStorage.setItem(ACTIVE_PRESET_ID_KEY, 'default');
    }
    setConfirmDeleteId(null);
  };

  const handleSwitchPreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setActivePresetId(id);
    if (id !== 'custom_world') {
      localStorage.setItem(ACTIVE_PRESET_ID_KEY, id);
    }
    setEditingId(null);
  };

  // --- Render Helpers ---
  const sortedModules = [...config.modules]
    .filter(mod => mod.id !== 'conf_word_count') // FILTER HIDDEN MODULE
    .sort((a, b) => {
      const posA = POSITION_ORDER[a.position || 'bottom'] || 99;
      const posB = POSITION_ORDER[b.position || 'bottom'] || 99;
      if (posA !== posB) return posA - posB;
      return (a.order || 0) - (b.order || 0);
  });

  const handleMoveModule = (mod: PromptModule, direction: -1 | 1) => {
      const idx = sortedModules.findIndex(m => m.id === mod.id);
      if (idx === -1) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= sortedModules.length) return;
      const targetMod = sortedModules[targetIdx];
      
      // Swap order and position if they crossed boundary
      updateConfig(prev => {
          const updated = [...prev.modules];
          const selfIdx = updated.findIndex(m => m.id === mod.id);
          const otherIdx = updated.findIndex(m => m.id === targetMod.id);
          if (selfIdx > -1 && otherIdx > -1) {
              const tempOrder = updated[selfIdx].order || 0;
              updated[selfIdx].order = updated[otherIdx].order || 0;
              updated[otherIdx].order = tempOrder;
              
              if (updated[selfIdx].position !== updated[otherIdx].position) {
                  const tempPos = updated[selfIdx].position;
                  updated[selfIdx].position = updated[otherIdx].position;
                  updated[otherIdx].position = tempPos;
              }
          }
          return { ...prev, modules: updated };
      });
  };

  const renderEditor = (mod: PromptModule | typeof config.cot) => (
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-3 p-3 border border-stone-400 dark:border-slate-700 bg-stone-200 dark:bg-slate-900/50 rounded-lg space-y-3 shadow-inner"
      >
          <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-stone-500 uppercase font-bold flex items-center gap-2">
                 <Edit2 size={12} className="text-mystic-accent" />
                 Editing: {mod.label}
              </span>
              <button 
                  onClick={() => setEditingId(null)} 
                  className="text-xs px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30 rounded flex items-center gap-1 transition-colors font-medium border border-green-500/30"
              >
                  <Check size={14}/> Save & Close
              </button>
          </div>

          {/* Module Settings Matrix (Only for regular modules) */}
          {mod.id !== config.cot.id && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-white dark:bg-slate-800 p-3 rounded border border-stone-300 dark:border-slate-700">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Label (Name)</label>
                      <input 
                         value={mod.label}
                         onChange={(e) => handleUpdateModule(mod.id, { label: e.target.value })}
                         className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none w-full focus:border-mystic-accent transition-colors"
                      />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Position (Depth)</label>
                      <select 
                         value={(mod as PromptModule).position || 'bottom'}
                         onChange={(e) => handleUpdateModule(mod.id, { position: e.target.value as PromptPosition })}
                         className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none w-full focus:border-mystic-accent transition-colors"
                      >
                         <option value="top">Top (High Priority)</option>
                         <option value="system">System (Base Rules)</option>
                         <option value="persona">Persona (Character)</option>
                         <option value="bottom">Bottom (Modifiers)</option>
                         <option value="final">Final (Absolute Low)</option>
                      </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Order (Sort)</label>
                      <input 
                         type="number"
                         value={(mod as PromptModule).order || 0}
                         onChange={(e) => handleUpdateModule(mod.id, { order: parseInt(e.target.value) || 0 })}
                         className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none w-full focus:border-mystic-accent transition-colors"
                      />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide text-mystic-accent">Inject Key (Optional)</label>
                      <input 
                         value={(mod as PromptModule).injectKey || ''}
                         onChange={(e) => handleUpdateModule(mod.id, { injectKey: e.target.value })}
                         placeholder="{{tag}}"
                         className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none w-full focus:border-mystic-accent transition-colors"
                      />
                  </div>
              </div>
          )}

          <textarea 
            value={mod.content}
            onChange={(e) => handleUpdateContent(mod.id, e.target.value)}
            className="w-full h-80 bg-stone-100 dark:bg-slate-950 border border-stone-400 dark:border-slate-700 rounded p-3 text-xs font-mono text-stone-800 dark:text-slate-300 focus:border-mystic-accent outline-none resize-y custom-scrollbar leading-relaxed shadow-inner"
            placeholder="Nhập nội dung prompt..."
          />
      </motion.div>
  );

  return (
    <>
        {/* Trigger Button */}
        <button 
            onClick={() => setIsOpen(true)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-stone-400 dark:hover:bg-slate-700/50 transition-colors group rounded-lg border border-stone-400 dark:border-slate-700 bg-stone-300 dark:bg-slate-800/30"
        >
            <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 dark:text-slate-300 group-hover:text-mystic-accent transition-colors uppercase">
                <Settings2 size={14} />
                Advanced Formatting & Preset
            </div>
            <div className="text-[10px] text-stone-500 bg-stone-400 dark:bg-slate-800 px-2 py-0.5 rounded border border-stone-400 dark:border-slate-700">
                {config.modules.filter(m => m.isActive).length} Active
            </div>
        </button>

        {/* Modal Popup */}
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-stone-200 dark:bg-mystic-900 border border-stone-400 dark:border-slate-700 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="p-5 border-b border-stone-400 dark:border-slate-800 bg-stone-300 dark:bg-slate-900/80 shrink-0 shadow-sm relative z-10">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-stone-800 dark:text-slate-200 flex items-center gap-2 tracking-tight">
                                    <Settings2 size={24} className="text-mystic-accent"/> Advanced Formatting
                                </h2>
                                <button onClick={() => setIsOpen(false)} className="text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white p-1 rounded-full hover:bg-stone-400 dark:hover:bg-slate-800 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>
                            
                                {/* Preset Selector */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 relative">
                                    <select 
                                        value={activePresetId}
                                        onChange={handleSwitchPreset}
                                        className="w-full bg-stone-100 dark:bg-mystic-950 border-2 border-stone-300 dark:border-mystic-accent/30 text-stone-800 dark:text-slate-200 text-sm font-medium rounded-lg p-2.5 appearance-none focus:outline-none focus:border-mystic-accent transition-colors cursor-pointer"
                                    >
                                        {presets.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
                                        <Settings2 size={16} />
                                    </div>
                                </div>
                                {activePresetId !== 'default' && (
                                    <>
                                        {confirmDeleteId === activePresetId ? (
                                            <div className="flex items-center gap-1 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-1 rounded-lg">
                                                <button onClick={() => handleDeletePreset(activePresetId, true)} className="p-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded" title="Xóa">
                                                    <Check size={14} />
                                                </button>
                                                <button onClick={() => setConfirmDeleteId(null)} className="p-1.5 text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 rounded" title="Hủy">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleDeletePreset(activePresetId)}
                                                className="p-2.5 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-900/30"
                                                title="Xóa Preset này"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8 bg-stone-100 dark:bg-mystic-900 relative">
                            
                            {/* 1. Core COT Section */}
                            <section className="bg-white dark:bg-slate-800/40 p-4 rounded-xl border-l-[4px] border-l-mystic-accent border-t border-r border-b border-stone-300 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <BrainCircuit size={100} />
                                </div>
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <div>
                                        <div className="flex items-center gap-2 text-base font-bold text-mystic-accent mb-1 drop-shadow-sm">
                                            <BrainCircuit size={18} />
                                            {config.cot.label}
                                        </div>
                                        <p className="text-xs text-stone-500 dark:text-slate-400">
                                            Logic cốt lõi (Chain of Thought). Module này không thể tắt.
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setEditingId(editingId === config.cot.id ? null : config.cot.id)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all border shadow-sm ${editingId === config.cot.id ? 'bg-mystic-accent text-white border-mystic-accent' : 'bg-stone-50 dark:bg-slate-800 border-stone-300 dark:border-slate-600 text-stone-600 dark:text-slate-300 hover:text-mystic-accent hover:border-mystic-accent/50'}`}
                                    >
                                        <Edit2 size={14} /> {editingId === config.cot.id ? 'Đang sửa...' : 'Chỉnh sửa'}
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {editingId === config.cot.id && renderEditor(config.cot.context || config.cot)}
                                </AnimatePresence>
                            </section>

                            {/* 2. Modules List */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between bg-stone-100/90 dark:bg-mystic-900/90 backdrop-blur pb-2 z-20">
                                    <h4 className="text-sm font-bold text-stone-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-3">
                                        <Settings2 size={16} /> 
                                        Modules Workflow
                                        <div className="h-[1px] w-12 bg-stone-300 dark:bg-slate-700 rounded-full"></div>
                                    </h4>
                                    <button 
                                        onClick={handleAddModule}
                                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-mystic-accent text-white rounded hover:bg-mystic-accent/90 transition-colors shadow-sm font-medium"
                                    >
                                        <Plus size={14} /> Thêm Module
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {sortedModules.map((mod, index) => (
                                        <div key={mod.id ? `${mod.id}-${index}` : index} className={`rounded-xl border transition-all ${mod.isActive ? 'bg-white dark:bg-slate-800/80 border-stone-300 dark:border-slate-600 shadow-sm' : 'bg-stone-50 dark:bg-slate-900/40 border-stone-200 dark:border-slate-800 opacity-60'}`}>
                                            <div className="p-3 flex justify-between items-center group">
                                                
                                                {/* Left Side: Reorder & Info */}
                                                <div className="flex items-center flex-1 mr-4 gap-3">
                                                    {/* Reorder actions */}
                                                    <div className="flex flex-col gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleMoveModule(mod, -1); }}
                                                            disabled={index === 0}
                                                            className="p-0.5 hover:bg-stone-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                        >
                                                            <ArrowUp size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleMoveModule(mod, 1); }}
                                                            disabled={index === sortedModules.length - 1}
                                                            className="p-0.5 hover:bg-stone-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                        >
                                                            <ArrowDown size={12} />
                                                        </button>
                                                    </div>

                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className={`text-sm font-bold ${mod.isActive ? 'text-stone-800 dark:text-slate-200' : 'text-stone-400 dark:text-slate-500 line-through'}`}>
                                                                {mod.label}
                                                            </span>
                                                            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 bg-stone-200 dark:bg-slate-700 text-stone-500 dark:text-slate-400 rounded">
                                                                {mod.position || 'Bottom'}
                                                            </span>
                                                            {mod.injectKey && (
                                                                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 bg-mystic-accent/10 text-mystic-accent border border-mystic-accent/20 rounded">
                                                                    Inject: {mod.injectKey}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <button 
                                                                onClick={() => setEditingId(editingId === mod.id ? null : mod.id)}
                                                                className={`text-xs flex items-center gap-1 font-medium transition-colors ${editingId === mod.id ? 'text-mystic-accent' : 'text-stone-500 hover:text-stone-800 dark:hover:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-700 px-1 -ml-1 rounded'}`}
                                                            >
                                                                <Edit2 size={12} /> {editingId === mod.id ? 'Đang sửa...' : 'Sửa Setting & Content'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteModule(mod.id)}
                                                                className="text-[10px] text-red-500/70 hover:text-red-500 flex items-center gap-1 transition-colors"
                                                            >
                                                                <Trash2 size={10} /> Xóa
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Toggle */}
                                                <button 
                                                    onClick={() => handleToggleModule(mod.id)}
                                                    className={`${mod.isActive ? 'text-green-500 drop-shadow-md' : 'text-stone-300 dark:text-slate-600'} hover:scale-[1.15] transition-transform`}
                                                    title={mod.isActive ? "Đang BẬT" : "Đang TẮT"}
                                                >
                                                    {mod.isActive ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                                                </button>

                                            </div>
                                            
                                            {/* Expandable Editor */}
                                            <AnimatePresence>
                                                {editingId === mod.id && (
                                                    <div className="px-3 pb-3 border-t border-stone-200 dark:border-slate-700/50 bg-stone-50 dark:bg-slate-800/30 rounded-b-xl">
                                                        {renderEditor(mod)}
                                                    </div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* 3. Post-History Instructions */}
                            <section className="space-y-4 pt-4 border-t border-stone-300 dark:border-slate-700">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-stone-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-3">
                                        <Settings2 size={16} /> 
                                        Post-History Instructions
                                        <div className="h-[1px] w-12 bg-stone-300 dark:bg-slate-700 rounded-full"></div>
                                    </h4>
                                    <p className="text-xs text-stone-500 shrink-0">Chỉ dụ đặt ở Hàng Cuối Cùng (Sau lịch sử chat)</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-stone-300 dark:border-slate-600 shadow-sm">
                                    <textarea
                                        className="w-full bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded-lg p-3 text-sm text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors custom-scrollbar"
                                        placeholder="Nhập Post-History Instructions vào đây..."
                                        rows={4}
                                        value={config.postHistoryInstructions || ''}
                                        onChange={(e) => {
                                            updateConfig(prev => ({ ...prev, postHistoryInstructions: e.target.value }));
                                        }}
                                    />
                                </div>
                            </section>

                            {/* 4. AI Config Overrides */}
                            <section className="space-y-4 pt-4 border-t border-stone-300 dark:border-slate-700">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-stone-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-3">
                                        <Settings2 size={16} /> 
                                        AI Config Overrides
                                        <div className="h-[1px] w-12 bg-stone-300 dark:bg-slate-700 rounded-full"></div>
                                    </h4>
                                    <p className="text-xs text-stone-500 shrink-0">Các setting này sẽ ghi đè Cài Đặt AI chung</p>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-stone-300 dark:border-slate-600 shadow-sm">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Temperature</label>
                                        <input 
                                            type="number" step="0.1" min="0" max="2"
                                            value={config.aiConfigOverrides?.temperature ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('temperature', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0.9)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Top P</label>
                                        <input 
                                            type="number" step="0.05" min="0" max="1"
                                            value={config.aiConfigOverrides?.topP ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('topP', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0.95)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Top K</label>
                                        <input 
                                            type="number" step="1" min="0"
                                            value={config.aiConfigOverrides?.topK ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('topK', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 40)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Max Tokens</label>
                                        <input 
                                            type="number" step="512" min="1024"
                                            value={config.aiConfigOverrides?.maxOutputTokens ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('maxOutputTokens', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 4096)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Rep. Penalty</label>
                                        <input 
                                            type="number" step="0.05" min="0" max="2"
                                            value={config.aiConfigOverrides?.repetitionPenalty ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('repetitionPenalty', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 1.1)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Freq. Penalty</label>
                                        <input 
                                            type="number" step="0.05" min="-2" max="2"
                                            value={config.aiConfigOverrides?.frequencyPenalty ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('frequencyPenalty', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Pres. Penalty</label>
                                        <input 
                                            type="number" step="0.05" min="-2" max="2"
                                            value={config.aiConfigOverrides?.presencePenalty ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('presencePenalty', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Min P</label>
                                        <input 
                                            type="number" step="0.01" min="0" max="1"
                                            value={config.aiConfigOverrides?.minP ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('minP', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0.05)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Top A</label>
                                        <input 
                                            type="number" step="0.05" min="0" max="1"
                                            value={config.aiConfigOverrides?.topA ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('topA', e.target.value ? parseFloat(e.target.value) : undefined)}
                                            placeholder="Ghi đè (vd: 0)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] text-stone-500 font-bold uppercase tracking-wide">Thinking Budget</label>
                                        <input 
                                            type="number" step="1" min="0" max="65536"
                                            value={config.aiConfigOverrides?.thinkingBudget ?? ''}
                                            onChange={(e) => handleUpdateAIConfig('thinkingBudget', e.target.value ? parseInt(e.target.value) : undefined)}
                                            placeholder="Token (vd: 1024)"
                                            className="bg-stone-50 dark:bg-slate-900 border border-stone-300 dark:border-slate-600 rounded p-1.5 text-xs text-stone-800 dark:text-slate-200 outline-none focus:border-mystic-accent transition-colors"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-stone-300 dark:border-slate-800 bg-stone-200/50 dark:bg-mystic-950 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleReset}
                                    className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20 px-3 py-2 rounded-lg transition-colors font-medium border border-transparent hover:border-red-200 dark:hover:border-red-900/30"
                                >
                                    <RotateCcw size={14} /> Reset Mặc định
                                </button>
                                <div className="h-4 w-[1px] bg-stone-400 dark:bg-slate-700 mx-1"></div>
                                <button 
                                    onClick={handleExport}
                                    className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-slate-300 hover:bg-stone-300 dark:hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors font-medium"
                                >
                                    <Download size={14} /> Export File
                                </button>
                                <label className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-slate-300 hover:bg-stone-300 dark:hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium">
                                    <Upload size={14} />
                                    Import Tawa/ST
                                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                            
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="px-6 py-2 bg-stone-700 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-stone-800 dark:hover:bg-white rounded-lg text-sm font-bold transition-transform active:scale-95 shadow-md"
                            >
                                Đóng & Lưu
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Modal Import Settings */}
        <AnimatePresence>
            {importState && importState.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-stone-900/60 dark:bg-slate-900/80 backdrop-blur-sm"
                        onClick={() => setImportState(null)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl relative z-10 flex flex-col overflow-hidden max-h-[90vh]"
                    >
                        <div className="flex flex-col p-4 border-b border-stone-100 dark:border-slate-800/60 bg-stone-50/50 dark:bg-slate-900/50">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-stone-800 dark:text-slate-200">Preset được trích xuất</h3>
                                <button onClick={() => setImportState(null)} className="p-1 hover:bg-stone-200 dark:hover:bg-slate-800 rounded-full text-stone-500 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => setImportState({...importState, activeTab: 'config'})} 
                                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${importState.activeTab === 'config' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                                  Cấu hình AI
                                </button>
                                <button 
                                  onClick={() => setImportState({...importState, activeTab: 'modules'})} 
                                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${importState.activeTab === 'modules' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                                  Mô đun
                                </button>
                                {importState.importedRegexes && importState.importedRegexes.length > 0 && (
                                    <button 
                                      onClick={() => setImportState({...importState, activeTab: 'regex'})} 
                                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${importState.activeTab === 'regex' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                                      Regex ({importState.importedRegexes.length})
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest">Tên Preset</label>
                                    <input 
                                        type="text" 
                                        value={importState.presetName}
                                        onChange={e => setImportState({...importState, presetName: e.target.value})}
                                        className="w-full bg-stone-100 dark:bg-slate-800/50 border border-stone-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-stone-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest">Lựa chọn CoT (Bắt buộc)</label>
                                    <select 
                                        value={importState.selectedCotId}
                                        onChange={e => setImportState({...importState, selectedCotId: e.target.value})}
                                        className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-lg px-3 py-2 text-sm font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent custom-scrollbar"
                                    >
                                        <option value="keep_current">-- Giữ CoT Tawa Ultimate --</option>
                                        <option value="none">-- Không Dùng CoT (Tắt Tư Duy) --</option>
                                        {importState.allModules.map((mod, idx) => (
                                            <option key={mod.id} value={mod.id}>
                                                {mod.label || `Module ${idx + 1}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <hr className="border-stone-200 dark:border-slate-800 my-2" />

                            {importState.activeTab === 'config' && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-stone-800 dark:text-slate-200 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Settings2 size={14} className="text-stone-400" /> Cấu hình API Override
                                    </h4>
                                    
                                    {!importState.aiConfigOverrides || Object.keys(importState.aiConfigOverrides).length === 0 ? (
                                        <p className="text-sm text-stone-500 italic">Preset này không bao gồm cấu hình chỉ số AI.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {Object.entries(importState.aiConfigOverrides).map(([key, val]) => (
                                                <div key={key} className="bg-stone-100 dark:bg-slate-800/50 border border-stone-200 dark:border-slate-700 rounded-lg p-3">
                                                    <div className="text-[10px] font-black uppercase text-stone-500 mb-1">{key}</div>
                                                    <div className="text-sm font-medium text-stone-800 dark:text-slate-200 font-mono">{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {importState.activeTab === 'modules' && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-stone-800 dark:text-slate-200 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <BrainCircuit size={14} className="text-stone-400" /> Mô đun trích xuất
                                    </h4>
                                    {importState.allModules.length === 0 ? (
                                        <p className="text-sm text-stone-500 italic">Không có mô đun nào được tìm thấy trong preset.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {importState.allModules.map((mod, idx) => (
                                                <div key={mod.id ? `${mod.id}-${idx}` : idx} className={`bg-stone-50 dark:bg-slate-800/80 border ${importState.selectedCotId === mod.id ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : 'border-stone-200 dark:border-slate-700'} rounded-lg p-3`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs font-bold text-stone-700 dark:text-slate-300">
                                                            {mod.label || 'Mô đun không tên'}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-stone-200 dark:bg-slate-700 text-stone-600 dark:text-slate-400">
                                                            {mod.position || 'Unknown'}
                                                        </span>
                                                        {importState.selectedCotId === mod.id && (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                                                Đang chọn làm Lõi Tư Duy
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-stone-600 dark:text-slate-400 font-mono bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-700 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                                        {mod.content}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {importState.activeTab === 'regex' && importState.importedRegexes && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-stone-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
                                         Regex Scripts <span className="text-indigo-500">({importState.importedRegexes.length})</span>
                                    </h4>
                                    <p className="text-xs text-stone-500 italic -mt-2">Các Regex Script dưới đây sẽ được hợp nhất vào Regex toàn cục của hệ thống.</p>
                                    
                                    <div className="grid grid-cols-1 gap-2">
                                        {importState.importedRegexes.map((rx: any, idx: number) => (
                                            <div key={idx} className="bg-stone-50 dark:bg-slate-800/80 border border-stone-200 dark:border-slate-700 rounded p-3">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="text-xs font-bold text-stone-700 dark:text-slate-300">
                                                        {rx.scriptName || `Regex #${idx + 1}`}
                                                    </div>
                                                    <div className="text-[10px] font-bold px-1.5 py-0.5 bg-stone-200 dark:bg-slate-700 rounded text-stone-600 dark:text-slate-400">
                                                        {rx.placement ? `Vị trí: ${rx.placement.join(', ')}` : 'Vị trí: Mặc định'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 mb-2 mt-2">
                                                    <span className="text-[10px] text-stone-500 font-bold uppercase w-12">Find Regex</span>
                                                    <div className="text-xs font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-1.5 py-1 rounded truncate flex-1">{rx.findRegex || 'N/A'}</div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-stone-500 font-bold uppercase w-12">Thay thế</span>
                                                    <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-1 rounded truncate flex-1">{rx.replaceString || 'N/A'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-stone-100 dark:border-slate-800/60 bg-stone-50/50 dark:bg-slate-900/50 flex justify-end gap-2 shrink-0">

                            <button 
                                onClick={() => setImportState(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                            >
                                Hủy
                            </button>
                            <button 
                                onClick={handleConfirmImport}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-transform active:scale-95 shadow-md flex items-center gap-1.5"
                            >
                                <Check size={16} /> Hoàn tất Import
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </>
  );
};

export default TawaPresetManager;
