import { expect } from "chai";
import { ethers } from "hardhat";
import { LumoContract, MockAave, MockCompound, MockUniswap } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LumoContract", function () {
  let lumoContract: LumoContract;
  let mockAave: MockAave;
  let mockCompound: MockCompound;
  let mockUniswap: MockUniswap;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

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

    // Deploy Lumo contract
    const LumoContractFactory = await ethers.getContractFactory("LumoContract");
    lumoContract = (await LumoContractFactory.deploy(
      await mockAave.getAddress(),
      await mockCompound.getAddress(),
      await mockUniswap.getAddress(),
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
  });

  describe("Create SIP Plan", function () {
    const totalAmount = ethers.parseEther("10");
    const monthlyAmount = ethers.parseEther("1");
    const duration = 10; // 10 months
    const aavePercent = 40;
    const compoundPercent = 30;
    const uniswapPercent = 30;

    it("Should create a SIP plan successfully", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
            value: totalAmount,
          }),
      )
        .to.emit(lumoContract, "SIPCreated")
        .withArgs(user1.address, totalAmount, duration);
    });

    it("Should store plan details correctly", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
          value: totalAmount,
        });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.user).to.equal(user1.address);
      expect(plan.totalAmount).to.equal(totalAmount);
      expect(plan.monthlyAmount).to.equal(monthlyAmount);
      expect(plan.duration).to.equal(duration);
      expect(plan.strategy.aavePercent).to.equal(aavePercent);
      expect(plan.strategy.compoundPercent).to.equal(compoundPercent);
      expect(plan.strategy.uniswapPercent).to.equal(uniswapPercent);
      expect(plan.deposited).to.equal(totalAmount);
      void expect(plan.active).to.be.true;
    });

    it("Should revert if ETH amount doesn't match totalAmount", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
            value: ethers.parseEther("5"),
          }),
      ).to.be.revertedWith("Send correct ETH amount");
    });

    it("Should revert if monthly amount exceeds total", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, ethers.parseEther("20"), duration, aavePercent, compoundPercent, uniswapPercent, {
            value: totalAmount,
          }),
      ).to.be.revertedWith("Monthly amount exceeds total");
    });

    it("Should revert if percentages don't sum to 100", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, 40, 40, 40, { value: totalAmount }),
      ).to.be.revertedWith("Percents must sum to 100");
    });

    it("Should revert if user already has an active plan", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
          value: totalAmount,
        });

      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
            value: totalAmount,
          }),
      ).to.be.revertedWith("Plan already exists");
    });

    it("Should allocate funds correctly to protocols", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
          value: totalAmount,
        });

      const expectedAave = (totalAmount * BigInt(aavePercent)) / 100n;
      const expectedCompound = (totalAmount * BigInt(compoundPercent)) / 100n;
      const expectedUniswap = (totalAmount * BigInt(uniswapPercent)) / 100n;

      expect(await ethers.provider.getBalance(await mockAave.getAddress())).to.equal(expectedAave);
      expect(await ethers.provider.getBalance(await mockCompound.getAddress())).to.equal(expectedCompound);
      expect(await ethers.provider.getBalance(await mockUniswap.getAddress())).to.equal(expectedUniswap);
    });

    it("Should emit FundsAllocated events for each protocol", async function () {
      const expectedAave = (totalAmount * BigInt(aavePercent)) / 100n;
      const expectedCompound = (totalAmount * BigInt(compoundPercent)) / 100n;
      const expectedUniswap = (totalAmount * BigInt(uniswapPercent)) / 100n;

      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
            value: totalAmount,
          }),
      )
        .to.emit(lumoContract, "FundsAllocated")
        .withArgs(await mockAave.getAddress(), expectedAave)
        .and.to.emit(lumoContract, "FundsAllocated")
        .withArgs(await mockCompound.getAddress(), expectedCompound)
        .and.to.emit(lumoContract, "FundsAllocated")
        .withArgs(await mockUniswap.getAddress(), expectedUniswap);
    });

    it("Should emit DepositExecuted event", async function () {
      await expect(
        lumoContract
          .connect(user1)
          .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
            value: totalAmount,
          }),
      )
        .to.emit(lumoContract, "DepositExecuted")
        .withArgs(user1.address, totalAmount);
    });

    it("Should handle 100% allocation to single protocol", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 100, 0, 0, { value: totalAmount });

      expect(await ethers.provider.getBalance(await mockAave.getAddress())).to.equal(totalAmount);
      expect(await ethers.provider.getBalance(await mockCompound.getAddress())).to.equal(0);
      expect(await ethers.provider.getBalance(await mockUniswap.getAddress())).to.equal(0);
    });

    it("Should allow multiple users to create plans", async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, aavePercent, compoundPercent, uniswapPercent, {
          value: totalAmount,
        });

      await lumoContract
        .connect(user2)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 50, 25, 25, { value: totalAmount });

      const plan1 = await lumoContract.getPlan(user1.address);
      const plan2 = await lumoContract.getPlan(user2.address);

      expect(plan1.user).to.equal(user1.address);
      expect(plan2.user).to.equal(user2.address);
      void expect(plan1.active).to.be.true;
      void expect(plan2.active).to.be.true;
    });
  });

  describe("Cancel Plan", function () {
    const totalAmount = ethers.parseEther("10");
    const monthlyAmount = ethers.parseEther("1");
    const duration = 10;

    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 40, 30, 30, { value: totalAmount });
    });

    it("Should cancel an active plan", async function () {
      await expect(lumoContract.connect(user1).cancelPlan())
        .to.emit(lumoContract, "PlanCancelled")
        .withArgs(user1.address, 0);

      const plan = await lumoContract.getPlan(user1.address);
      void expect(plan.active).to.be.false;
    });

    it("Should revert if no active plan exists", async function () {
      await lumoContract.connect(user1).cancelPlan();

      await expect(lumoContract.connect(user1).cancelPlan()).to.be.revertedWith("No active plan");
    });

    it("Should revert if user has no plan", async function () {
      await expect(lumoContract.connect(user2).cancelPlan()).to.be.revertedWith("No active plan");
    });

    it("Should allow creating new plan after cancellation", async function () {
      await lumoContract.connect(user1).cancelPlan();

      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 50, 25, 25, { value: totalAmount });

      const plan = await lumoContract.getPlan(user1.address);
      void expect(plan.active).to.be.true;
      expect(plan.strategy.aavePercent).to.equal(50);
    });
  });

  describe("Pause Plan", function () {
    const totalAmount = ethers.parseEther("10");
    const monthlyAmount = ethers.parseEther("1");
    const duration = 10;

    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 40, 30, 30, { value: totalAmount });
    });

    it("Should pause an active plan", async function () {
      await expect(lumoContract.connect(user1).pausePlan()).to.emit(lumoContract, "PlanPaused").withArgs(user1.address);

      const plan = await lumoContract.getPlan(user1.address);
      void expect(plan.active).to.be.false;
    });

    it("Should revert if no active plan exists", async function () {
      await lumoContract.connect(user1).pausePlan();

      await expect(lumoContract.connect(user1).pausePlan()).to.be.revertedWith("No active plan");
    });

    it("Should revert if user has no plan", async function () {
      await expect(lumoContract.connect(user2).pausePlan()).to.be.revertedWith("No active plan");
    });
  });

  describe("Resume Plan", function () {
    const totalAmount = ethers.parseEther("10");
    const monthlyAmount = ethers.parseEther("1");
    const duration = 10;

    beforeEach(async function () {
      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 40, 30, 30, { value: totalAmount });
      await lumoContract.connect(user1).pausePlan();
    });

    it("Should resume a paused plan", async function () {
      await expect(lumoContract.connect(user1).resumePlan())
        .to.emit(lumoContract, "PlanResumed")
        .withArgs(user1.address);

      const plan = await lumoContract.getPlan(user1.address);
      void expect(plan.active).to.be.true;
    });

    it("Should revert if plan is already active", async function () {
      await lumoContract.connect(user1).resumePlan();

      await expect(lumoContract.connect(user1).resumePlan()).to.be.revertedWith("Plan already active");
    });

    it("Should revert if user has no plan", async function () {
      await expect(lumoContract.connect(user2).resumePlan()).to.be.revertedWith("No plan found");
    });

    it("Should allow resuming after cancellation", async function () {
      // Cancel the plan first
      await lumoContract.connect(user1).resumePlan(); // Resume from pause
      await lumoContract.connect(user1).cancelPlan();

      // Resume should work
      await expect(lumoContract.connect(user1).resumePlan())
        .to.emit(lumoContract, "PlanResumed")
        .withArgs(user1.address);

      const plan = await lumoContract.getPlan(user1.address);
      void expect(plan.active).to.be.true;
    });
  });

  describe("Get Plan", function () {
    it("Should return empty plan for user without plan", async function () {
      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.user).to.equal(ethers.ZeroAddress);
      expect(plan.totalAmount).to.equal(0);
      void expect(plan.active).to.be.false;
    });

    it("Should return correct plan details", async function () {
      const totalAmount = ethers.parseEther("10");
      const monthlyAmount = ethers.parseEther("1");
      const duration = 10;

      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, monthlyAmount, duration, 40, 30, 30, { value: totalAmount });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.user).to.equal(user1.address);
      expect(plan.totalAmount).to.equal(totalAmount);
      expect(plan.monthlyAmount).to.equal(monthlyAmount);
      expect(plan.duration).to.equal(duration);
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
    it("Should handle very small amounts", async function () {
      const smallAmount = 1000n; // 1000 wei

      await lumoContract.connect(user1).createSIPPlan(smallAmount, smallAmount, 1, 34, 33, 33, { value: smallAmount });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.deposited).to.equal(smallAmount);
    });

    it("Should handle large amounts", async function () {
      const largeAmount = ethers.parseEther("100");

      await lumoContract
        .connect(user1)
        .createSIPPlan(largeAmount, ethers.parseEther("10"), 10, 40, 30, 30, { value: largeAmount });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.deposited).to.equal(largeAmount);
    });

    it("Should handle zero monthly amount", async function () {
      const totalAmount = ethers.parseEther("10");

      await lumoContract.connect(user1).createSIPPlan(totalAmount, 0, 10, 40, 30, 30, { value: totalAmount });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.monthlyAmount).to.equal(0);
    });

    it("Should handle uneven percentage distributions", async function () {
      const totalAmount = ethers.parseEther("10");

      await lumoContract
        .connect(user1)
        .createSIPPlan(totalAmount, ethers.parseEther("1"), 10, 33, 33, 34, { value: totalAmount });

      const plan = await lumoContract.getPlan(user1.address);
      expect(plan.strategy.aavePercent).to.equal(33);
      expect(plan.strategy.compoundPercent).to.equal(33);
      expect(plan.strategy.uniswapPercent).to.equal(34);
    });
  });
});
