import { expect } from "chai";
import { ethers } from "hardhat";
import { LumoContract, MockAave, MockCompound, MockUniswap } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Tests for the updated LumoContract with:
 * - Multiple plans per user
 * - SpendPermissionManager integration
 * - Direct deposits
 */
describe("LumoContract", function () {
  let lumoContract: LumoContract;
  let mockAave: MockAave;
  let mockCompound: MockCompound;
  let mockUniswap: MockUniswap;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let mockSpendPermissionManager: SignerWithAddress; // Using a signer as mock for now

  // Test constants
  const PLAN_ID_1 = 1;
  const PLAN_ID_2 = 2;
  const MONTHLY_AMOUNT = ethers.parseEther("0.1");
  const AAVE_PERCENT = 40;
  const COMPOUND_PERCENT = 30;
  const UNISWAP_PERCENT = 30;

  beforeEach(async () => {
    [owner, user1, user2, mockSpendPermissionManager] = await ethers.getSigners();

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

    // Deploy Lumo contract with mock SpendPermissionManager address
    const LumoContractFactory = await ethers.getContractFactory("LumoContract");
    lumoContract = (await LumoContractFactory.deploy(
      await mockAave.getAddress(),
      await mockCompound.getAddress(),
      await mockUniswap.getAddress(),
      mockSpendPermissionManager.address, // Using a signer address as mock
    )) as LumoContract;
    await lumoContract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct protocol addresses", async function () {
      expect(await lumoContract.aave()).to.equal(await mockAave.getAddress());
      expect(await lumoContract.compound()).to.equal(await mockCompound.getAddress());
      expect(await lumoContract.uniswap()).to.equal(await mockUniswap.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await lumoContract.owner()).to.equal(owner.address);
    });

    it("Should set the correct SpendPermissionManager", async function () {
      expect(await lumoContract.spendPermissionManager()).to.equal(mockSpendPermissionManager.address);
    });
  });

  describe("Create SIP Plan", function () {
    it("Should create a SIP plan successfully", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT),
      )
        .to.emit(lumoContract, "SIPCreated")
        .withArgs(user1.address, PLAN_ID_1, MONTHLY_AMOUNT);
    });

    it("Should store plan details correctly", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.user).to.equal(user1.address);
      expect(plan.planId).to.equal(PLAN_ID_1);
      expect(plan.monthlyAmount).to.equal(MONTHLY_AMOUNT);
      expect(plan.strategy.aavePercent).to.equal(AAVE_PERCENT);
      expect(plan.strategy.compoundPercent).to.equal(COMPOUND_PERCENT);
      expect(plan.strategy.uniswapPercent).to.equal(UNISWAP_PERCENT);
      expect(plan.totalDeposited).to.equal(0);
      void expect(plan.active).to.be.true;
    });

    it("Should add planId to user's plan list", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const planIds = await lumoContract.getUserPlanIds(user1.address);
      expect(planIds.length).to.equal(1);
      expect(planIds[0]).to.equal(PLAN_ID_1);
    });

    it("Should revert if monthly amount is zero", async function () {
      await expect(
        lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, 0, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT),
      ).to.be.revertedWith("Monthly amount must be greater than 0");
    });

    it("Should revert if percentages don't sum to 100", async function () {
      await expect(lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, 40, 40, 40)).to.be.revertedWith(
        "Percents must sum to 100",
      );
    });

    it("Should revert if plan with same ID already exists", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT),
      ).to.be.revertedWith("Plan already exists");
    });

    it("Should allow user to create multiple plans with different IDs", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_2, ethers.parseEther("0.2"), 50, 25, 25);

      const planIds = await lumoContract.getUserPlanIds(user1.address);
      expect(planIds.length).to.equal(2);

      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      const plan2 = await lumoContract.getPlan(user1.address, PLAN_ID_2);

      expect(plan1.monthlyAmount).to.equal(MONTHLY_AMOUNT);
      expect(plan2.monthlyAmount).to.equal(ethers.parseEther("0.2"));
    });

    it("Should allow multiple users to create plans", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      await lumoContract.connect(user2).createSIPPlan(PLAN_ID_1, ethers.parseEther("0.5"), 50, 25, 25);

      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      const plan2 = await lumoContract.getPlan(user2.address, PLAN_ID_1);

      expect(plan1.user).to.equal(user1.address);
      expect(plan2.user).to.equal(user2.address);
      expect(plan1.monthlyAmount).to.equal(MONTHLY_AMOUNT);
      expect(plan2.monthlyAmount).to.equal(ethers.parseEther("0.5"));
    });

    it("Should handle 100% allocation to single protocol", async function () {
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, 100, 0, 0);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.strategy.aavePercent).to.equal(100);
      expect(plan.strategy.compoundPercent).to.equal(0);
      expect(plan.strategy.uniswapPercent).to.equal(0);
    });
  });

  describe("Direct Deposit", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should accept direct deposits", async function () {
      const depositAmount = ethers.parseEther("1");

      await expect(lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: depositAmount }))
        .to.emit(lumoContract, "DepositExecuted")
        .withArgs(user1.address, PLAN_ID_1, depositAmount);
    });

    it("Should update total deposited correctly", async function () {
      const depositAmount = ethers.parseEther("1");

      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: depositAmount });

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.totalDeposited).to.equal(depositAmount);
    });

    it("Should allocate funds correctly to protocols", async function () {
      const depositAmount = ethers.parseEther("1");

      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: depositAmount });

      const expectedAave = (depositAmount * BigInt(AAVE_PERCENT)) / 100n;
      const expectedCompound = (depositAmount * BigInt(COMPOUND_PERCENT)) / 100n;
      const expectedUniswap = (depositAmount * BigInt(UNISWAP_PERCENT)) / 100n;

      expect(await ethers.provider.getBalance(await mockAave.getAddress())).to.equal(expectedAave);
      expect(await ethers.provider.getBalance(await mockCompound.getAddress())).to.equal(expectedCompound);
      expect(await ethers.provider.getBalance(await mockUniswap.getAddress())).to.equal(expectedUniswap);
    });

    it("Should emit FundsAllocated events", async function () {
      const depositAmount = ethers.parseEther("1");
      const expectedAave = (depositAmount * BigInt(AAVE_PERCENT)) / 100n;

      await expect(lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: depositAmount }))
        .to.emit(lumoContract, "FundsAllocated")
        .withArgs(await mockAave.getAddress(), expectedAave);
    });

    it("Should revert if no active plan", async function () {
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);

      await expect(
        lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("1") }),
      ).to.be.revertedWith("No active plan");
    });

    it("Should revert if no ETH sent", async function () {
      await expect(lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: 0 })).to.be.revertedWith(
        "Must send ETH",
      );
    });

    it("Should update lastDepositTime", async function () {
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("1") });

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.lastDepositTime).to.be.gt(0);
    });

    it("Should handle multiple deposits", async function () {
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("0.5") });
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: ethers.parseEther("0.3") });

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.totalDeposited).to.equal(ethers.parseEther("0.8"));
    });
  });

  describe("Cancel Plan", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should cancel an active plan", async function () {
      await expect(lumoContract.connect(user1).cancelPlan(PLAN_ID_1))
        .to.emit(lumoContract, "PlanCancelled")
        .withArgs(user1.address, PLAN_ID_1);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.false;
    });

    it("Should revert if no active plan", async function () {
      await lumoContract.connect(user1).cancelPlan(PLAN_ID_1);
      await expect(lumoContract.connect(user1).cancelPlan(PLAN_ID_1)).to.be.revertedWith("No active plan");
    });

    it("Should revert if not plan owner", async function () {
      await expect(lumoContract.connect(user2).cancelPlan(PLAN_ID_1)).to.be.revertedWith("No active plan");
    });

    it("Should only affect the specific plan", async function () {
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_2, MONTHLY_AMOUNT, 50, 25, 25);

      await lumoContract.connect(user1).cancelPlan(PLAN_ID_1);

      const plan1 = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      const plan2 = await lumoContract.getPlan(user1.address, PLAN_ID_2);

      void expect(plan1.active).to.be.false;
      void expect(plan2.active).to.be.true;
    });
  });

  describe("Pause Plan", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
    });

    it("Should pause an active plan", async function () {
      await expect(lumoContract.connect(user1).pausePlan(PLAN_ID_1))
        .to.emit(lumoContract, "PlanPaused")
        .withArgs(user1.address, PLAN_ID_1);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.false;
    });

    it("Should revert if no active plan", async function () {
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);
      await expect(lumoContract.connect(user1).pausePlan(PLAN_ID_1)).to.be.revertedWith("No active plan");
    });

    it("Should revert if not plan owner", async function () {
      await expect(lumoContract.connect(user2).pausePlan(PLAN_ID_1)).to.be.revertedWith("No active plan");
    });
  });

  describe("Resume Plan", function () {
    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
      await lumoContract.connect(user1).pausePlan(PLAN_ID_1);
    });

    it("Should resume a paused plan", async function () {
      await expect(lumoContract.connect(user1).resumePlan(PLAN_ID_1))
        .to.emit(lumoContract, "PlanResumed")
        .withArgs(user1.address, PLAN_ID_1);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      void expect(plan.active).to.be.true;
    });

    it("Should revert if plan already active", async function () {
      await lumoContract.connect(user1).resumePlan(PLAN_ID_1);
      await expect(lumoContract.connect(user1).resumePlan(PLAN_ID_1)).to.be.revertedWith("Plan already active");
    });

    it("Should revert if not plan owner", async function () {
      await expect(lumoContract.connect(user2).resumePlan(PLAN_ID_1)).to.be.revertedWith("Plan does not exist");
    });

    it("Should revert if plan does not exist", async function () {
      await expect(lumoContract.connect(user1).resumePlan(999)).to.be.revertedWith("Plan does not exist");
    });
  });

  describe("Get Plan", function () {
    it("Should return empty plan for non-existent plan", async function () {
      const plan = await lumoContract.getPlan(user1.address, 999);
      expect(plan.user).to.equal(ethers.ZeroAddress);
      expect(plan.monthlyAmount).to.equal(0);
      void expect(plan.active).to.be.false;
    });

    it("Should return correct plan details", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.user).to.equal(user1.address);
      expect(plan.planId).to.equal(PLAN_ID_1);
      expect(plan.monthlyAmount).to.equal(MONTHLY_AMOUNT);
    });
  });

  describe("Get User Plan IDs", function () {
    it("Should return empty array for user without plans", async function () {
      const planIds = await lumoContract.getUserPlanIds(user1.address);
      expect(planIds.length).to.equal(0);
    });

    it("Should return all plan IDs for user", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_2, MONTHLY_AMOUNT, 50, 25, 25);

      const planIds = await lumoContract.getUserPlanIds(user1.address);
      expect(planIds.length).to.equal(2);
      expect(planIds[0]).to.equal(PLAN_ID_1);
      expect(planIds[1]).to.equal(PLAN_ID_2);
    });
  });

  describe("Owner Functions", function () {
    describe("setSpendPermissionManager", function () {
      it("Should update SpendPermissionManager address", async function () {
        const newAddress = user2.address;
        await lumoContract.connect(owner).setSpendPermissionManager(newAddress);
        expect(await lumoContract.spendPermissionManager()).to.equal(newAddress);
      });

      it("Should revert if not owner", async function () {
        await expect(lumoContract.connect(user1).setSpendPermissionManager(user2.address)).to.be.revertedWith(
          "Only owner",
        );
      });
    });

    describe("transferOwnership", function () {
      it("Should transfer ownership", async function () {
        await lumoContract.connect(owner).transferOwnership(user1.address);
        expect(await lumoContract.owner()).to.equal(user1.address);
      });

      it("Should revert if not owner", async function () {
        await expect(lumoContract.connect(user1).transferOwnership(user2.address)).to.be.revertedWith("Only owner");
      });

      it("Should revert if new owner is zero address", async function () {
        await expect(lumoContract.connect(owner).transferOwnership(ethers.ZeroAddress)).to.be.revertedWith(
          "Invalid address",
        );
      });
    });
  });

  describe("Receive Function", function () {
    it("Should accept direct ETH transfers", async function () {
      const amount = ethers.parseEther("1");

      await expect(
        owner.sendTransaction({
          to: await lumoContract.getAddress(),
          value: amount,
        }),
      ).to.not.be.reverted;

      expect(await ethers.provider.getBalance(await lumoContract.getAddress())).to.equal(amount);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small monthly amounts", async function () {
      const smallAmount = 1000n; // 1000 wei

      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, smallAmount, 34, 33, 33);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.monthlyAmount).to.equal(smallAmount);
    });

    it("Should handle large monthly amounts", async function () {
      const largeAmount = ethers.parseEther("1000");

      await lumoContract
        .connect(user1)
        .createSIPPlan(PLAN_ID_1, largeAmount, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.monthlyAmount).to.equal(largeAmount);
    });

    it("Should handle many plans per user", async function () {
      const numPlans = 10;

      for (let i = 1; i <= numPlans; i++) {
        await lumoContract
          .connect(user1)
          .createSIPPlan(i, MONTHLY_AMOUNT, AAVE_PERCENT, COMPOUND_PERCENT, UNISWAP_PERCENT);
      }

      const planIds = await lumoContract.getUserPlanIds(user1.address);
      expect(planIds.length).to.equal(numPlans);
    });

    it("Should handle uneven percentage distributions", async function () {
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, 33, 33, 34);

      const plan = await lumoContract.getPlan(user1.address, PLAN_ID_1);
      expect(plan.strategy.aavePercent).to.equal(33);
      expect(plan.strategy.compoundPercent).to.equal(33);
      expect(plan.strategy.uniswapPercent).to.equal(34);
    });

    it("Should correctly allocate with uneven percentages on deposit", async function () {
      await lumoContract.connect(user1).createSIPPlan(PLAN_ID_1, MONTHLY_AMOUNT, 33, 33, 34);

      const depositAmount = ethers.parseEther("1");
      await lumoContract.connect(user1).depositDirect(PLAN_ID_1, { value: depositAmount });

      // With 33%, 33%, 34% of 1 ETH
      const expectedAave = (depositAmount * 33n) / 100n;
      const expectedCompound = (depositAmount * 33n) / 100n;
      const expectedUniswap = (depositAmount * 34n) / 100n;

      expect(await ethers.provider.getBalance(await mockAave.getAddress())).to.equal(expectedAave);
      expect(await ethers.provider.getBalance(await mockCompound.getAddress())).to.equal(expectedCompound);
      expect(await ethers.provider.getBalance(await mockUniswap.getAddress())).to.equal(expectedUniswap);
    });
  });
});
