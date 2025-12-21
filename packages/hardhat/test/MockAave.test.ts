import { expect } from "chai";
import { ethers } from "hardhat";
import { MockAave } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MockAave", function () {
  let mockAave: MockAave;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    const MockAaveFactory = await ethers.getContractFactory("MockAave");
    mockAave = (await MockAaveFactory.deploy()) as MockAave;
    await mockAave.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should initialize with zero total deposits", async function () {
      expect(await mockAave.totalDeposits()).to.equal(0);
    });

    it("Should initialize with zero balance for any user", async function () {
      expect(await mockAave.balanceOf(user1.address)).to.equal(0);
    });
  });

  describe("Deposit Function", function () {
    it("Should accept deposits and update user balance", async function () {
      const depositAmount = ethers.parseEther("5");

      await expect(mockAave.connect(user1).deposit({ value: depositAmount }))
        .to.emit(mockAave, "Deposited")
        .withArgs(user1.address, depositAmount);

      expect(await mockAave.balanceOf(user1.address)).to.equal(depositAmount);
    });

    it("Should update total deposits", async function () {
      const depositAmount = ethers.parseEther("5");

      await mockAave.connect(user1).deposit({ value: depositAmount });

      expect(await mockAave.totalDeposits()).to.equal(depositAmount);
    });

    it("Should revert if deposit amount is zero", async function () {
      await expect(mockAave.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Must deposit something");
    });

    it("Should allow multiple deposits from same user", async function () {
      const deposit1 = ethers.parseEther("3");
      const deposit2 = ethers.parseEther("2");

      await mockAave.connect(user1).deposit({ value: deposit1 });
      await mockAave.connect(user1).deposit({ value: deposit2 });

      expect(await mockAave.balanceOf(user1.address)).to.equal(deposit1 + deposit2);
      expect(await mockAave.totalDeposits()).to.equal(deposit1 + deposit2);
    });

    it("Should handle deposits from multiple users", async function () {
      const deposit1 = ethers.parseEther("3");
      const deposit2 = ethers.parseEther("5");

      await mockAave.connect(user1).deposit({ value: deposit1 });
      await mockAave.connect(user2).deposit({ value: deposit2 });

      expect(await mockAave.balanceOf(user1.address)).to.equal(deposit1);
      expect(await mockAave.balanceOf(user2.address)).to.equal(deposit2);
      expect(await mockAave.totalDeposits()).to.equal(deposit1 + deposit2);
    });

    it("Should correctly track contract balance", async function () {
      const depositAmount = ethers.parseEther("10");

      await mockAave.connect(user1).deposit({ value: depositAmount });

      const contractBalance = await ethers.provider.getBalance(await mockAave.getAddress());
      expect(contractBalance).to.equal(depositAmount);
    });
  });

  describe("Withdraw Function", function () {
    const depositAmount = ethers.parseEther("10");

    beforeEach(async function () {
      await mockAave.connect(user1).deposit({ value: depositAmount });
    });

    it("Should allow user to withdraw their deposit", async function () {
      const withdrawAmount = ethers.parseEther("5");

      await expect(mockAave.connect(user1).withdraw(withdrawAmount))
        .to.emit(mockAave, "Withdrawn")
        .withArgs(user1.address, withdrawAmount);

      expect(await mockAave.balanceOf(user1.address)).to.equal(depositAmount - withdrawAmount);
    });

    it("Should update total deposits after withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("5");

      await mockAave.connect(user1).withdraw(withdrawAmount);

      expect(await mockAave.totalDeposits()).to.equal(depositAmount - withdrawAmount);
    });

    it("Should transfer ETH to user on withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("5");
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await mockAave.connect(user1).withdraw(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + withdrawAmount - gasUsed);
    });

    it("Should revert if withdrawal amount exceeds balance", async function () {
      const withdrawAmount = ethers.parseEther("20");

      await expect(mockAave.connect(user1).withdraw(withdrawAmount)).to.be.revertedWith("Insufficient balance");
    });

    it("Should revert if user has no deposits", async function () {
      await expect(mockAave.connect(user2).withdraw(ethers.parseEther("1"))).to.be.revertedWith("Insufficient balance");
    });

    it("Should allow full withdrawal", async function () {
      await mockAave.connect(user1).withdraw(depositAmount);

      expect(await mockAave.balanceOf(user1.address)).to.equal(0);
      expect(await mockAave.totalDeposits()).to.equal(0);
    });

    it("Should allow multiple partial withdrawals", async function () {
      const withdraw1 = ethers.parseEther("3");
      const withdraw2 = ethers.parseEther("2");

      await mockAave.connect(user1).withdraw(withdraw1);
      await mockAave.connect(user1).withdraw(withdraw2);

      expect(await mockAave.balanceOf(user1.address)).to.equal(depositAmount - withdraw1 - withdraw2);
    });

    it("Should not affect other users' balances", async function () {
      const user2Deposit = ethers.parseEther("5");
      await mockAave.connect(user2).deposit({ value: user2Deposit });

      await mockAave.connect(user1).withdraw(ethers.parseEther("3"));

      expect(await mockAave.balanceOf(user2.address)).to.equal(user2Deposit);
    });
  });

  describe("Receive Function", function () {
    it("Should accept direct ETH transfers", async function () {
      const amount = ethers.parseEther("5");

      await expect(
        user1.sendTransaction({
          to: await mockAave.getAddress(),
          value: amount,
        }),
      )
        .to.emit(mockAave, "Deposited")
        .withArgs(user1.address, amount);

      expect(await mockAave.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should update total deposits on direct transfer", async function () {
      const amount = ethers.parseEther("5");

      await user1.sendTransaction({
        to: await mockAave.getAddress(),
        value: amount,
      });

      expect(await mockAave.totalDeposits()).to.equal(amount);
    });

    it("Should handle multiple direct transfers", async function () {
      const amount1 = ethers.parseEther("3");
      const amount2 = ethers.parseEther("2");

      await user1.sendTransaction({
        to: await mockAave.getAddress(),
        value: amount1,
      });

      await user1.sendTransaction({
        to: await mockAave.getAddress(),
        value: amount2,
      });

      expect(await mockAave.balanceOf(user1.address)).to.equal(amount1 + amount2);
    });
  });

  describe("Balance Tracking", function () {
    it("Should correctly track balances for multiple users", async function () {
      const deposit1 = ethers.parseEther("5");
      const deposit2 = ethers.parseEther("10");
      const deposit3 = ethers.parseEther("7");

      await mockAave.connect(user1).deposit({ value: deposit1 });
      await mockAave.connect(user2).deposit({ value: deposit2 });
      await mockAave.connect(owner).deposit({ value: deposit3 });

      expect(await mockAave.balanceOf(user1.address)).to.equal(deposit1);
      expect(await mockAave.balanceOf(user2.address)).to.equal(deposit2);
      expect(await mockAave.balanceOf(owner.address)).to.equal(deposit3);
      expect(await mockAave.totalDeposits()).to.equal(deposit1 + deposit2 + deposit3);
    });

    it("Should maintain accurate balances after deposits and withdrawals", async function () {
      await mockAave.connect(user1).deposit({ value: ethers.parseEther("10") });
      await mockAave.connect(user2).deposit({ value: ethers.parseEther("5") });

      await mockAave.connect(user1).withdraw(ethers.parseEther("3"));

      expect(await mockAave.balanceOf(user1.address)).to.equal(ethers.parseEther("7"));
      expect(await mockAave.balanceOf(user2.address)).to.equal(ethers.parseEther("5"));
      expect(await mockAave.totalDeposits()).to.equal(ethers.parseEther("12"));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small deposits", async function () {
      const smallAmount = 1n; // 1 wei

      await mockAave.connect(user1).deposit({ value: smallAmount });

      expect(await mockAave.balanceOf(user1.address)).to.equal(smallAmount);
    });

    it("Should handle large deposits", async function () {
      const largeAmount = ethers.parseEther("100");

      await mockAave.connect(user1).deposit({ value: largeAmount });

      expect(await mockAave.balanceOf(user1.address)).to.equal(largeAmount);
    });

    it("Should handle zero balance withdrawal attempt", async function () {
      await expect(mockAave.connect(user1).withdraw(1)).to.be.revertedWith("Insufficient balance");
    });

    it("Should handle deposit and immediate full withdrawal", async function () {
      const amount = ethers.parseEther("5");

      await mockAave.connect(user1).deposit({ value: amount });
      await mockAave.connect(user1).withdraw(amount);

      expect(await mockAave.balanceOf(user1.address)).to.equal(0);
      expect(await mockAave.totalDeposits()).to.equal(0);
    });
  });
});
