import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { renderToString } from "react-dom/server";

const text = `
<swordskill>
Skill
</swordskill>
</content>
<user_status>
User Status
</user_status>
<calendar>
Calendar
</calendar>
<zd_status>
ZD Status
</zd_status>
<digest>
Digest
</digest>
`;

const html = renderToString(
    React.createElement(ReactMarkdown, {
        rehypePlugins: [rehypeRaw],
        components: {
            content: ({children}) => React.createElement('div', {className: 'content'}, children),
            swordskill: ({children}) => React.createElement('div', {className: 'swordskill'}, children),
            user_status: ({children}) => React.createElement('div', {className: 'user_status'}, children),
            calendar: ({children}) => React.createElement('div', {className: 'calendar'}, children),
            zd_status: ({children}) => React.createElement('div', {className: 'zd_status'}, children),
            digest: ({children}) => React.createElement('div', {className: 'digest'}, children),
        }
    }, text)
);

console.log(html);
