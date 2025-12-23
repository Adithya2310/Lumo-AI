// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ISpendPermissionManager.sol";

/**
 * @title IERC20
 * @notice Minimal ERC20 interface for token transfers
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title LumoContract
 * @notice Main contract for Lumo SIP (Systematic Investment Plan) DeFAI automation
 * @dev Uses Coinbase's SpendPermissionManager for automated USDC deposits
 *      SIP investments use USDC, Agent payments use ETH
 */
contract LumoContract {
    struct Strategy {
        uint8 aavePercent;
        uint8 compoundPercent;
        uint8 uniswapPercent;
    }

    struct SIPPlan {
        address user;
        uint256 planId;           // Database plan ID for reference
        uint256 monthlyAmount;    // Amount in USDC (6 decimals)
        Strategy strategy;
        uint256 totalDeposited;
        uint256 lastDepositTime;
        uint256 createdAt;
        bool active;
        bool rebalancingEnabled;  // Whether AI rebalancing is enabled
    }

    // User address => Plan ID => SIPPlan (users can have multiple plans)
    mapping(address => mapping(uint256 => SIPPlan)) public userPlans;
    // User address => array of plan IDs
    mapping(address => uint256[]) public userPlanIds;
    
    address public aave;
    address public compound;
    address public uniswap;
    address public owner;
    
    // USDC token address on Base Sepolia
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    
    // Native ETH address constant (ERC-7528)
    address public constant NATIVE_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    // Expert agent address for AI payments
    address public expertAgentAddress;
    
    // SpendPermissionManager contract address (Base Sepolia)
    ISpendPermissionManager public spendPermissionManager;

    event SIPCreated(address indexed user, uint256 indexed planId, uint256 monthlyAmount);
    event DepositExecuted(address indexed user, uint256 indexed planId, uint256 amount);
    event FundsAllocated(address indexed protocol, uint256 amount);
    event PlanCancelled(address indexed user, uint256 indexed planId);
    event PlanPaused(address indexed user, uint256 indexed planId);
    event PlanResumed(address indexed user, uint256 indexed planId);
    event PlanRebalanced(address indexed user, uint256 indexed planId, uint8 aavePercent, uint8 compoundPercent, uint8 uniswapPercent);
    event AgentPaymentExecuted(address indexed user, address indexed agent, uint256 amount);
    event ExpertAgentAddressUpdated(address indexed oldAddress, address indexed newAddress);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(
        address _aave, 
        address _compound, 
        address _uniswap,
        address _spendPermissionManager
    ) {
        aave = _aave;
        compound = _compound;
        uniswap = _uniswap;
        spendPermissionManager = ISpendPermissionManager(_spendPermissionManager);
        owner = msg.sender;
    }

    /**
     * @notice Create a new SIP plan for a user
     * @dev This is called by the frontend when user confirms their plan
     * @param planId The database plan ID for reference
     * @param monthlyAmount Monthly investment amount in USDC (6 decimals)
     * @param aavePercent Percentage allocation to Aave
     * @param compoundPercent Percentage allocation to Compound
     * @param uniswapPercent Percentage allocation to Uniswap
     * @param enableRebalancing Whether to enable AI rebalancing
     */
    function createSIPPlan(
        uint256 planId,
        uint256 monthlyAmount,
        uint8 aavePercent,
        uint8 compoundPercent,
        uint8 uniswapPercent,
        bool enableRebalancing
    ) external {
        require(monthlyAmount > 0, "Monthly amount must be greater than 0");
        require(aavePercent + compoundPercent + uniswapPercent == 100, "Percents must sum to 100");
        require(userPlans[msg.sender][planId].createdAt == 0, "Plan already exists");

        Strategy memory strategy = Strategy({
            aavePercent: aavePercent,
            compoundPercent: compoundPercent,
            uniswapPercent: uniswapPercent
        });

        userPlans[msg.sender][planId] = SIPPlan({
            user: msg.sender,
            planId: planId,
            monthlyAmount: monthlyAmount,
            strategy: strategy,
            totalDeposited: 0,
            lastDepositTime: 0,
            createdAt: block.timestamp,
            active: true,
            rebalancingEnabled: enableRebalancing
        });

        userPlanIds[msg.sender].push(planId);

        emit SIPCreated(msg.sender, planId, monthlyAmount);
    }

    /**
     * @notice Create a new SIP plan (backwards compatible - no rebalancing param)
     */
    function createSIPPlan(
        uint256 planId,
        uint256 monthlyAmount,
        uint8 aavePercent,
        uint8 compoundPercent,
        uint8 uniswapPercent
    ) external {
        require(monthlyAmount > 0, "Monthly amount must be greater than 0");
        require(aavePercent + compoundPercent + uniswapPercent == 100, "Percents must sum to 100");
        require(userPlans[msg.sender][planId].createdAt == 0, "Plan already exists");

        Strategy memory strategy = Strategy({
            aavePercent: aavePercent,
            compoundPercent: compoundPercent,
            uniswapPercent: uniswapPercent
        });

        userPlans[msg.sender][planId] = SIPPlan({
            user: msg.sender,
            planId: planId,
            monthlyAmount: monthlyAmount,
            strategy: strategy,
            totalDeposited: 0,
            lastDepositTime: 0,
            createdAt: block.timestamp,
            active: true,
            rebalancingEnabled: false
        });

        userPlanIds[msg.sender].push(planId);

        emit SIPCreated(msg.sender, planId, monthlyAmount);
    }

    /**
     * @notice Execute a USDC deposit for a user's SIP plan using spend permission
     * @dev Called by the server wallet (spender) using the stored spend permission
     * @param user The user whose SIP is being executed
     * @param planId The plan ID to execute
     * @param spendPermission The spend permission struct (must be for USDC token)
     * @param signature The user's signature for the spend permission
     * @param amount Amount to deposit in this execution (USDC, 6 decimals)
     */
    function executeDepositUSDC(
        address user,
        uint256 planId,
        ISpendPermissionManager.SpendPermission calldata spendPermission,
        bytes calldata signature,
        uint160 amount
    ) external onlyOwner {
        SIPPlan storage plan = userPlans[user][planId];
        require(plan.active, "No active plan");
        require(plan.user == user, "User mismatch");
        require(spendPermission.account == user, "Permission account mismatch");
        require(spendPermission.spender == msg.sender, "Spender mismatch");
        require(spendPermission.token == USDC, "Token must be USDC");

        // First, approve the spend permission on-chain if not already approved
        if (!spendPermissionManager.isApproved(spendPermission)) {
            spendPermissionManager.approveWithSignature(spendPermission, signature);
        }

        // Execute the spend - this transfers USDC from user to this contract
        spendPermissionManager.spend(spendPermission, amount);

        // Now allocate the received USDC to protocols
        _allocateFundsUSDC(plan, amount);

        plan.totalDeposited += amount;
        plan.lastDepositTime = block.timestamp;

        emit DepositExecuted(user, planId, amount);
    }

    /**
     * @notice Execute a deposit for a user's SIP plan using spend permission (backwards compatible - ETH)
     * @dev Called by the server wallet (spender) using the stored spend permission
     */
    function executeDeposit(
        address user,
        uint256 planId,
        ISpendPermissionManager.SpendPermission calldata spendPermission,
        bytes calldata signature,
        uint160 amount
    ) external onlyOwner {
        SIPPlan storage plan = userPlans[user][planId];
        require(plan.active, "No active plan");
        require(plan.user == user, "User mismatch");
        require(spendPermission.account == user, "Permission account mismatch");
        require(spendPermission.spender == msg.sender, "Spender mismatch");

        // First, approve the spend permission on-chain if not already approved
        if (!spendPermissionManager.isApproved(spendPermission)) {
            spendPermissionManager.approveWithSignature(spendPermission, signature);
        }

        // Execute the spend - this transfers tokens from user to this contract
        spendPermissionManager.spend(spendPermission, amount);

        // Now allocate the received funds to protocols
        _allocateFunds(plan, amount);

        plan.totalDeposited += amount;
        plan.lastDepositTime = block.timestamp;

        emit DepositExecuted(user, planId, amount);
    }

    /**
     * @notice Execute a direct ETH deposit (for users who send ETH directly)
     * @dev Alternative method for direct deposits without spend permissions
     * @param planId The plan ID to fund
     */
    function depositDirect(uint256 planId) external payable {
        SIPPlan storage plan = userPlans[msg.sender][planId];
        require(plan.active, "No active plan");
        require(msg.value > 0, "Must send ETH");

        _allocateFunds(plan, msg.value);

        plan.totalDeposited += msg.value;
        plan.lastDepositTime = block.timestamp;

        emit DepositExecuted(msg.sender, planId, msg.value);
    }

    /**
     * @notice Rebalance a user's SIP plan with new strategy allocation
     * @dev Called by the server after AI generates new strategy
     * @param user The user whose plan is being rebalanced
     * @param planId The plan ID to rebalance
     * @param newAavePercent New percentage allocation to Aave
     * @param newCompoundPercent New percentage allocation to Compound
     * @param newUniswapPercent New percentage allocation to Uniswap
     */
    function rebalance(
        address user,
        uint256 planId,
        uint8 newAavePercent,
        uint8 newCompoundPercent,
        uint8 newUniswapPercent
    ) external onlyOwner {
        SIPPlan storage plan = userPlans[user][planId];
        require(plan.active, "No active plan");
        require(plan.user == user, "User mismatch");
        require(plan.rebalancingEnabled, "Rebalancing not enabled");
        require(newAavePercent + newCompoundPercent + newUniswapPercent == 100, "Percents must sum to 100");

        plan.strategy.aavePercent = newAavePercent;
        plan.strategy.compoundPercent = newCompoundPercent;
        plan.strategy.uniswapPercent = newUniswapPercent;

        emit PlanRebalanced(user, planId, newAavePercent, newCompoundPercent, newUniswapPercent);
    }

    /**
     * @notice Toggle rebalancing for a plan
     * @param planId The plan ID
     * @param enabled Whether to enable rebalancing
     */
    function setRebalancing(uint256 planId, bool enabled) external {
        SIPPlan storage plan = userPlans[msg.sender][planId];
        require(plan.createdAt > 0, "Plan does not exist");
        require(plan.user == msg.sender, "Not plan owner");
        
        plan.rebalancingEnabled = enabled;
    }

    /**
     * @notice Internal function to allocate USDC funds to protocols based on strategy
     */
    function _allocateFundsUSDC(SIPPlan storage plan, uint256 amount) internal {
        // Calculate amounts for each protocol
        uint256 aaveAmount = (amount * plan.strategy.aavePercent) / 100;
        uint256 compoundAmount = (amount * plan.strategy.compoundPercent) / 100;
        uint256 uniswapAmount = (amount * plan.strategy.uniswapPercent) / 100;

        IERC20 usdc = IERC20(USDC);

        // Transfer USDC to protocols
        if (aaveAmount > 0) {
            require(usdc.transfer(aave, aaveAmount), "Aave transfer failed");
            emit FundsAllocated(aave, aaveAmount);
        }

        if (compoundAmount > 0) {
            require(usdc.transfer(compound, compoundAmount), "Compound transfer failed");
            emit FundsAllocated(compound, compoundAmount);
        }

        if (uniswapAmount > 0) {
            require(usdc.transfer(uniswap, uniswapAmount), "Uniswap transfer failed");
            emit FundsAllocated(uniswap, uniswapAmount);
        }
    }

    /**
     * @notice Internal function to allocate ETH funds to protocols based on strategy
     */
    function _allocateFunds(SIPPlan storage plan, uint256 amount) internal {
        // Calculate amounts for each protocol
        uint256 aaveAmount = (amount * plan.strategy.aavePercent) / 100;
        uint256 compoundAmount = (amount * plan.strategy.compoundPercent) / 100;
        uint256 uniswapAmount = (amount * plan.strategy.uniswapPercent) / 100;

        // Send to mock protocols
        if (aaveAmount > 0) {
            (bool success1, ) = aave.call{value: aaveAmount}("");
            require(success1, "Aave deposit failed");
            emit FundsAllocated(aave, aaveAmount);
        }

        if (compoundAmount > 0) {
            (bool success2, ) = compound.call{value: compoundAmount}("");
            require(success2, "Compound deposit failed");
            emit FundsAllocated(compound, compoundAmount);
        }

        if (uniswapAmount > 0) {
            (bool success3, ) = uniswap.call{value: uniswapAmount}("");
            require(success3, "Uniswap deposit failed");
            emit FundsAllocated(uniswap, uniswapAmount);
        }
    }

    /**
     * @notice Get a user's SIP plan
     */
    function getPlan(address user, uint256 planId) external view returns (SIPPlan memory) {
        return userPlans[user][planId];
    }

    /**
     * @notice Get all plan IDs for a user
     */
    function getUserPlanIds(address user) external view returns (uint256[] memory) {
        return userPlanIds[user];
    }

    /**
     * @notice Cancel a SIP plan
     */
    function cancelPlan(uint256 planId) external {
        SIPPlan storage plan = userPlans[msg.sender][planId];
        require(plan.active, "No active plan");
        require(plan.user == msg.sender, "Not plan owner");

        plan.active = false;
        emit PlanCancelled(msg.sender, planId);
    }

    /**
     * @notice Pause a SIP plan
     */
    function pausePlan(uint256 planId) external {
        SIPPlan storage plan = userPlans[msg.sender][planId];
        require(plan.active, "No active plan");
        require(plan.user == msg.sender, "Not plan owner");
        
        plan.active = false;
        emit PlanPaused(msg.sender, planId);
    }

    /**
     * @notice Resume a paused SIP plan
     */
    function resumePlan(uint256 planId) external {
        SIPPlan storage plan = userPlans[msg.sender][planId];
        require(plan.createdAt > 0, "Plan does not exist");
        require(plan.user == msg.sender, "Not plan owner");
        require(!plan.active, "Plan already active");
        
        plan.active = true;
        emit PlanResumed(msg.sender, planId);
    }

    /**
     * @notice Update the SpendPermissionManager address
     */
    function setSpendPermissionManager(address _spendPermissionManager) external onlyOwner {
        spendPermissionManager = ISpendPermissionManager(_spendPermissionManager);
    }

    /**
     * @notice Set the expert agent address for AI payments
     */
    function setExpertAgentAddress(address _expertAgentAddress) external onlyOwner {
        address oldAddress = expertAgentAddress;
        expertAgentAddress = _expertAgentAddress;
        emit ExpertAgentAddressUpdated(oldAddress, _expertAgentAddress);
    }

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    receive() external payable {}
}