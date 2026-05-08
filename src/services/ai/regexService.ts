import { RegexScript } from "../../types";

function parseRegex(findRegex: string): RegExp {
  const match = findRegex.match(/^\/(.+)\/([gimsuy]*)$/s);
  if (match) return new RegExp(match[1], match[2] || 'g');
  return new RegExp(findRegex, 'g');
}

function stripCodeFence(str: string): string {
  const fenced = str.match(/^\s*```[a-z0-9-]*\r?\n([\s\S]*?)\n?```\s*$/i);
  return fenced ? fenced[1] : str;
}

export const applyRegexScripts = (
  text: string, 
  scripts: RegexScript[], 
  macros: Record<string, string> // { "{{user}}": "Anon", "{{char}}": "Dora" }
): string => {
  if (!text || !scripts || scripts.length === 0) return text;
  
  let processedText = text;

  scripts.filter(s => !s.disabled).forEach(script => {
    try {
      if (!script.findRegex) return;
      
      let replacement = stripCodeFence(script.replaceString || '');
      
      // 1. Thay thế macro trong chuỗi thay thế (Replacement)
      Object.entries(macros).forEach(([key, value]) => {
        let safeValue = value || '';
        safeValue = safeValue.replace(/\$/g, '$$$$');
        replacement = replacement.replaceAll(key, safeValue);
      });

      replacement = replacement.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

      // 2. Khởi tạo Regex an toàn
      const re = parseRegex(script.findRegex); 
      
      // 3. Thực thi
      processedText = processedText.replace(re, replacement);
    } catch (e) {
      console.error(`Regex error in ${script.scriptName || script.id}:`, e);
    }
  });

  return processedText;
};

