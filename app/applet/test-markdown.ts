import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { renderToString } from "react-dom/server";

const text = `
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
<user-status>
Hyphen Status
</user-status>
`;

const html = renderToString(
    React.createElement(ReactMarkdown, {
        rehypePlugins: [rehypeRaw],
        components: {
            user_status: ({children}) => React.createElement('div', {className: 'user_status'}, children),
            calendar: ({children}) => React.createElement('div', {className: 'calendar'}, children),
            zd_status: ({children}) => React.createElement('div', {className: 'zd_status'}, children),
            digest: ({children}) => React.createElement('div', {className: 'digest'}, children),
            'user-status': ({children}) => React.createElement('div', {className: 'user-status'}, children),
        }
    }, text)
);

console.log('OUTPUT_HTML', html);
