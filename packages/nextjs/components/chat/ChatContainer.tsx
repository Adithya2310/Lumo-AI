"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChatMessage, MessageType } from "./ChatMessage";
import { useAccount } from "wagmi";
import { CreateSIPModal } from "~~/components/modals/CreateSIPModal";
import {
  PermissionType,
  SpendPermissionModal,
  serializeSpendPermission,
} from "~~/components/modals/SpendPermissionModal";
import { callFinancialPlanner } from "~~/services/financialPlannerClient";

// Stored permission data for database
interface StoredPermission {
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  signature: string;
  type: PermissionType;
}

interface ChatContainerProps {
  onPlanComplete: (planId: number) => void;
}

type ConversationStep =
  | "greeting"
  | "goal"
  | "amount"
  | "sip_permission"
  | "sip_permission_confirmed"
  | "risk"
  | "ai_limit"
  | "agent_permission"
  | "agent_permission_confirmed"
  | "creating_sip"
  | "complete";

interface Message {
  id: string;
  type: MessageType;
  content: string;
  options?: string[];
  isAction?: boolean; // For action prompts like permission requests
}

// Generate fallback strategy based on risk level (used when AI call fails)
const generateFallbackStrategy = (riskLevel: "low" | "medium" | "high") => {
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

export const ChatContainer = ({ onPlanComplete }: ChatContainerProps) => {
  const { address } = useAccount();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<ConversationStep>("greeting");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Modal states
  const [showSIPPermissionModal, setShowSIPPermissionModal] = useState(false);
  const [showAgentPermissionModal, setShowAgentPermissionModal] = useState(false);
  const [showCreateSIPModal, setShowCreateSIPModal] = useState(false);

  // Stored permissions
  const [sipPermission, setSipPermission] = useState<StoredPermission | null>(null);
  const [agentPermission, setAgentPermission] = useState<StoredPermission | null>(null);

  // Created plan ID from database
  const [createdPlanId, setCreatedPlanId] = useState<number | null>(null);

  // AI-generated strategy (from Financial Planner)
  const [aiGeneratedStrategy, setAiGeneratedStrategy] = useState<{
    aave: number;
    compound: number;
    uniswap: number;
  } | null>(null);

  // Collected data
  const [planData, setPlanData] = useState({
    goal: "",
    monthlyAmount: "",
    riskLevel: "" as "low" | "medium" | "high",
    aiSpendLimit: "",
    rebalancing: false,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initial greeting
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    setTimeout(() => {
      addAIMessage(
        "👋 Welcome to Lumo AI! I'm here to help you create a personalized DeFi investment plan.\n\nLet's start by understanding your goals. What are you investing for?",
        ["Retirement", "House down payment", "Education fund", "General wealth building"],
      );
      setStep("goal");
    }, 500);
  }, []);

  const addAIMessage = (content: string, options?: string[], isAction?: boolean) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: "ai" as MessageType,
          content,
          options,
          isAction,
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

  const addSystemMessage = (content: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: "ai" as MessageType,
        content: `✅ ${content}`,
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
            `Great choice! "${userInput}" is an excellent goal. 🎯\n\nNow, how much would you like to invest monthly? This will be your SIP (Systematic Investment Plan) amount in USDC.`,
            ["0.01 USDC", "0.05 USDC", "0.1 USDC", "0.5 USDC"],
          );
        }, 500);
        break;

      case "amount":
        const amount = userInput.replace(/[^0-9.]/g, "");
        setPlanData(prev => ({ ...prev, monthlyAmount: amount }));
        setStep("sip_permission");
        setTimeout(() => {
          addAIMessage(
            `Perfect! ${userInput} per month is a solid commitment. 💪\n\n` +
              `To enable automated monthly investments, I need you to grant a **SIP Spend Permission**.\n\n` +
              `This allows Lumo to automatically invest up to ${amount} USDC per period on your behalf.`,
            ["Grant SIP Permission"],
            true,
          );
        }, 500);
        break;

      case "sip_permission":
        // User clicked "Grant SIP Permission"
        setShowSIPPermissionModal(true);
        break;

      case "sip_permission_confirmed":
        // After SIP permission is confirmed, ask about risk
        // This state is set by the modal callback
        break;

      case "risk":
        let riskLevel: "low" | "medium" | "high" = "medium";
        if (userInput.toLowerCase().includes("low")) riskLevel = "low";
        else if (userInput.toLowerCase().includes("high")) riskLevel = "high";

        setPlanData(prev => ({ ...prev, riskLevel }));

        // Ask for AI budget first, don't show strategy yet
        setTimeout(() => {
          addAIMessage(
            `Understood! You've selected **${riskLevel}** risk tolerance.\n\n` +
              `To generate an optimized AI strategy for your goals, I'll use our DeFi AI Agent.\n\n` +
              `What's your monthly budget for AI agent fees? (paid in ETH)`,
            ["0.001 ETH", "0.005 ETH", "0.01 ETH", "No AI - Use default strategy"],
          );
        }, 500);
        setStep("ai_limit");
        break;

      case "ai_limit":
        const hasAI = !userInput.toLowerCase().includes("no");
        const aiLimit = hasAI ? userInput.replace(/[^0-9.]/g, "") : "0";

        setPlanData(prev => ({ ...prev, aiSpendLimit: aiLimit, rebalancing: hasAI }));

        if (hasAI && aiLimit !== "0") {
          // If user wants AI rebalancing, request agent permission
          setStep("agent_permission");
          setTimeout(() => {
            addAIMessage(
              `Great! You've allocated ${aiLimit} ETH for AI agent services.\n\n` +
                `To enable AI-powered strategy optimization, I need you to grant an **Agent Spend Permission**.\n\n` +
                `This allows the Lumo AI Agent to pay for strategy calls (up to ${aiLimit} ETH per period).`,
              ["Grant Agent Permission"],
              true,
            );
          }, 500);
        } else {
          // Skip agent permission, proceed to creating SIP
          setStep("creating_sip");
          createSIPPlan(false);
        }
        break;

      case "agent_permission":
        // User clicked "Grant Agent Permission"
        setShowAgentPermissionModal(true);
        break;

      case "creating_sip":
        // User clicked "Create SIP Plan" - save to database first
        if (userInput.toLowerCase().includes("create sip")) {
          createSIPPlan(!!agentPermission);
        }
        break;

      case "complete":
        // User clicked "Create SIP On-Chain" - show the blockchain modal
        if (userInput.toLowerCase().includes("on-chain") || userInput.toLowerCase().includes("create sip")) {
          handleCreateSIPClick();
        }
        break;

      default:
        // Handle any unexpected input
        break;
    }
  };

  // Handle SIP permission granted
  const handleSIPPermissionGranted = (permission: any, signature: string) => {
    setShowSIPPermissionModal(false);

    const storedPermission = serializeSpendPermission(permission, signature);
    setSipPermission({
      ...storedPermission,
      type: "sip",
    });

    addSystemMessage(`SIP spend permission granted for ${planData.monthlyAmount} USDC per period.`);

    setStep("sip_permission_confirmed");
    setTimeout(() => {
      setStep("risk");
      addAIMessage(
        `Excellent! Now let's talk about risk.\n\nWhat's your risk tolerance? This helps me allocate your funds across different DeFi protocols.`,
        ["Low - Stable returns", "Medium - Balanced growth", "High - Maximum growth"],
      );
    }, 1000);
  };

  // Handle Agent permission granted - pays agent with ETH, then calls AI for strategy
  const handleAgentPermissionGranted = async (permission: any, signature: string) => {
    setShowAgentPermissionModal(false);

    const storedPermission = serializeSpendPermission(permission, signature);
    setAgentPermission({
      ...storedPermission,
      type: "agent",
    });

    addSystemMessage(`AI Agent spend permission granted for ${planData.aiSpendLimit} ETH per period.`);

    // Set step to processing
    setStep("agent_permission_confirmed");

    try {
      // Call Financial Planner API with agent payment info
      // This will pay EXPERT_AGENT_ADDRESS, then generate the strategy
      const aiResponse = await callFinancialPlanner({
        amount: parseFloat(planData.monthlyAmount) || 10,
        timeHorizon: "12 months",
        riskTolerance: planData.riskLevel,
        goal: planData.goal,
        // Pass agent payment info for pay-before-strategy flow
        agentPayment: address
          ? {
              userAddress: address,
              permission: storedPermission,
              paymentAmount: planData.aiSpendLimit || "0.001",
            }
          : undefined,
      });

      // Show combined payment + strategy result
      if (aiResponse.paymentInfo?.paid && aiResponse.success) {
        const txHash = aiResponse.paymentInfo.txHash;
        const txLink = txHash ? `https://sepolia.basescan.org/tx/${txHash}` : null;
        addSystemMessage(
          `Paid ${aiResponse.paymentInfo.amount} ETH to AI Agent` +
            (txLink ? ` • [View Transaction](${txLink})` : "") +
            ` • Strategy generated!`,
        );
      } else if (aiResponse.paymentInfo?.paid) {
        const txHash = aiResponse.paymentInfo.txHash;
        const txLink = txHash ? `https://sepolia.basescan.org/tx/${txHash}` : null;
        addSystemMessage(
          `💸 Paid ${aiResponse.paymentInfo.amount} ETH to AI Agent` +
            (txLink ? ` • [View Transaction](${txLink})` : ""),
        );
      } else if (aiResponse.success) {
        addSystemMessage(`AI strategy generated successfully`);
      }

      // Display the AI-generated strategy
      if (aiResponse.success && aiResponse.strategy) {
        const strategy = aiResponse.strategy;
        setAiGeneratedStrategy(strategy); // Save for SIP creation

        setTimeout(() => {
          addAIMessage(
            `🎯 **AI-Optimized Strategy Generated!**\n\n` +
              `Based on your ${planData.riskLevel} risk profile and ${planData.goal} goal, here's your personalized allocation:\n\n` +
              `• **Aave (Lending):** ${strategy.aave}%\n` +
              `• **Compound (Interest):** ${strategy.compound}%\n` +
              `• **Uniswap (Liquidity):** ${strategy.uniswap}%\n\n` +
              (aiResponse.reasoning ? `_${aiResponse.reasoning}_\n\n` : "") +
              (aiResponse.paymentInfo?.paid
                ? `✅ **Agent Payment:** ${aiResponse.paymentInfo.amount} ETH paid\n\n`
                : "") +
              `Ready to create your SIP plan?`,
            ["Create SIP Plan"],
            true,
          );
        }, 500);

        setStep("creating_sip");
      } else {
        // Fallback if AI call fails
        console.warn("AI call failed, using fallback:", aiResponse.error);
        const fallbackStrategy = generateFallbackStrategy(planData.riskLevel);
        setAiGeneratedStrategy(fallbackStrategy); // Save for SIP creation

        setTimeout(() => {
          addAIMessage(
            `📊 **Default Strategy Applied**\n\n` +
              `Based on your ${planData.riskLevel} risk preference:\n\n` +
              `• **Aave (Lending):** ${fallbackStrategy.aave}%\n` +
              `• **Compound (Interest):** ${fallbackStrategy.compound}%\n` +
              `• **Uniswap (Liquidity):** ${fallbackStrategy.uniswap}%\n\n` +
              `Ready to create your SIP plan?`,
            ["Create SIP Plan"],
            true,
          );
        }, 500);

        setStep("creating_sip");
      }
    } catch (error: any) {
      console.error("Error in agent flow:", error);
      addSystemMessage(`⚠️ Error: ${error.message}. Using default strategy.`);

      const fallbackStrategy = generateFallbackStrategy(planData.riskLevel);
      setAiGeneratedStrategy(fallbackStrategy); // Save for SIP creation
      setTimeout(() => {
        addAIMessage(
          `📊 **Default Strategy Applied**\n\n` +
            `• **Aave (Lending):** ${fallbackStrategy.aave}%\n` +
            `• **Compound (Interest):** ${fallbackStrategy.compound}%\n` +
            `• **Uniswap (Liquidity):** ${fallbackStrategy.uniswap}%\n\n` +
            `Ready to create your SIP plan?`,
          ["Create SIP Plan"],
          true,
        );
      }, 500);
      setStep("creating_sip");
    }
  };

  // Create SIP plan (stored off-chain for coordination)
  const createSIPPlan = async (hasAgentPermission: boolean) => {
    if (!address) {
      addAIMessage("❌ Error: Wallet not connected. Please connect your wallet and try again.");
      return;
    }

    // Silently prepare the plan - no need to show backend details

    try {
      // Use AI-generated strategy from state, or fallback if not available
      const strategy = aiGeneratedStrategy || generateFallbackStrategy(planData.riskLevel);

      // Create SIP plan in database
      const response = await fetch("/api/sip/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          plan: {
            goal: planData.goal,
            monthlyAmount: planData.monthlyAmount,
            riskLevel: planData.riskLevel,
            strategy,
            rebalancing: planData.rebalancing,
            aiSpendLimit: planData.aiSpendLimit,
          },
          spendPermission: sipPermission
            ? {
                ...sipPermission,
                permission_type: "sip",
              }
            : null,
          agentSpendPermission:
            hasAgentPermission && agentPermission
              ? {
                  ...agentPermission,
                  permission_type: "agent",
                }
              : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save SIP plan");
      }

      const data = await response.json();
      const planId = data.plan?.id;

      if (!planId) {
        throw new Error("Failed to prepare your SIP plan");
      }

      setCreatedPlanId(planId);

      // Plan is ready - no need to show backend status

      // Now prompt for on-chain creation
      setTimeout(() => {
        addAIMessage(
          `🎉 Your plan is ready!\n\n` +
            `**Summary:**\n` +
            `• Goal: ${planData.goal}\n` +
            `• Monthly SIP: ${planData.monthlyAmount} USDC\n` +
            `• Risk Level: ${planData.riskLevel.charAt(0).toUpperCase() + planData.riskLevel.slice(1)}\n` +
            `• AI Rebalancing: ${planData.rebalancing ? "Enabled" : "Disabled"}\n\n` +
            `Now let's register your SIP plan on the blockchain to make it official!`,
          ["Create SIP On-Chain"],
          true,
        );
        setStep("complete");
      }, 1000);
    } catch (error: any) {
      console.error("Error creating SIP plan:", error);
      addAIMessage(`❌ Something went wrong while preparing your plan. Please try again.`);
    }
  };

  // Handle create SIP on-chain click
  const handleCreateSIPClick = () => {
    if (createdPlanId) {
      setShowCreateSIPModal(true);
    }
  };

  // Handle SIP created on-chain
  const handleSIPCreated = (txHash: string) => {
    setShowCreateSIPModal(false);

    // Show transaction confirmation in a web3-native way
    addSystemMessage(`Transaction confirmed: ${txHash.slice(0, 6)}...${txHash.slice(-4)}`);

    setTimeout(() => {
      addAIMessage(
        `🚀 **Congratulations!** Your SIP plan is now fully active!\n\n` +
          `Your automated investments will begin according to your schedule. ` +
          `You can monitor your portfolio and manage your plans from the dashboard.\n\n` +
          `Redirecting to your dashboard...`,
      );

      // Trigger completion after a delay
      setTimeout(() => {
        if (createdPlanId) {
          onPlanComplete(createdPlanId);
        }
      }, 2000);
    }, 500);
  };

  const handleOptionClick = (option: string) => {
    // Handle action buttons
    if (option === "Grant SIP Permission" && step === "sip_permission") {
      setShowSIPPermissionModal(true);
      return;
    }
    if (option === "Grant Agent Permission" && step === "agent_permission") {
      setShowAgentPermissionModal(true);
      return;
    }
    if (option === "Create SIP On-Chain" && step === "complete") {
      handleCreateSIPClick();
      return;
    }

    handleSend(option);
  };

  // Check if input should be disabled
  const isInputDisabled = () => {
    return step === "sip_permission" || step === "agent_permission" || step === "creating_sip" || step === "complete";
  };

  return (
    <>
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
                <Image src="/Logo.png" alt="Lumo AI" width={24} height={24} className="w-6 h-6" />
              </div>
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span
                  className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {!isInputDisabled() && (
          <div className="border-t border-white/5 pt-4">
            <div className="flex gap-3 items-center">
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
                className="btn btn-lumo-primary px-6 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <svg className="w-5 h-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* SIP Permission Modal */}
      {showSIPPermissionModal && (
        <SpendPermissionModal
          type="sip"
          amount={planData.monthlyAmount}
          onSuccess={handleSIPPermissionGranted}
          onCancel={() => setShowSIPPermissionModal(false)}
        />
      )}

      {/* Agent Permission Modal */}
      {showAgentPermissionModal && (
        <SpendPermissionModal
          type="agent"
          amount={planData.aiSpendLimit}
          onSuccess={handleAgentPermissionGranted}
          onCancel={() => setShowAgentPermissionModal(false)}
        />
      )}

      {/* Create SIP Modal */}
      {showCreateSIPModal && createdPlanId && (
        <CreateSIPModal
          planId={createdPlanId}
          monthlyAmount={planData.monthlyAmount}
          strategy={generateFallbackStrategy(planData.riskLevel)}
          onSuccess={handleSIPCreated}
          onCancel={() => setShowCreateSIPModal(false)}
        />
      )}
    </>
  );
};
