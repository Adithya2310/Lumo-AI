import { expect } from "chai";
import { ethers } from "hardhat";
import { MockAave, MockCompound, MockUniswap } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Tests for Mock Protocol Contracts
 * These tests ensure the mock protocols behave correctly for deposits, withdrawals, and balance tracking
 */
describe("Mock Protocols", function () {
  let mockAave: MockAave;
  let mockCompound: MockCompound;
  let mockUniswap: MockUniswap;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [, user1, user2] = await ethers.getSigners();

    const MockAaveFactory = await ethers.getContractFactory("MockAave");
    mockAave = (await MockAaveFactory.deploy()) as MockAave;
    await mockAave.waitForDeployment();

    const MockCompoundFactory = await ethers.getContractFactory("MockCompound");
    mockCompound = (await MockCompoundFactory.deploy()) as MockCompound;
    await mockCompound.waitForDeployment();

    const MockUniswapFactory = await ethers.getContractFactory("MockUniswap");
    mockUniswap = (await MockUniswapFactory.deploy()) as MockUniswap;
    await mockUniswap.waitForDeployment();
  });

  describe("MockAave", function () {
    describe("Deposit", function () {
      it("Should accept deposits via deposit() function", async function () {
        const depositAmount = ethers.parseEther("1");

        await expect(mockAave.connect(user1).deposit({ value: depositAmount }))
          .to.emit(mockAave, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockAave.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockAave.totalDeposits()).to.equal(depositAmount);
      });

      it("Should accept deposits via receive() function", async function () {
        const depositAmount = ethers.parseEther("0.5");

        await expect(
          user1.sendTransaction({
            to: await mockAave.getAddress(),
            value: depositAmount,
          }),
        )
          .to.emit(mockAave, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockAave.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockAave.totalDeposits()).to.equal(depositAmount);
      });

      it("Should revert if deposit amount is zero", async function () {
        await expect(mockAave.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Must deposit something");
      });

      it("Should track multiple deposits from same user", async function () {
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("1") });
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("0.5") });

        expect(await mockAave.deposits(user1.address)).to.equal(ethers.parseEther("1.5"));
        expect(await mockAave.totalDeposits()).to.equal(ethers.parseEther("1.5"));
      });

      it("Should track deposits from multiple users separately", async function () {
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("1") });
        await mockAave.connect(user2).deposit({ value: ethers.parseEther("2") });

        expect(await mockAave.deposits(user1.address)).to.equal(ethers.parseEther("1"));
        expect(await mockAave.deposits(user2.address)).to.equal(ethers.parseEther("2"));
        expect(await mockAave.totalDeposits()).to.equal(ethers.parseEther("3"));
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("2") });
      });

      it("Should allow withdrawal of deposited funds", async function () {
        const withdrawAmount = ethers.parseEther("1");
        const initialBalance = await ethers.provider.getBalance(user1.address);

        const tx = await mockAave.connect(user1).withdraw(withdrawAmount);
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

        await expect(tx).to.emit(mockAave, "Withdrawn").withArgs(user1.address, withdrawAmount);

        expect(await mockAave.deposits(user1.address)).to.equal(ethers.parseEther("1"));
        expect(await mockAave.totalDeposits()).to.equal(ethers.parseEther("1"));

        const finalBalance = await ethers.provider.getBalance(user1.address);
        expect(finalBalance).to.equal(initialBalance + withdrawAmount - gasUsed);
      });

      it("Should allow withdrawal of entire balance", async function () {
        const withdrawAmount = ethers.parseEther("2");

        await expect(mockAave.connect(user1).withdraw(withdrawAmount))
          .to.emit(mockAave, "Withdrawn")
          .withArgs(user1.address, withdrawAmount);

        expect(await mockAave.deposits(user1.address)).to.equal(0);
        expect(await mockAave.totalDeposits()).to.equal(0);
      });

      it("Should revert if withdrawal amount exceeds balance", async function () {
        await expect(mockAave.connect(user1).withdraw(ethers.parseEther("3"))).to.be.revertedWith(
          "Insufficient balance",
        );
      });

      it("Should revert if user has no deposits", async function () {
        await expect(mockAave.connect(user2).withdraw(ethers.parseEther("1"))).to.be.revertedWith(
          "Insufficient balance",
        );
      });

      it("Should handle multiple withdrawals", async function () {
        await mockAave.connect(user1).withdraw(ethers.parseEther("0.5"));
        await mockAave.connect(user1).withdraw(ethers.parseEther("0.5"));

        expect(await mockAave.deposits(user1.address)).to.equal(ethers.parseEther("1"));
        expect(await mockAave.totalDeposits()).to.equal(ethers.parseEther("1"));
      });
    });

    describe("BalanceOf", function () {
      it("Should return zero for users with no deposits", async function () {
        expect(await mockAave.balanceOf(user1.address)).to.equal(0);
      });

      it("Should return correct balance after deposit", async function () {
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("1.5") });
        expect(await mockAave.balanceOf(user1.address)).to.equal(ethers.parseEther("1.5"));
      });

      it("Should return correct balance after deposit and withdrawal", async function () {
        await mockAave.connect(user1).deposit({ value: ethers.parseEther("2") });
        await mockAave.connect(user1).withdraw(ethers.parseEther("0.5"));
        expect(await mockAave.balanceOf(user1.address)).to.equal(ethers.parseEther("1.5"));
      });
    });
  });

  describe("MockCompound", function () {
    describe("Deposit", function () {
      it("Should accept deposits via deposit() function", async function () {
        const depositAmount = ethers.parseEther("1");

        await expect(mockCompound.connect(user1).deposit({ value: depositAmount }))
          .to.emit(mockCompound, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockCompound.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockCompound.totalDeposits()).to.equal(depositAmount);
      });

      it("Should accept deposits via receive() function", async function () {
        const depositAmount = ethers.parseEther("0.5");

        await expect(
          user1.sendTransaction({
            to: await mockCompound.getAddress(),
            value: depositAmount,
          }),
        )
          .to.emit(mockCompound, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockCompound.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockCompound.totalDeposits()).to.equal(depositAmount);
      });

      it("Should revert if deposit amount is zero", async function () {
        await expect(mockCompound.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Must deposit something");
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        await mockCompound.connect(user1).deposit({ value: ethers.parseEther("2") });
      });

      it("Should allow withdrawal of deposited funds", async function () {
        const withdrawAmount = ethers.parseEther("1");

        await expect(mockCompound.connect(user1).withdraw(withdrawAmount))
          .to.emit(mockCompound, "Withdrawn")
          .withArgs(user1.address, withdrawAmount);

        expect(await mockCompound.deposits(user1.address)).to.equal(ethers.parseEther("1"));
        expect(await mockCompound.totalDeposits()).to.equal(ethers.parseEther("1"));
      });

      it("Should revert if withdrawal amount exceeds balance", async function () {
        await expect(mockCompound.connect(user1).withdraw(ethers.parseEther("3"))).to.be.revertedWith(
          "Insufficient balance",
        );
      });
    });

    describe("BalanceOf", function () {
      it("Should return correct balance", async function () {
        await mockCompound.connect(user1).deposit({ value: ethers.parseEther("1.5") });
        expect(await mockCompound.balanceOf(user1.address)).to.equal(ethers.parseEther("1.5"));
      });
    });
  });

  describe("MockUniswap", function () {
    describe("Deposit", function () {
      it("Should accept deposits via deposit() function", async function () {
        const depositAmount = ethers.parseEther("1");

        await expect(mockUniswap.connect(user1).deposit({ value: depositAmount }))
          .to.emit(mockUniswap, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockUniswap.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockUniswap.totalDeposits()).to.equal(depositAmount);
      });

      it("Should accept deposits via receive() function", async function () {
        const depositAmount = ethers.parseEther("0.5");

        await expect(
          user1.sendTransaction({
            to: await mockUniswap.getAddress(),
            value: depositAmount,
          }),
        )
          .to.emit(mockUniswap, "Deposited")
          .withArgs(user1.address, depositAmount);

        expect(await mockUniswap.deposits(user1.address)).to.equal(depositAmount);
        expect(await mockUniswap.totalDeposits()).to.equal(depositAmount);
      });

      it("Should revert if deposit amount is zero", async function () {
        await expect(mockUniswap.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Must deposit something");
      });
    });

    describe("Withdraw", function () {
      beforeEach(async function () {
        await mockUniswap.connect(user1).deposit({ value: ethers.parseEther("2") });
      });

      it("Should allow withdrawal of deposited funds", async function () {
        const withdrawAmount = ethers.parseEther("1");

        await expect(mockUniswap.connect(user1).withdraw(withdrawAmount))
          .to.emit(mockUniswap, "Withdrawn")
          .withArgs(user1.address, withdrawAmount);

        expect(await mockUniswap.deposits(user1.address)).to.equal(ethers.parseEther("1"));
        expect(await mockUniswap.totalDeposits()).to.equal(ethers.parseEther("1"));
      });

      it("Should revert if withdrawal amount exceeds balance", async function () {
        await expect(mockUniswap.connect(user1).withdraw(ethers.parseEther("3"))).to.be.revertedWith(
          "Insufficient balance",
        );
      });
    });

    describe("BalanceOf", function () {
      it("Should return correct balance", async function () {
        await mockUniswap.connect(user1).deposit({ value: ethers.parseEther("1.5") });
        expect(await mockUniswap.balanceOf(user1.address)).to.equal(ethers.parseEther("1.5"));
      });
    });
  });

  describe("Cross-Protocol Tests", function () {
    it("Should maintain separate balances across protocols", async function () {
      await mockAave.connect(user1).deposit({ value: ethers.parseEther("1") });
      await mockCompound.connect(user1).deposit({ value: ethers.parseEther("2") });
      await mockUniswap.connect(user1).deposit({ value: ethers.parseEther("3") });

      expect(await mockAave.balanceOf(user1.address)).to.equal(ethers.parseEther("1"));
      expect(await mockCompound.balanceOf(user1.address)).to.equal(ethers.parseEther("2"));
      expect(await mockUniswap.balanceOf(user1.address)).to.equal(ethers.parseEther("3"));
    });

    it("Should handle deposits and withdrawals independently", async function () {
      await mockAave.connect(user1).deposit({ value: ethers.parseEther("2") });
      await mockCompound.connect(user1).deposit({ value: ethers.parseEther("2") });

      await mockAave.connect(user1).withdraw(ethers.parseEther("1"));

      expect(await mockAave.balanceOf(user1.address)).to.equal(ethers.parseEther("1"));
      expect(await mockCompound.balanceOf(user1.address)).to.equal(ethers.parseEther("2"));
    });
  });
});
