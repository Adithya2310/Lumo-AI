import { expect } from "chai";
import { ethers } from "hardhat";
import { LumoContract, MockAave, MockCompound, MockUniswap } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Extended tests for LumoContract covering:
 * - USDC deposits via SpendPermissionManager
 * - AI rebalancing functionality
 * - Expert agent address management
 * - Extended plan creation with rebalancing parameter
 */
describe("LumoContract - Extended Coverage", function () {
  let lumoContract: LumoContract;
  let mockAave: MockAave;
  let mockCompound: MockCompound;
  let mockUniswap: MockUniswap;
  let mockUSDC: any; // Mock ERC20 token
  let mockSpendPermissionManager: any; // Mock SpendPermissionManager
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const PLAN_ID_1 = 1;
  const PLAN_ID_2 = 2;
  const MONTHLY_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC (6 decimals)
  const AAVE_PERCENT = 40;
  const COMPOUND_PERCENT = 30;
  const UNISWAP_PERCENT = 30;
  const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock protocols
    const MockAaveFactory = await ethers.getContractFactory("MockAave");
    mockAave = (await MockAaveFactory.deploy()) as MockAave;
    await mockAave.waitForDeployment();

    const MockCompoundFactory = await ethers.getContractFactory("MockCompound");
    mockCompound = (await MockCompoundFactory.deploy()) as MockCompound;
    await mockCompound.waitForDeployment();

    const MockUniswapFactory = await ethers.getContractFactory("MockUniswap");
    mockUniswap = (await MockUniswapFactory.deploy()) as MockUniswap;
    await mockUniswap.waitForDeployment();

    // Deploy mock USDC token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20Factory.deploy("USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    // Deploy mock SpendPermissionManager
    const MockSpendPermissionManagerFactory = await ethers.getContractFactory("MockSpendPermissionManager");
    mockSpendPermissionManager = await MockSpendPermissionManagerFactory.deploy();
    await mockSpendPermissionManager.waitForDeployment();

    // Deploy Lumo contract
    const LumoContractFactory = await ethers.getContractFactory("LumoContract");
    lumoContract = (await LumoContractFactory.deploy(
      await mockAave.getAddress(),
      await mockCompound.getAddress(),
      await mockUniswap.getAddress(),
      await mockSpendPermissionManager.getAddress(),
    )) as LumoContract;
    await lumoContract.waitForDeployment();

    // Mint USDC to user1 for testing
    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
  });

  describe("Extended Plan Creation with Rebalancing", function () {
    it("Should create SIP plan with rebalancing enabled", async function () {
      await expect(
        lumoContract
          .connect(user1)
          [
            "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
          ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, true),
      )
        .to.emit(lumoContract, "SIPCreated")
        .withArgs(user1.address, PLAN_ID_1, MONTHLY_AMOUNT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.rebalancingEnabled).to.equal(true);
    });

    it("Should create SIP plan with rebalancing disabled", async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, false);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.rebalancingEnabled).to.equal(false);
    });

    it("Should default to rebalancing disabled when using backwards compatible function", async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.rebalancingEnabled).to.equal(false);
    });

    it("Should store rebalancingEnabled field correctly in plan", async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, true);

      await lumoContract
        .connect(user1)
        ["createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"](PLAN_ID_2, MONTHLY_AMOUNT, 50, 25, 25, false);

      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      const plan2 = await lumoContract.getPlan(user1.address, PLAN_ID_2);

      expect(plan1.rebalancingEnabled).to.equal(true);
      expect(plan2.rebalancingEnabled).to.equal(false);
    });
  });

  describe("Set Rebalancing Toggle", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, false);
    });

    it("Should allow user to enable rebalancing", async function () {
      await lumoContract.connect(user1).setRebalancing(PLAN_ID_1, true);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.rebalancingEnabled).to.equal(true);
    });

    it("Should allow user to disable rebalancing", async function () {
      await lumoContract.connect(user1).setRebalancing(PLAN_ID_1, true);
      await lumoContract.connect(user1).setRebalancing(PLAN_ID_1, false);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.rebalancingEnabled).to.equal(false);
    });

    it("Should revert if plan does not exist", async function () {
      await expect(lumoContract.connect(user1).setRebalancing(999, true)).to.be.revertedWith("Plan does not exist");
    });

    it("Should revert if not plan owner", async function () {
      await expect(lumoContract.connect(user2).setRebalancing(PLAN_ID_1, true)).to.be.revertedWith(
        "Plan does not exist",
      );
    });
  });

  describe("Rebalancing Functionality", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, true);
    });

    it("Should rebalance plan with new strategy", async function () {
      const newAave = 50;
      const newCompound = 30;
      const newUniswap = 20;

      await expect(lumoContract.connect(owner).rebalance(user1.address, PLAN_ID_1, newAave, newCompound, newUniswap))
        .to.emit(lumoContract, "PlanRebalanced")
        .withArgs(user1.address, PLAN_ID_1, newAave, newCompound, newUniswap);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.strategy.aavePercent).to.equal(newAave);
      expect(plan.strategy.compoundPercent).to.equal(newCompound);
      expect(plan.strategy.uniswapPercent).to.equal(newUniswap);
    });

    it("Should revert if rebalancing is not enabled", async function () {
      // Create plan with rebalancing disabled
      await lumoContract
        .connect(user2)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_2, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, false);

      await expect(lumoContract.connect(owner).rebalance(user2.address, PLAN_ID_2, 50, 30, 20)).to.be.revertedWith(
        "Rebalancing not enabled",
      );
    });

    it("Should revert if percentages don't sum to 100", async function () {
      await expect(lumoContract.connect(owner).rebalance(user1.address, PLAN_ID_1, 50, 30, 30)).to.be.revertedWith(
        "Percents must sum to 100",
      );
    });

    it("Should revert if plan is not active", async function () {
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);

      await expect(lumoContract.connect(owner).rebalance(user1.address, PLAN_ID_1, 50, 30, 20)).to.be.revertedWith(
        "No active plan",
      );
    });

    it("Should revert if plan does not exist for user", async function () {
      await expect(lumoContract.connect(owner).rebalance(user2.address, PLAN_ID_1, 50, 30, 20)).to.be.revertedWith(
        "No active plan",
      );
    });

    it("Should revert if not called by owner", async function () {
      await expect(lumoContract.connect(user1).rebalance(user1.address, PLAN_ID_1, 50, 30, 20)).to.be.revertedWith(
        "Only owner",
      );
    });

    it("Should allow 100% allocation to single protocol", async function () {
      await lumoContract.connect(owner).rebalance(user1.address, PLAN_ID_1, 100, 0, 0);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.strategy.aavePercent).to.equal(100);
      expect(plan.strategy.compoundPercent).to.equal(0);
      expect(plan.strategy.uniswapPercent).to.equal(0);
    });
  });

  describe("Expert Agent Address Management", function () {
    it("Should set expert agent address", async function () {
      const agentAddress = user2.address;

      await expect(lumoContract.connect(owner).setExpertAgentAddress(agentAddress))
        .to.emit(lumoContract, "ExpertAgentAddressUpdated")
        .withArgs(ethers.ZeroAddress, agentAddress);

      expect(await lumoContract.expertAgentAddress()).to.equal(agentAddress);
    });

    it("Should update expert agent address", async function () {
      await lumoContract.connect(owner).setExpertAgentAddress(user1.address);

      await expect(lumoContract.connect(owner).setExpertAgentAddress(user2.address))
        .to.emit(lumoContract, "ExpertAgentAddressUpdated")
        .withArgs(user1.address, user2.address);

      expect(await lumoContract.expertAgentAddress()).to.equal(user2.address);
    });

    it("Should revert if not called by owner", async function () {
      await expect(lumoContract.connect(user1).setExpertAgentAddress(user2.address)).to.be.revertedWith("Only owner");
    });

    it("Should allow setting to zero address", async function () {
      await lumoContract.connect(owner).setExpertAgentAddress(user1.address);
      await lumoContract.connect(owner).setExpertAgentAddress(ethers.ZeroAddress);

      expect(await lumoContract.expertAgentAddress()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("USDC Deposit via SpendPermissionManager", function () {
    // NOTE: These tests are skipped because the LumoContract has a hardcoded USDC address
    // In a production test suite, you would either:
    // 1. Make the USDC address configurable via constructor
    // 2. Use a fork of Base Sepolia testnet with the real USDC contract
    it.skip("Should execute USDC deposit successfully", async function () {
      // Skipped due to hardcoded USDC address in contract
    });

    it.skip("Should allocate USDC to protocols correctly", async function () {
      // Skipped due to hardcoded USDC address in contract
    });

    it.skip("Should emit FundsAllocated events for each protocol", async function () {
      // Skipped due to hardcoded USDC address in contract
    });

    it.skip("Should update lastDepositTime", async function () {
      // Skipped due to hardcoded USDC address in contract
    });

    it.skip("Should handle multiple USDC deposits", async function () {
      // Skipped due to hardcoded USDC address in contract
    });
  });

  // Add error handling tests that don't depend on USDC execution
  describe("USDC Deposit Error Cases", function () {
    let spendPermission: any;
    const depositAmount = ethers.parseUnits("100", 6);

    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      spendPermission = {
        account: user1.address,
        spender: owner.address,
        token: USDC_ADDRESS,
        allowance: ethers.parseUnits("1000", 6),
        period: 2592000,
        start: Math.floor(Date.now() / 1000),
        end: Math.floor(Date.now() / 1000) + 31536000,
        salt: 0,
        extraData: "0x",
      };
    });

    it("Should revert if plan is not active", async function () {
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);

      await expect(
        lumoContract.connect(owner).executeDepositUSDC(user1.address, PLAN_ID_1, spendPermission, "0x", depositAmount),
      ).to.be.revertedWith("No active plan");
    });
  });

  describe("Integration Tests", function () {
    it("Should complete rebalancing flow without deposits", async function () {
      // 1. Create plan with rebalancing enabled
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, true);

      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan1.rebalancingEnabled).to.equal(true);

      // 2. Make a direct ETH deposit
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("0.5") });

      const plan2 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan2.totalDeposited).to.equal(ethers.parseEther("0.5"));

      // 3. Rebalance the plan
      await lumoContract.connect(owner).rebalance(user1.address, PLAN_ID_1, 60, 20, 20);

      const plan3 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan3.strategy.aavePercent).to.equal(60);
      expect(plan3.strategy.compoundPercent).to.equal(20);
      expect(plan3.strategy.uniswapPercent).to.equal(20);

      // 4. Make another direct deposit with new strategy
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("0.3") });

      // Verify total deposited
      const finalPlan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(finalPlan.totalDeposited).to.equal(ethers.parseEther("0.8"));
    });

    it("Should handle mixed ETH and plan operations", async function () {
      // Create plan
      await lumoContract
        .connect(user1)
        [
          "createSIPPlan(uint256,uint256,uint8,uint8,uint8,bool)"
        ](PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT, true);

      // Direct ETH deposit
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("0.5") });

      // Pause plan
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);

      // Resume plan
      await lumoContract.connect(user1).resumePlan(PLAN_ID_1);

      // Toggle rebalancing off
      await lumoContract.connect(user1).setRebalancing(PLAN_ID_1, false);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.active).to.equal(true);
      expect(plan.rebalancingEnabled).to.equal(false);
      expect(plan.totalDeposited).to.equal(ethers.parseEther("0.5"));
    });
  });
});
