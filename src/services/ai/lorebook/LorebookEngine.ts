
import { Lorebook, LorebookEntry } from "./types";

// Default values for common LSR variables to avoid raw macro leaks
const LSR_DEFAULTS: Record<string, string> = {
    'tableConfigDateFormat': 'YYYY-MM-DD',
    'tableConfigTimeFormat': 'hh:mm',
    'tableConfigExtraTimeFormat': 'Day X',
    'tableConfigRecentLimit': '5',
    'tableConfigCharacterMember': 'Character',
    'tableConfigContentBegin': '<content>',
    'tableConfigContentEnd': '</content>',
    'tableConfigCoTBegin': '<thinking>',
    'tableConfigCoTEnd': '</thinking>',
    'tableConfigUserInput': '<user_input>',
    'tableConfigTagsBeforeTableEdit': '',
    'tableConfigTagsAfterTableEdit': '',
    // Dummy values for logic flags
    'tableConfigSexWrite': '1',
    'tableConfigScheduleWrite': '1',
    'tableConfigAbilityWrite': '1',
    'tableConfigOrganizationWrite': '1',
    'tableConfigLocationWrite': '1',
    'tableConfigHistoryRows': '3',
    'tableConfigHistoryLength': '100 tokens',
    'tableConfigSummaryRows': '5',
    'tableConfigSummaryLength': '200 tokens',
    'tableConfigPresumeMode': '1',
    'tableConfigCharacterReferenceName': 'none',
};

export class LorebookService {
    /**
     * Converts raw JSON structure to Array
     */
    static loadLorebook(jsonData: Lorebook): LorebookEntry[] {
        if (!jsonData || !jsonData.entries) return [];
        return Object.values(jsonData.entries);
    }

    /**
     * Replaces {{getvar::key}} macros with values or defaults.
     * Also strips EJS logic blocks <%_ ... _%> as we cannot execute them safely.
     */
    static processMacros(text: string, dynamicVars: Record<string, string> = {}): string {
        let processed = text;

        // 1. Remove EJS Script Blocks (<%_ ... _%>)
        // We assume the user wants the prompt instructions, not the JS logic code
        processed = processed.replace(/<%_[\s\S]*?_%>/g, '');

        // 2. Replace {{getvar::KEY}} and {{KEY}}
        processed = processed.replace(/\{\{(?:getvar::)?(.*?)\}\}/g, (match, key) => {
            const cleanKey = key.trim();
            // Check dynamic vars first (passed from game state), then defaults
            if (dynamicVars[cleanKey] !== undefined) return dynamicVars[cleanKey];
            if (LSR_DEFAULTS[cleanKey] !== undefined) return LSR_DEFAULTS[cleanKey];
            
            // If variable not found, return empty string to hide the macro syntax
            return '';
        });

        // 3. Simple cleanup of empty lines resulting from stripped scripts
        return processed.replace(/^\s*[\r\n]/gm, '');
    }

    /**
     * Helper to check if a phrase is in text considering case and whole-word rules
     */
    private static isMatch(text: string, keyword: string, caseSensitive: boolean, matchWholeWords: boolean): boolean {
        if (!keyword.trim()) return false;
        
        let flags = 'g';
        if (!caseSensitive) flags += 'i';
        
        let patternStr = keyword.trim();
        // Escape regex special chars if we are treating as literal text (for basic matching, or consider if user uses regex keys)
        // For simplicity, we assume simple text strings, optionally using \b for whole words
        
        // If the keyword itself is a regex (e.g. /pattern/i), parse it. 
        // ST supports regex keys starting and ending with /
        if (patternStr.startsWith('/') && patternStr.lastIndexOf('/') > 0) {
            const lastSlash = patternStr.lastIndexOf('/');
            const regexStr = patternStr.substring(1, lastSlash);
            const regexFlags = patternStr.substring(lastSlash + 1);
            try {
                return new RegExp(regexStr, regexFlags).test(text);
            } catch(e) {
                return false;
            }
        }

        // Escape regex specials
        patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (matchWholeWords) {
            // Check word boundaries. Note: may not work perfectly for non-English.
            patternStr = `\\b${patternStr}\\b`;
        }
        
        try {
            return new RegExp(patternStr, flags).test(text);
        } catch(e) {
            return false; // Safely fail
        }
    }

    /**
     * Checks Primary and Secondary keywords against Selective Logic
     */
    private static evaluateKeys(text: string, entry: LorebookEntry): boolean {
        if (!entry.key || entry.key.length === 0) return false;

        const caseSens = !!entry.caseSensitive;
        const wholeWords = entry.matchWholeWords ?? true;

        // Has primary key?
        const hasPrimary = entry.key.some(k => this.isMatch(text, k, caseSens, wholeWords));
        if (!hasPrimary) return false;

        // Check secondary keys
        const secondary = entry.keysecondary || [];
        if (secondary.length === 0) return true; // No selective logic needed

        const logic = entry.selectiveLogic ?? 0;
        let matchedSecondaryCount = 0;
        
        for (const sk of secondary) {
            if (this.isMatch(text, sk, caseSens, wholeWords)) {
                matchedSecondaryCount++;
            }
        }

        switch (logic) {
            case 0: // AND ANY
                return matchedSecondaryCount > 0;
            case 1: // AND ALL
                return matchedSecondaryCount === secondary.length;
            case 2: // NOT ANY
                return matchedSecondaryCount === 0;
            case 3: // NOT ALL
                return matchedSecondaryCount < secondary.length;
            default:
                return true;
        }
    }

    /**
     * Scans inputs and returns the finalized active entries
     */
    static scanAndGetActiveEntries(
        textToScanOriginal: string, 
        entries: LorebookEntry[], 
        dynamicVars: Record<string, string> = {}
    ): LorebookEntry[] {
        const activeEntriesMap = new Map<string, LorebookEntry>(); // UID -> Entry
        
        // --- PASS 1: Main scanning
        let textToScan = textToScanOriginal;
        
        let newActivations = true;
        let recursionDepth = 0;
        const MAX_RECURSION = 3;

        while (newActivations && recursionDepth <= MAX_RECURSION) {
            newActivations = false;

            for (const entry of entries) {
                if (entry.disable) continue;
                if (activeEntriesMap.has(entry.uid.toString())) continue;
                if (recursionDepth > 0 && entry.nonRecursive) continue; // Skip non-recursive on pass > 0
                if (recursionDepth === 0 && entry.delayUntilRecursive) continue; // Skip on first pass

                let activated = false;

                if (entry.constant) {
                    activated = true;
                } else if (this.evaluateKeys(textToScan, entry)) {
                    activated = true;
                }

                if (activated) {
                    // Check probability
                    const prob = entry.probability ?? 100;
                    if (prob < 100 && Math.random() * 100 > prob) {
                        continue; // Failed probability check
                    }

                    activeEntriesMap.set(entry.uid.toString(), entry);
                    newActivations = true;
                    
                    // Add content to the scan buffer so it can trigger other entries (unless preventRecursion)
                    if (!entry.preventRecursion) {
                        textToScan += "\n" + entry.content;
                    }
                }
            }
            recursionDepth++;
        }

        const activeList = Array.from(activeEntriesMap.values());

        // --- GROUP RESOLUTION ---
        const groupWinners = new Map<string, LorebookEntry>();
        const finalizedList: LorebookEntry[] = [];

        for (const entry of activeList) {
            if (entry.group && entry.group.trim().length > 0) {
                const groupName = entry.group.trim();
                const existing = groupWinners.get(groupName);
                if (!existing || (entry.groupWeight ?? 100) > (existing.groupWeight ?? 100)) {
                    groupWinners.set(groupName, entry);
                }
            } else {
                finalizedList.push(entry);
            }
        }
        
        // Add winners back
        for (const winner of groupWinners.values()) {
            finalizedList.push(winner);
        }

        // Sorting Logic: Higher order means inserted later
        finalizedList.sort((a, b) => a.order - b.order);
        
        return finalizedList;
    }

    /**
     * Scans inputs and returns the combined text of activated entries
     */
    static scanAndActivate(
        textToScanOriginal: string, 
        entries: LorebookEntry[], 
        dynamicVars: Record<string, string> = {}
    ): string {
        const finalizedList = this.scanAndGetActiveEntries(textToScanOriginal, entries, dynamicVars);

        // Process content (Macros cleaning) and join
        const combinedText = finalizedList
            .map(e => this.processMacros(e.content, dynamicVars))
            .filter(text => text.trim().length > 0)
            .join('\n\n');

        return combinedText;
    }
}
