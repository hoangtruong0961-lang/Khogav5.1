
import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { RegexScript } from '../../types';
import { getRegexedString } from '../../utils/regex';
import { dbService } from '../../services/db/indexedDB';

class RegexWidgetElement extends HTMLElement {
  static get observedAttributes() {
    return ['data-content'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'data-content' && oldValue !== newValue) {
      this.renderContent();
    }
  }

  renderContent() {
    const contentAttr = this.getAttribute('data-content');
    if (!contentAttr) return;

    let scriptName = 'Unknown Regex Script';
    try {
      const scriptAttr = this.getAttribute('data-script');
      if (scriptAttr) {
        scriptName = typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(scriptAttr))) : Buffer.from(scriptAttr, 'base64').toString('utf-8');
      }
    } catch(e) {
      // Ignored empty block
    }

    let decoded = '';
    try {
      if (typeof atob !== 'undefined') {
        decoded = decodeURIComponent(escape(atob(contentAttr)));
      } else {
        decoded = Buffer.from(contentAttr, 'base64').toString('utf-8');
      }
    } catch (e) {
      console.error("Error decoding Regex Widget:", e);
      decoded = '<div style="color:red;font-size:12px;">Error decoding widget</div>';
    }

    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = decoded;
      
      // Execute scripts since innerHTML prevents execution
      const scripts = this.shadowRoot.querySelectorAll('script');
      scripts.forEach((script) => {
        if (script.getAttribute('src')) {
          // External script: we must recreate and append it to load
          try {
            const newScript = document.createElement('script');
            Array.from(script.attributes).forEach(attr => {
              try {
                newScript.setAttribute(attr.name, attr.value);
              } catch (aErr) {
                 // ignore
              }
            });
            
            if (script.parentNode) {
              script.parentNode.replaceChild(newScript, script);
            } else {
              this.shadowRoot?.appendChild(newScript);
            }
          } catch (err) {
            console.debug("Error appending external script [", scriptName, "]:", err);
          }
        } else if (script.innerHTML || script.textContent) {
          // Inline script: execute securely to catch SyntaxError and parse errors
          let unescaped = script.innerHTML || script.textContent || '';
          
          // Get unescaped code if it was entity-encoded by regex
          if (unescaped.includes('&lt;') || unescaped.includes('&#') || unescaped.includes('&amp;')) {
            const doc = new DOMParser().parseFromString('<!DOCTYPE html><body><textarea>' + unescaped + '</textarea></body>', 'text/html');
            const ta = doc.querySelector('textarea');
            if (ta) unescaped = ta.value;
          }
          
          // Clean invalid invisible characters that cause SyntaxErrors
          unescaped = unescaped.replace(/[\u200B-\u200D\uFEFF]/g, '');
          
          // Fix literal newlines in split/join without breaking comments or regexes
          // LLMs often output a physical newline when they meant \\n in split/replace methods
          unescaped = unescaped.replace(/\.split\(\s*['"]\r?\n['"]\s*\)/g, ".split('\\n')");
          unescaped = unescaped.replace(/\.join\(\s*['"]\r?\n['"]\s*\)/g, ".join('\\n')");
          unescaped = unescaped.replace(/\.replace\(\s*['"]\r?\n['"]\s*,/g, ".replace('\\n',");
          
          try {
            // Prevent multiple executions of the exact same script which leads to duplicate event listeners and SyntaxErrors
            const globalObj = window as any;
            if (!globalObj.__regexExecutedScripts) {
              globalObj.__regexExecutedScripts = new Set();
            }
            if (!globalObj.__regexExecutedScripts.has(unescaped)) {
              globalObj.__regexExecutedScripts.add(unescaped);
              
              // Using new Function with parameters avoids syntax errors caused by interpolating code strings
              const executor = new Function('scriptName', 'scriptCode', `
                if (typeof window.errorCatched === 'undefined') {
                  window.errorCatched = function(e) { console.error("🚨 errorCatched từ Regex Script [" + scriptName + "]:", String(e)); };
                }
                try {
                  // Execute natively in global scope using indirect eval
                  (0, eval)(scriptCode + "\\n//# sourceURL=" + encodeURIComponent(scriptName.replace(/\\s+/g, '_')) + ".js");
                } catch(e) {
                  var lines = scriptCode.split('\\n');
                  var codeWithLines = lines.map(function(l, i) { return (i + 1) + '\\t| ' + l; }).join('\\n');
                  var shortCode = codeWithLines.length > 50000 ? codeWithLines.substring(0, 50000) + '\\n... (bị cắt bớt vì quá dài)' : codeWithLines;
                  var errMsg = "🚨 LỖI REGEX SCRIPT [" + scriptName + "]\\n\\n" +
                               "Thông báo lỗi: " + (e.stack || e.message || String(e)) + "\\n\\n" +
                               "--- MÃ NGUỒN CỦA BẠN (có đánh số dòng) ---\\n" + 
                               shortCode + "\\n" +
                               "-------------------------------------------";
                  console.error(errMsg);
                }
              `);
              executor(scriptName, unescaped);
            }
          } catch (parseErr: any) {
            console.error("🚨 LỖI KHỞI TẠO REGEX SCRIPT [" + scriptName + "]\n" + (parseErr?.message || String(parseErr)));
          }
          
          // Remove the dummy script node
          try {
            script.remove();
          } catch(e) {
            // ignore
          }
        }
      });
    }
  }

  connectedCallback() {
    this.renderContent();
  }
}

if (typeof window !== 'undefined' && !customElements.get('regex-widget')) {
  customElements.define('regex-widget', RegexWidgetElement);
}

const RegexScriptExecutor = ({ src, code }: { src?: string, code?: string }) => {
  useEffect(() => {
    if (src) {
      const scriptName = src;
      try {
        const newScript = document.createElement('script');
        newScript.src = src;
        document.body.appendChild(newScript);
        return () => {
          document.body.removeChild(newScript);
        };
      } catch (err) {
        console.debug("Error appending external script [", scriptName, "]:", err);
      }
    } else if (code) {
      let unescaped = String(code);
      if (unescaped.includes('&lt;') || unescaped.includes('&#') || unescaped.includes('&amp;')) {
        const doc = new DOMParser().parseFromString('<!DOCTYPE html><body><textarea>' + unescaped + '</textarea></body>', 'text/html');
        const ta = doc.querySelector('textarea');
        if (ta) unescaped = ta.value;
      }
      unescaped = unescaped.replace(/[\u200B-\u200D\uFEFF]/g, '');
      unescaped = unescaped.replace(/\.split\(\s*['"]\r?\n['"]\s*\)/g, ".split('\\n')");
      unescaped = unescaped.replace(/\.join\(\s*['"]\r?\n['"]\s*\)/g, ".join('\\n')");
      unescaped = unescaped.replace(/\.replace\(\s*['"]\r?\n['"]\s*,/g, ".replace('\\n',");
      
      try {
        const globalObj = window as any;
        if (!globalObj.__regexExecutedScripts) {
          globalObj.__regexExecutedScripts = new Set();
        }
        if (!globalObj.__regexExecutedScripts.has(unescaped)) {
          globalObj.__regexExecutedScripts.add(unescaped);
          const executor = new Function('scriptName', 'scriptCode', `
            try {
              (0, eval)(scriptCode + "\\n//# sourceURL=Inline_Regex_Script.js");
            } catch(e) {
              console.error("🚨 LỖI REGEX SCRIPT \\n" + String(e));
            }
          `);
          executor('Inline Regex Script', unescaped);
        }
      } catch (parseErr) {
        console.error("🚨 LỖI KHỞI TẠO REGEX SCRIPT\\n" + String(parseErr));
      }
    }
  }, [src, code]);
  return <span className="hidden" aria-hidden="true" />;
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
  regexScripts?: RegexScript[];
  userName?: string;
  charName?: string;
  messageRole?: 'user' | 'assistant' | 'system';
}

const MemoizedTawaWidget = React.memo(({ children }: any) => {
  const base64Html = children?.toString() || '';
  if (!base64Html) return null;
  let decoded = '';
  try {
    if (typeof atob !== 'undefined') {
        decoded = decodeURIComponent(escape(atob(base64Html)));
    } else {
        decoded = Buffer.from(base64Html, 'base64').toString('utf-8');
    }
  } catch (e) {
    console.error("Lỗi decode HTML widget:", e);
    return <div className="p-4 border border-red-500 text-red-500 rounded bg-red-500/10 text-xs">Error decoding widget</div>;
  }
  return (
    <div className="w-full my-6 bg-stone-900 rounded-xl overflow-hidden border-2 border-stone-700 shadow-xl">
      <iframe 
        srcDoc={decoded} 
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        className="w-full min-h-[600px] resize-y border-0"
        title="Tawa Protocol Custom Widget"
      />
    </div>
  );
});

const extractText = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
};

const TagBadge = ({ label, value, bg }: { label: string, value: string, bg: string }) => (
  <div className={`px-2 py-1 rounded inline-flex items-center gap-1.5 ${bg} border border-black/10 dark:border-white/10 text-[10px] font-mono mr-1 mb-1 whitespace-nowrap`}>
    <span className="font-bold opacity-60 uppercase">{label}</span>
    <span className="font-bold">{value}</span>
  </div>
);

const markdownComponents: import('react-markdown').Components = {
  p: ({ children }) => <div className="mb-4 leading-relaxed">{children}</div>,
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 text-mystic-accent">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5 text-mystic-accent/90">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4 text-mystic-accent/80">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-mystic-accent/30 pl-4 py-1 my-4 italic bg-stone-200/30 dark:bg-slate-800/30 rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 bg-stone-300/50 dark:bg-slate-700/50 rounded font-mono text-xs">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="p-4 bg-stone-900 text-stone-100 rounded-lg overflow-x-auto my-4 text-xs font-mono">
      {children}
    </pre>
  ),
  script: ({ children, src, ...props }: any) => {
    const code = Array.isArray(children) ? children.join('\n') : children;
    return <RegexScriptExecutor src={src} code={code} />;
  },
  style: ({ children, ...props }: any) => {
    const code = Array.isArray(children) ? children.join('\n') : children;
    return <style {...props} dangerouslySetInnerHTML={{ __html: code || '' }} />;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="min-w-full border-collapse border border-stone-300 dark:border-slate-700">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-stone-300 dark:border-slate-700 px-4 py-2 bg-stone-200 dark:bg-slate-800 font-bold text-left text-xs uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-stone-300 dark:border-slate-700 px-4 py-2 text-sm">
      {children}
    </td>
  ),
  hr: () => <hr className="my-8 border-t border-stone-300 dark:border-slate-700" />,
  strong: ({ children }) => <strong className="font-bold text-mystic-accent/80">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  a: ({ href, children, ...props }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-mystic-accent hover:underline decoration-mystic-accent/30 underline-offset-2"
      {...props}
    >
      {children}
    </a>
  ),
  // === Regex HTML Elements Support ===
  input: ({ node, ...props }: any) => {
    if (props.type === 'checkbox' || props.type === 'radio') {
      return <input className="w-4 h-4 text-mystic-accent bg-stone-100 border-gray-300 rounded focus:ring-mystic-accent dark:bg-slate-700 dark:border-gray-600 cursor-pointer" {...props} />;
    }
    if (props.type === 'hidden') {
      return <input {...props} className="hidden" />;
    }
    return <input className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm text-stone-900 dark:text-stone-100" {...props} />;
  },
  select: ({ node, ...props }: any) => (
    <select className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm text-stone-900 dark:text-stone-100 cursor-pointer" {...props}>
      {props.children}
    </select>
  ),
  option: ({ node, ...props }: any) => <option {...props}>{props.children}</option>,
  textarea: ({ node, ...props }: any) => (
    <textarea className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm w-full min-h-[80px] text-stone-900 dark:text-stone-100 resize-y" {...props} />
  ),
  button: ({ node, ...props }: any) => (
    <button className="px-4 py-2 bg-mystic-accent text-white font-medium rounded shadow hover:bg-mystic-accent/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mystic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" {...props}>
      {props.children}
    </button>
  ),
  div: ({ node, className, ...props }: any) => (
    <div className={className} {...props}>{props.children}</div>
  ),
  span: ({ node, className, ...props }: any) => (
    <span className={className} {...props}>{props.children}</span>
  ),
  form: ({ node, ...props }: any) => (
    <form className="space-y-4 my-4 p-4 border border-stone-200 dark:border-slate-700 rounded-lg bg-stone-50 dark:bg-slate-800/20" {...props}>
      {props.children}
    </form>
  ),
  label: ({ node, className, ...props }: any) => (
    <label className={`block text-sm font-medium text-stone-700 dark:text-stone-300 ${className || 'mb-1'}`} {...props}>
      {props.children}
    </label>
  ),
  details: ({ node, ...props }: any) => (
    <details className="mb-4 border border-stone-300 dark:border-slate-700 rounded-md p-3 bg-stone-50 dark:bg-slate-800/50 group" {...props}>
      {props.children}
    </details>
  ),
  summary: ({ node, ...props }: any) => (
    <summary className="font-semibold cursor-pointer text-stone-800 dark:text-stone-200 group-open:mb-2 hover:text-mystic-accent transition-colors" {...props}>
      {props.children}
    </summary>
  ),
  // === /Regex HTML Elements Support ===
  think: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  thinking: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  content: ({ children, ...props }: any) => <div className="mb-4" {...props}>{children}</div>,
  story: ({ children, ...props }: any) => <div className="mb-4" {...props}>{children}</div>,
  branches: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  choices: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  actions: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  incrementalSummary: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  table_stored: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  tableEdit: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  user_input: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  
  font: ({ color, children, ...props }: any) => <span style={color ? { color } : {}} {...props}>{children}</span>,
  
  equip: ({ children, ...props }: any) => (
    <div className="my-4 border border-blue-500/30 bg-blue-500/10 rounded-lg p-4 shadow-sm" {...props}>
      <div className="flex items-center gap-2 mb-2 font-bold text-blue-500 uppercase text-xs tracking-wider">
        🛡️ Trang Bị / Vật Phẩm
      </div>
      <div className="text-sm font-medium whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  swordskill: ({ children, ...props }: any) => (
    <div className="my-4 border border-red-500/30 bg-red-500/10 rounded-lg p-4 shadow-sm" {...props}>
      <div className="flex items-center gap-2 mb-2 font-bold text-red-500 uppercase text-xs tracking-wider">
        ⚔️ Kiếm Kỹ / Kỹ Năng
      </div>
      <div className="text-sm font-medium whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  'user-status': ({ children, ...props }: any) => (
    <div className="my-4 border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4 shadow-sm" {...props}>
      <div className="flex items-center gap-2 mb-2 font-bold text-emerald-600 dark:text-emerald-400 uppercase text-xs tracking-wider">
        👤 Bảng Trạng Thái
      </div>
      <div className="text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  calendar: ({ children, ...props }: any) => {
    const text = extractText(children);
    
    // Parse pseudo-YAML calendar
    let year = '', month = '', day = '';
    const events: {day: string, text: string}[] = [];
    
    const lines = text.split('\n');
    let parsingDays = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('year:')) year = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('month:')) month = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('current_day:')) day = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('days:')) parsingDays = true;
      else if (parsingDays) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0 && colonIdx < 10) { // e.g., "6:" or "12:"
           const d = trimmed.substring(0, colonIdx).trim();
           const eventText = trimmed.substring(colonIdx + 1).trim();
           events.push({ day: d, text: eventText });
        } else if (events.length > 0) {
           events[events.length - 1].text += ' ' + trimmed;
        }
      }
    }
    
    if (year || month || day || events.length > 0) {
      return (
        <div className="my-4 border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl p-0 overflow-hidden shadow-sm" {...props}>
          <div className="bg-purple-500/10 px-4 py-3 flex items-center justify-between border-b border-purple-500/20">
            <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400 uppercase text-xs tracking-wider">
              <i className="fas fa-calendar-alt"></i> Lịch Trình
            </div>
            {(year || month || day) && (
              <div className="text-[10px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded">
                Ngày {day}/{month}/{year}
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            {events.map((e, i) => {
              const isCurrent = e.day === day;
              return (
                <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${isCurrent ? 'bg-purple-500/20 border-purple-500/40' : 'bg-stone-500/5 border-stone-500/20 hover:border-purple-500/30'}`}>
                  <div className={`w-8 h-8 shrink-0 flex flex-col items-center justify-center rounded uppercase font-bold text-[10px] ${isCurrent ? 'bg-purple-500 text-white shadow-md' : 'bg-stone-200 dark:bg-slate-700 text-stone-600 dark:text-slate-300'}`}>
                    <span className="text-xs leading-none">{e.day}</span>
                  </div>
                  <div className={`text-sm pt-1 leading-relaxed ${isCurrent ? 'text-purple-900 dark:text-purple-100 font-medium' : 'text-stone-700 dark:text-stone-300'}`}>
                    {e.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="my-4 border border-purple-500/30 bg-purple-500/5 rounded-lg p-4 shadow-sm" {...props}>
        <div className="flex items-center gap-2 mb-2 font-bold text-purple-600 dark:text-purple-400 uppercase text-xs tracking-wider">
          📅 Lịch Trình / Thời Gian
        </div>
        <div className="text-sm whitespace-pre-wrap font-mono text-stone-800 dark:text-stone-200">
          {children}
        </div>
      </div>
    );
  },
  'zd-status': ({ children, ...props }: any) => {
    const text = extractText(children);
    const hasBrackets = text.includes('[') && text.includes(']');
    
    // Default render for pre-formatted blocks that don't match bracket syntax (or fallback)
    let content = <div className="text-sm whitespace-pre-wrap font-mono text-stone-800 dark:text-stone-200">{children}</div>;
    
    if (hasBrackets) {
      const tags: {key: string, value: string}[] = [];
      const regex = /\[(.*?)\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split(':');
        if (parts.length >= 2) {
           tags.push({ key: parts[0].trim(), value: parts.slice(1).join(':').trim() });
        } else {
           tags.push({ key: 'TRẠNG THÁI', value: parts[0] });
        }
      }
      
      if (tags.length > 0) {
        content = (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((t, i) => (
              <TagBadge key={i} label={t.key} value={t.value} bg="bg-amber-500/20 text-amber-800 dark:text-amber-200" />
            ))}
          </div>
        );
      }
    }

    return (
      <div className="my-4 border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl p-4 shadow-sm" {...props}>
        <div className="flex items-center gap-2 mb-3 font-bold text-amber-600 dark:text-amber-400 uppercase text-xs tracking-wider border-b border-amber-500/20 pb-2">
          <i className="fas fa-chart-bar"></i> Trạng Thái Trận Chiến
        </div>
        {content}
      </div>
    );
  },
  digest: ({ children, ...props }: any) => {
    const text = extractText(children);
    const hasBrackets = text.includes('[') && text.includes(']');
    
    let content = <div className="text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-200">{children}</div>;
    
    if (hasBrackets) {
      const tags: {key: string, value: string}[] = [];
      const regex = /\[(.*?)\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split(':');
        if (parts.length >= 2) {
           tags.push({ key: parts[0].trim(), value: parts.slice(1).join(':').trim() });
        } else {
           tags.push({ key: 'INFO', value: parts[0] });
        }
      }
      
      if (tags.length > 0) {
        content = (
          <div className="flex flex-col gap-2 mt-1">
            {tags.map((t, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-stone-500/10 rounded-lg p-2.5 border border-stone-500/20">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-stone-500 min-w-[100px] shrink-0 mt-0.5">{t.key}</span>
                <span className="text-sm text-stone-800 dark:text-stone-200 font-medium leading-relaxed">{t.value}</span>
              </div>
            ))}
          </div>
        );
      }
    }

    return (
      <div className="my-4 border border-stone-500/30 bg-stone-500/5 rounded-xl p-4 shadow-sm" {...props}>
        <div className="flex items-center gap-2 mb-3 font-bold text-stone-600 dark:text-stone-400 uppercase text-xs tracking-wider border-b border-stone-500/20 pb-2">
          <i className="fas fa-clipboard-list"></i> Tóm Tắt Tình Hình
        </div>
        {content}
      </div>
    );
  },

  statusplaceholderimpl: ({ children, ...props }: any) => <span className="hidden" aria-hidden="true" {...props}>{children}</span>,
  real: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  ontologicalseverance: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  user: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  hypotheticalconstruct: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  axiomaticimmunity: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  experimentaldrift: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  hermeticseal: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  resonancepurpose: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  sovereignlogic: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  'tawa-widget': MemoizedTawaWidget as any,
  'regex-widget': (props: any) => {
    return React.createElement('regex-widget', { "data-content": props['data-content'] });
  },
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  className = "", 
  regexScripts,
  userName = "User",
  charName = "Character",
  messageRole
}) => {
  const [jsMode, setJsMode] = useState<'disabled' | 'auto' | 'script' | 'code_block'>('auto');

  useEffect(() => {
    dbService.getSettings().then(s => {
      if (s && s.javaScriptMode) {
        setJsMode(s.javaScriptMode);
      }
    });
  }, []);

  const processedContent = useMemo(() => {
    let text = content || '';
    
    // Resolve placeholders directly before processing
    if (userName) text = text.replace(/\{\{user\}\}/gi, userName);
    if (charName) text = text.replace(/\{\{char\}\}/gi, charName);
    
    // Check execution modes based on jsMode
    if (jsMode === 'disabled') {
      // Bỏ qua, không thi hành script nào từ text AI, cũng filter script tag
      text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else {
      if (jsMode === 'script' || jsMode === 'auto') {
        // Thay thế các thẻ script cục bộ thành regex-widget để thực thi an toàn mà không làm hỏng markdown
        const nativeScriptRegex = /<script\b[\s\S]*?<\/script>/gi;
        text = text.replace(nativeScriptRegex, (match) => {
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(match)))
              : Buffer.from(match).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });
      }

      if (jsMode === 'code_block' || jsMode === 'auto') {
        const htmlBlockRegex = /```(?:html|javascript|js)?\n([\s\S]*?)```/gi;
        const preBlockRegex = /<pre>([\s\S]*?)<\/pre>/gi;
        
        let hasMatch = false;
        
        // Thay thế các block code thành regex-widget
        text = text.replace(htmlBlockRegex, (match, code) => {
          hasMatch = true;
          const isJs = match.toLowerCase().startsWith('```javascript') || match.toLowerCase().startsWith('```js');
          const finalCode = isJs ? `<script>\n${code}\n</script>` : code;
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(finalCode)))
              : Buffer.from(finalCode).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });

        text = text.replace(preBlockRegex, (match, code) => {
          hasMatch = true;
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(code)))
              : Buffer.from(code).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });
      }
    }

    // Xóa markdown của HTML block trước nếu AI vô tình bọc block code
    text = text.replace(/```html\n?([\s\S]*?)```/gi, '$1');

    // Fix invalid custom HTML tags (ones with underscores instead of hyphens)
    // CommonMark spec enforces alphanumeric characters and hyphens for HTML tags.
    text = text.replace(/<user_status\b/gi, '<user-status');
    text = text.replace(/<\/user_status>/gi, '</user-status>');
    text = text.replace(/<zd_status\b/gi, '<zd-status');
    text = text.replace(/<\/zd_status>/gi, '</zd-status>');

    // Force blank lines around major custom structural tags to ensure they parse as block HTML in remark
    text = text.replace(/(<\/?(?:user-status|zd-status|calendar|digest|equip|swordskill|content|tableEdit|table_stored)>)/gi, '\n\n$1\n\n');
    // Remove <br> tags specifically inside blocks that use whitespace-pre-wrap 
    // to prevent double spacing when LLMs output both \n and <br>
    const stripBrTags = (match: string, innerText: string, tagName: string) => {
      const cleanText = innerText.replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n').trim();
      return `<${tagName}>\n${cleanText}\n</${tagName}>`;
    };
    
    text = text.replace(/<equip>([\s\S]*?)<\/equip>/gi, (m, c) => stripBrTags(m, c, 'equip'));
    text = text.replace(/<swordskill>([\s\S]*?)<\/swordskill>/gi, (m, c) => stripBrTags(m, c, 'swordskill'));
    text = text.replace(/<user-status>([\s\S]*?)<\/user-status>/gi, (m, c) => stripBrTags(m, c, 'user-status'));
    
    // Clean up excessive newlines
    text = text.replace(/\n{3,}/g, '\n\n');
    
    if (!regexScripts || regexScripts.length === 0 || !text) return text;
    
    // Determine which placements to apply based on role
    const placementTarget = messageRole === 'user' ? 1 : 2;

    // Protect custom structural tags from user regex scripts so our React UI doesn't get overridden
    let protectedText = text;
    const protectedTags = ['equip', 'swordskill', 'user-status', 'zd-status', 'calendar', 'digest'];
    protectedTags.forEach(tag => {
      // Replace <tag> and </tag> with <sys-tag> and </sys-tag>
      protectedText = protectedText.replace(new RegExp(`<(/?)${tag}>`, 'gi'), `<$1sys-${tag}>`);
    });
    
    let regexedText = getRegexedString(protectedText, placementTarget, regexScripts, {
        userName, 
        charName, 
        isMarkdown: true,
        isPrompt: false,
        renderPhaseOnly: true,
        depth: -1,
        isDebug: false
    });

    // Restore protected tags
    protectedTags.forEach(tag => {
      regexedText = regexedText.replace(new RegExp(`<(/?)\\s*sys-${tag}>`, 'gi'), `<$1${tag}>`);
    });

    return regexedText;
  }, [content, regexScripts, userName, charName, messageRole, jsMode]);

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
