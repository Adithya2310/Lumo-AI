import { expect } from "chai";
import { ethers } from "hardhat";
import { LumoContract, MockAave, MockCompound, MockUniswap } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Additional tests for LumoContract edge cases
 */
describe("LumoContract - Additional Coverage", function () {
  let lumoContract: LumoContract;
  let mockAave: MockAave;
  let mockCompound: MockCompound;
  let mockUniswap: MockUniswap;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let mockSpendPermissionManager: SignerWithAddress;

  const PLAN_ID_1 = 1;
  const MONTHLY_AMOUNT = ethers.parseEther("0.1");
  const AAVE_PERCENT = 40;
  const COMPOUND_PERCENT = 30;
  const UNISWAP_PERCENT = 30;

  beforeEach(async () => {
    [owner, user1, user2, mockSpendPermissionManager] = await ethers.getSigners();

    const MockAaveFactory = await ethers.getContractFactory("MockAave");
    mockAave = (await MockAaveFactory.deploy()) as MockAave;
    await mockAave.waitForDeployment();

    const MockCompoundFactory = await ethers.getContractFactory("MockCompound");
    mockCompound = (await MockCompoundFactory.deploy()) as MockCompound;
    await mockCompound.waitForDeployment();

    const MockUniswapFactory = await ethers.getContractFactory("MockUniswap");
    mockUniswap = (await MockUniswapFactory.deploy()) as MockUniswap;
    await mockUniswap.waitForDeployment();

    const LumoContractFactory = await ethers.getContractFactory("LumoContract");
    lumoContract = (await LumoContractFactory.deploy(
      await mockAave.getAddress(),
      await mockCompound.getAddress(),
      await mockUniswap.getAddress(),
      mockSpendPermissionManager.address,
    )) as LumoContract;
    await lumoContract.waitForDeployment();
  });

  describe("Plan Creation Edge Cases", function () {
    it("Should handle plan ID of 0", async function () {
      await expect(
        lumoContract.connect(user1).createSIPPlan(0, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT),
      )
        .to.emit(lumoContract, "SIPCreated")
        .withArgs(user1.address, 0, MONTHLY_AMOUNT);

      const plan = await lumoContract.getPlan(user1.address, 0);
      expect(plan.planId).to.equal(0);
      expect(plan.user).to.equal(user1.address);
    });

    it("Should handle very large plan IDs", async function () {
      const largePlanId = ethers.MaxUint256;

      await lumoContract
        .connect(user1)
        .createSIPPlan(largePlanId, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, largePlanId);
      expect(plan.planId).to.equal(largePlanId);
    });

    it("Should revert with percentage sum of 99", async function () {
      await expect(lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, 33, 33, 33)).to.be.revertedWith(
        "Percents must sum to 100",
      );
    });

    it("Should handle minimum monthly amount (1 wei)", async function () {
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, 1, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.monthlyAmount).to.equal(1);
    });
  });

  describe("Direct Deposit Edge Cases", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should handle minimum deposit (1 wei)", async function () {
      await expect(lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: 1 }))
        .to.emit(lumoContract, "DepositExecuted")
        .withArgs(user1.address, PLAN_ID_1, 1);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.totalDeposited).to.equal(1);
    });

    it("Should handle deposits with rounding (allocation)", async function () {
      // With 40%, 30%, 30% of 100 wei, we get 40, 30, 30
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: 100 });

      expect(await ethers.provider.getBalance(await mockAave.getAddress())).to.equal(40);
      expect(await ethers.provider.getBalance(await mockCompound.getAddress())).to.equal(30);
      expect(await ethers.provider.getBalance(await mockUniswap.getAddress())).to.equal(30);
    });
  });

  describe("Plan State Transitions", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should handle pause -> resume -> pause cycle", async function () {
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);
      let plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.false;

      await lumoContract.connect(user1).resumePlan(PLAN_ID_1);
      plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.true;

      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);
      plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.false;
    });

    it("Should allow resume after cancel (current implementation)", async function () {
      // Note: In current implementation, cancel and pause both set active=false
      // So resume works on both. This might be a design consideration.
      await lumoContract.connect(user1).cancelPlan(PLAN_ID_1);

      await expect(lumoContract.connect(user1).resumePlan(PLAN_ID_1))
        .to.emit(lumoContract, "PlanResumed")
        .withArgs(user1.address, PLAN_ID_1);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.true;
    });

    it("Should preserve plan data after pause and resume", async function () {
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("1") });

      const planBefore = await lumoContract.getPlan(user1.address, PLAN_ID_1);

      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);
      await lumoContract.connect(user1).resumePlan(PLAN_ID_1);

      const planAfter = await lumoContract.getPlan(user1.address, PLAN_ID_1);

      expect(planAfter.totalDeposited).to.equal(planBefore.totalDeposited);
      expect(planAfter.monthlyAmount).to.equal(planBefore.monthlyAmount);
      expect(planAfter.strategy.aavePercent).to.equal(planBefore.strategy.aavePercent);
    });
  });

  describe("Timestamp Tracking", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should set createdAt timestamp on plan creation", async function () {
      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.createdAt).to.be.gt(0);
    });

    it("Should update lastDepositTime on each deposit", async function () {
      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan1.lastDepositTime).to.equal(0);

      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("1") });

      const plan2 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan2.lastDepositTime).to.be.gt(0);
    });
  });

  describe("Contract Balance", function () {
    it("Should accept ETH via receive function", async function () {
      const amount = ethers.parseEther("5");

      await owner.sendTransaction({
        to: await lumoContract.getAddress(),
        value: amount,
      });

      expect(await ethers.provider.getBalance(await lumoContract.getAddress())).to.equal(amount);
    });

    it("Should maintain separate balance from protocol allocations", async function () {
      // Send ETH directly to contract
      await owner.sendTransaction({
        to: await lumoContract.getAddress(),
        value: ethers.parseEther("10"),
      });

      // Create plan and deposit
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("1") });

      // Contract should still have the 10 ETH (deposit was sent to protocols)
      expect(await ethers.provider.getBalance(await lumoContract.getAddress())).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Owner Functions Edge Cases", function () {
    it("Should allow setting SpendPermissionManager to zero address", async function () {
      await lumoContract.connect(owner).setSpendPermissionManager(ethers.ZeroAddress);
      expect(await lumoContract.spendPermissionManager()).to.equal(ethers.ZeroAddress);
    });

    it("Should allow multiple ownership transfers", async function () {
      await lumoContract.connect(owner).transferOwnership(user1.address);
      expect(await lumoContract.owner()).to.equal(user1.address);

      await lumoContract.connect(user1).transferOwnership(user2.address);
      expect(await lumoContract.owner()).to.equal(user2.address);
    });

    it("Should prevent previous owner from calling owner functions after transfer", async function () {
      await lumoContract.connect(owner).transferOwnership(user1.address);

      await expect(lumoContract.connect(owner).setSpendPermissionManager(user2.address)).to.be.revertedWith(
        "Only owner",
      );
    });
  });
});
