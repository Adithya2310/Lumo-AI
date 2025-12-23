"use client";

export type MessageType = "ai" | "user";

interface ChatMessageProps {
  type: MessageType;
  content: string;
  options?: string[];
  onOptionClick?: (option: string) => void;
}

export const ChatMessage = ({ type, content, options, onOptionClick }: ChatMessageProps) => {
  const isAI = type === "ai";

  // Convert markdown-like formatting to JSX
  const formatContent = (text: string) => {
    // Helper to convert markdown-style links and bold to HTML
    const convertMarkdown = (str: string) => {
      // Convert markdown links [text](url) to anchor tags
      let result = str.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-purple-400 hover:text-purple-300 underline transition-colors">$1</a>',
      );
      // Convert bold **text** to strong tags
      result = result.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
      return result;
    };

    // Split by newlines and process each line
    return text.split("\n").map((line, i) => {
      // Handle bullet points
      if (line.startsWith("• ")) {
        const bulletContent = line.slice(2);
        return (
          <div key={i} className="flex items-start gap-2 my-1">
            <span className="text-purple-400">•</span>
            <span
              dangerouslySetInnerHTML={{
                __html: convertMarkdown(bulletContent),
              }}
            />
          </div>
        );
      }

      // Handle headers (lines starting with **)
      if (line.startsWith("**") && line.endsWith("**")) {
        return (
          <div key={i} className="font-semibold text-white mt-3 mb-2">
            {line.slice(2, -2)}
          </div>
        );
      }

      // Regular line with bold formatting and links
      if (line.trim()) {
        return (
          <p
            key={i}
            className="my-1"
            dangerouslySetInnerHTML={{
              __html: convertMarkdown(line),
            }}
          />
        );
      }

      return <br key={i} />;
    });
  };

  return (
    <div className={`flex items-start gap-3 ${isAI ? "" : "flex-row-reverse"}`}>
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
          isAI
            ? "bg-gradient-to-br from-purple-500/20 to-indigo-500/20"
            : "bg-gradient-to-br from-purple-500 to-indigo-500"
        }`}
      >
        {isAI ? (
          <span className="text-lg">✨</span>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 ${isAI ? "max-w-[85%]" : "max-w-[70%]"}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isAI
              ? "bg-white/5 border border-white/10 text-gray-300"
              : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
          }`}
        >
          <div className="text-sm leading-relaxed">{formatContent(content)}</div>
        </div>

        {/* Quick Options */}
        {isAI && options && options.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {options.map((option, index) => (
              <button
                key={index}
                onClick={() => onOptionClick?.(option)}
                className="px-4 py-2 text-sm rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/30 transition-all duration-200"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
