import { task } from 'hardhat/config';
import { ContractFactory } from 'ethers';

// Replace with your actual OFT contract name and import if needed
// import { MyOFT__factory } from '../typechain-types';

// If using a generic OFT contract, adjust the contract name accordingly
const OFT_CONTRACT_NAME = 'MyOFT';

// Hardhat task to deploy OFT contract
// Usage: npx hardhat deploy-oft --network <network> --name <TokenName> --symbol <TokenSymbol> [--decimals <decimals>]
task('deploy-oft', 'Deploys an OFT contract with custom name and symbol')
  .addParam('name', 'Token name')
  .addParam('symbol', 'Token symbol')
  .addOptionalParam('decimals', 'Token decimals (default: 18)', '18')
  .setAction(async ({ name, symbol, decimals }, hre) => {
    try {
      const [deployer] = await hre.ethers.getSigners();
      const factory: ContractFactory = await hre.ethers.getContractFactory(OFT_CONTRACT_NAME);
      const contract = await factory.deploy(name, symbol, decimals);
      await contract.deployed();

      const result = {
        address: contract.address,
        name,
        symbol,
        decimals,
        deployer: deployer.address
      };

      // Log the contract address for visibility
      console.log(`Deployed ${OFT_CONTRACT_NAME}: ${contract.address}`);
      
      // Return the result - Hardhat will handle the output
      return result;
    } catch (error) {
      throw error;
    }
  }); 