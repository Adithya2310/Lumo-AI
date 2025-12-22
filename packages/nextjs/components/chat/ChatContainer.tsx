"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage, MessageType } from "./ChatMessage";

interface SIPPlan {
  goal: string;
  monthlyAmount: string;
  riskLevel: "low" | "medium" | "high";
  aiSpendLimit: string;
  rebalancing: boolean;
  strategy: {
    aave: number;
    compound: number;
    uniswap: number;
  };
}

interface ChatContainerProps {
  onPlanGenerated: (plan: SIPPlan) => void;
}

type ConversationStep = "greeting" | "goal" | "amount" | "risk" | "ai_limit" | "complete";

interface Message {
  id: string;
  type: MessageType;
  content: string;
  options?: string[];
}

// Generate strategy based on risk level
const generateStrategy = (riskLevel: "low" | "medium" | "high") => {
  switch (riskLevel) {
    case "low":
      return { aave: 50, compound: 40, uniswap: 10 };
    case "medium":
      return { aave: 35, compound: 35, uniswap: 30 };
    case "high":
      return { aave: 20, compound: 25, uniswap: 55 };
    default:
      return { aave: 35, compound: 35, uniswap: 30 };
  }
};

export const ChatContainer = ({ onPlanGenerated }: ChatContainerProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<ConversationStep>("greeting");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Collected data
  const [planData, setPlanData] = useState({
    goal: "",
    monthlyAmount: "",
    riskLevel: "" as "low" | "medium" | "high",
    aiSpendLimit: "",
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initial greeting
  useEffect(() => {
    setTimeout(() => {
      addAIMessage(
        "👋 Welcome to Lumo AI! I'm here to help you create a personalized DeFi investment plan.\n\nLet's start by understanding your goals. What are you investing for?",
        ["Retirement", "House down payment", "Education fund", "General wealth building"],
      );
      setStep("goal");
    }, 500);
  }, []);

  const addAIMessage = (content: string, options?: string[]) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: "ai" as MessageType,
          content,
          options,
        },
      ]);
      setIsTyping(false);
    }, 800);
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: "user" as MessageType,
        content,
      },
    ]);
  };

  const handleSend = (message?: string) => {
    const userInput = message || input.trim();
    if (!userInput) return;

    addUserMessage(userInput);
    setInput("");
    processInput(userInput);
  };

  const processInput = (userInput: string) => {
    switch (step) {
      case "goal":
        setPlanData(prev => ({ ...prev, goal: userInput }));
        setStep("amount");
        setTimeout(() => {
          addAIMessage(
            `Great choice! "${userInput}" is an excellent goal. 🎯\n\nNow, how much would you like to invest monthly? This will be your SIP (Systematic Investment Plan) amount.`,
            ["0.01 ETH", "0.05 ETH", "0.1 ETH", "0.5 ETH"],
          );
        }, 500);
        break;

      case "amount":
        const amount = userInput.replace(/[^0-9.]/g, "");
        setPlanData(prev => ({ ...prev, monthlyAmount: amount }));
        setStep("risk");
        setTimeout(() => {
          addAIMessage(
            `Perfect! ${userInput} per month is a solid commitment. 💪\n\nWhat's your risk tolerance? This helps me allocate your funds across different DeFi protocols.`,
            ["Low - Stable returns", "Medium - Balanced growth", "High - Maximum growth"],
          );
        }, 500);
        break;

      case "risk":
        let riskLevel: "low" | "medium" | "high" = "medium";
        if (userInput.toLowerCase().includes("low")) riskLevel = "low";
        else if (userInput.toLowerCase().includes("high")) riskLevel = "high";

        setPlanData(prev => ({ ...prev, riskLevel }));
        setStep("ai_limit");

        const strategy = generateStrategy(riskLevel);
        setTimeout(() => {
          addAIMessage(
            `Understood! Based on your ${riskLevel} risk preference, I recommend:\n\n` +
              `• **Aave (Lending):** ${strategy.aave}%\n` +
              `• **Compound (Interest):** ${strategy.compound}%\n` +
              `• **Uniswap (Liquidity):** ${strategy.uniswap}%\n\n` +
              `Finally, what's your monthly budget for AI agent fees? This covers strategy optimization and rebalancing.`,
            ["0.001 ETH", "0.005 ETH", "0.01 ETH", "No AI rebalancing"],
          );
        }, 500);
        break;

      case "ai_limit":
        const hasAI = !userInput.toLowerCase().includes("no");
        const aiLimit = hasAI ? userInput.replace(/[^0-9.]/g, "") : "0";

        setPlanData(prev => ({ ...prev, aiSpendLimit: aiLimit }));
        setStep("complete");

        // Generate final plan
        const finalPlan: SIPPlan = {
          goal: planData.goal,
          monthlyAmount: planData.monthlyAmount,
          riskLevel: planData.riskLevel,
          aiSpendLimit: aiLimit,
          rebalancing: hasAI,
          strategy: generateStrategy(planData.riskLevel),
        };

        setTimeout(() => {
          addAIMessage(
            `🎉 Your investment plan is ready!\n\n` +
              `**Summary:**\n` +
              `• Goal: ${planData.goal}\n` +
              `• Monthly SIP: ${planData.monthlyAmount} ETH\n` +
              `• Risk Level: ${planData.riskLevel.charAt(0).toUpperCase() + planData.riskLevel.slice(1)}\n` +
              `• AI Rebalancing: ${hasAI ? "Enabled" : "Disabled"}\n\n` +
              `Click "Review & Confirm" to proceed with setting up your automated investment plan.`,
          );

          // Trigger confirmation after a delay
          setTimeout(() => {
            onPlanGenerated(finalPlan);
          }, 1500);
        }, 500);
        break;
    }
  };

  const handleOptionClick = (option: string) => {
    handleSend(option);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map(message => (
          <ChatMessage
            key={message.id}
            type={message.type}
            content={message.content}
            options={message.options}
            onOptionClick={handleOptionClick}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
              <span className="text-lg">✨</span>
            </div>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {step !== "complete" && (
        <div className="border-t border-white/5 pt-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="btn btn-lumo-primary px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
