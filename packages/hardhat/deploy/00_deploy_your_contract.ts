import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the Lumo AI contracts:
 * 1. MockAave - Mock Aave lending protocol
 * 2. MockCompound - Mock Compound lending protocol
 * 3. MockUniswap - Mock Uniswap DEX protocol
 * 4. LumoContract - Main contract for SIP management and fund allocation
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployLumoContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    On localhost, the deployer account is the one that comes with Hardhat, which is already funded.

    When deploying to live networks (e.g `yarn deploy --network sepolia`), the deployer account
    should have sufficient balance to pay for the gas fees for contract creation.

    You can generate a random account with `yarn generate` or `yarn account:import` to import your
    existing PK which will fill DEPLOYER_PRIVATE_KEY_ENCRYPTED in the .env file (then used on hardhat.config.ts)
    You can run the `yarn account` command to check your balance in every network.
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Check if we're on a live network
  const isLiveNetwork = hre.network.name !== "hardhat" && hre.network.name !== "localhost";

  console.log("\n🚀 Deploying Lumo AI Contracts...");
  console.log(`📍 Network: ${hre.network.name}`);
  console.log(`👤 Deployer: ${deployer}\n`);

  // Deploy Mock Protocols
  console.log("📦 Deploying Mock Aave...");
  const mockAave = await deploy("MockAave", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    waitConfirmations: isLiveNetwork ? 2 : 1, // Wait for confirmations on live networks
  });
  console.log("✅ MockAave deployed at:", mockAave.address);

  // Small delay between deployments on live networks to prevent nonce issues
  if (isLiveNetwork) {
    console.log("⏳ Waiting for network confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log("\n📦 Deploying Mock Compound...");
  const mockCompound = await deploy("MockCompound", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    waitConfirmations: isLiveNetwork ? 2 : 1,
  });
  console.log("✅ MockCompound deployed at:", mockCompound.address);

  if (isLiveNetwork) {
    console.log("⏳ Waiting for network confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log("\n📦 Deploying Mock Uniswap...");
  const mockUniswap = await deploy("MockUniswap", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    waitConfirmations: isLiveNetwork ? 2 : 1,
  });
  console.log("✅ MockUniswap deployed at:", mockUniswap.address);

  if (isLiveNetwork) {
    console.log("⏳ Waiting for network confirmation...");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // SpendPermissionManager address on Base Sepolia
  // See: https://docs.base.org/identity/smart-wallet/spend-permissions
  const SPEND_PERMISSION_MANAGER_ADDRESS = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";

  // Deploy Main Lumo Contract
  console.log("\n📦 Deploying LumoContract...");
  console.log(`   Using SpendPermissionManager: ${SPEND_PERMISSION_MANAGER_ADDRESS}`);
  const lumoContract = await deploy("LumoContract", {
    from: deployer,
    args: [mockAave.address, mockCompound.address, mockUniswap.address, SPEND_PERMISSION_MANAGER_ADDRESS],
    log: true,
    autoMine: true,
    waitConfirmations: isLiveNetwork ? 2 : 1,
  });
  console.log("✅ LumoContract deployed at:", lumoContract.address);

  // Get the deployed contracts to interact with them
  const lumo = await hre.ethers.getContract<Contract>("LumoContract", deployer);
  const aave = await hre.ethers.getContract<Contract>("MockAave", deployer);
  const compound = await hre.ethers.getContract<Contract>("MockCompound", deployer);
  const uniswap = await hre.ethers.getContract<Contract>("MockUniswap", deployer);

  // Verify deployment
  console.log("\n🔍 Verifying deployment...");
  const aaveAddress = await lumo.aave();
  const compoundAddress = await lumo.compound();
  const uniswapAddress = await lumo.uniswap();
  const owner = await lumo.owner();

  console.log("✅ LumoContract configuration:");
  console.log("   - Aave address:", aaveAddress);
  console.log("   - Compound address:", compoundAddress);
  console.log("   - Uniswap address:", uniswapAddress);
  console.log("   - Owner:", owner);

  // Verify mock protocols
  const aaveTotalDeposits = await aave.totalDeposits();
  const compoundTotalDeposits = await compound.totalDeposits();
  const uniswapTotalDeposits = await uniswap.totalDeposits();

  console.log("\n✅ Mock Protocols initialized:");
  console.log("   - MockAave total deposits:", aaveTotalDeposits.toString());
  console.log("   - MockCompound total deposits:", compoundTotalDeposits.toString());
  console.log("   - MockUniswap total deposits:", uniswapTotalDeposits.toString());

  console.log("\n🎉 All Lumo AI contracts deployed successfully!\n");
};

export default deployLumoContracts;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags LumoContract
deployLumoContracts.tags = ["LumoContract", "MockAave", "MockCompound", "MockUniswap", "Lumo"];
