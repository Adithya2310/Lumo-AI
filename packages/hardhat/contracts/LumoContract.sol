// SPDX-License-Identifier: MIT 0x82adEeeFE3f79D0d459878F36B44CD178080013d
pragma solidity ^0.8.20;

contract LumoContract {
    struct Strategy {
        uint8 aavePercent;
        uint8 compoundPercent;
        uint8 uniswapPercent;
    }

    struct SIPPlan {
        address user;
        uint256 totalAmount;
        uint256 monthlyAmount;
        uint256 duration;
        Strategy strategy;
        uint256 deposited;
        uint256 createdAt;
        bool active;
    }

    mapping(address => SIPPlan) public userPlans;
    
    address public aave;
    address public compound;
    address public uniswap;
    address public owner;

    event SIPCreated(address indexed user, uint256 totalAmount, uint256 duration);
    event DepositExecuted(address indexed user, uint256 amount);
    event FundsAllocated(address indexed protocol, uint256 amount);
    event PlanCancelled(address indexed user, uint256 refundAmount);
    event PlanPaused(address indexed user);
    event PlanResumed(address indexed user);

    constructor(address _aave, address _compound, address _uniswap) {
        aave = _aave;
        compound = _compound;
        uniswap = _uniswap;
        owner = msg.sender;
    }

    function createSIPPlan(
        uint256 totalAmount,
        uint256 monthlyAmount,
        uint256 duration,
        uint8 aavePercent,
        uint8 compoundPercent,
        uint8 uniswapPercent
    ) external payable {
        require(msg.value == totalAmount, "Send correct ETH amount");
        require(monthlyAmount <= totalAmount, "Monthly amount exceeds total");
        require(aavePercent + compoundPercent + uniswapPercent == 100, "Percents must sum to 100");
        require(!userPlans[msg.sender].active, "Plan already exists");

        Strategy memory strategy = Strategy({
            aavePercent: aavePercent,
            compoundPercent: compoundPercent,
            uniswapPercent: uniswapPercent
        });

        userPlans[msg.sender] = SIPPlan({
            user: msg.sender,
            totalAmount: totalAmount,
            monthlyAmount: monthlyAmount,
            duration: duration,
            strategy: strategy,
            deposited: 0,
            createdAt: block.timestamp,
            active: true
        });

        emit SIPCreated(msg.sender, totalAmount, duration);

        // Execute first deposit immediately
        _executeDeposit(msg.sender, totalAmount);
    }

    function _executeDeposit(address user, uint256 amount) internal {
        SIPPlan storage plan = userPlans[user];
        require(plan.active, "No active plan");

        // Calculate amounts for each protocol
        uint256 aaveAmount = (amount * plan.strategy.aavePercent) / 100;
        uint256 compoundAmount = (amount * plan.strategy.compoundPercent) / 100;
        uint256 uniswapAmount = (amount * plan.strategy.uniswapPercent) / 100;

        // Send to mock protocols
        (bool success1, ) = aave.call{value: aaveAmount}("");
        require(success1, "Aave deposit failed");
        emit FundsAllocated(aave, aaveAmount);

        (bool success2, ) = compound.call{value: compoundAmount}("");
        require(success2, "Compound deposit failed");
        emit FundsAllocated(compound, compoundAmount);

        (bool success3, ) = uniswap.call{value: uniswapAmount}("");
        require(success3, "Uniswap deposit failed");
        emit FundsAllocated(uniswap, uniswapAmount);

        plan.deposited += amount;
        emit DepositExecuted(user, amount);
    }

    function getPlan(address user) external view returns (SIPPlan memory) {
        return userPlans[user];
    }

    function cancelPlan() external {
        SIPPlan storage plan = userPlans[msg.sender];
        require(plan.active, "No active plan");

        plan.active = false;
        
        // No refund since all funds are already deposited to protocols
        // Users would need to withdraw from individual protocols
        emit PlanCancelled(msg.sender, 0);
    }

    function pausePlan() external {
        SIPPlan storage plan = userPlans[msg.sender];
        require(plan.active, "No active plan");
        
        plan.active = false;
        emit PlanPaused(msg.sender);
    }

    function resumePlan() external {
        SIPPlan storage plan = userPlans[msg.sender];
        require(!plan.active, "Plan already active");
        require(plan.user == msg.sender, "No plan found");
        
        plan.active = true;
        emit PlanResumed(msg.sender);
    }

    receive() external payable {}
}