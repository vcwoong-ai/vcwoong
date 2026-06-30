"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className = "" }: MarkdownProps) {
  return (
    <div className={`prose prose-sm max-w-none leading-relaxed text-gray-700 ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2 border-b border-gray-200 pb-1">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold text-gray-800 mt-3 mb-1.5">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-gray-700 mt-2 mb-1">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-0.5 mb-2 text-sm text-gray-700">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-0.5 mb-2 text-sm text-gray-700">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-gray-700 ml-2">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-600">{children}</em>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-blue-300 pl-3 my-2 text-gray-600 italic text-sm">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full border border-gray-200 text-sm rounded-lg overflow-hidden">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-blue-50">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        ),
        tr: ({ children }) => <tr className="hover:bg-gray-50">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-blue-800 border-b border-blue-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-xs text-gray-700">{children}</td>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono text-gray-700 overflow-x-auto my-2">
              {children}
            </code>
          ) : (
            <code className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono text-blue-700">
              {children}
            </code>
          );
        },
        hr: () => <hr className="border-gray-200 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
