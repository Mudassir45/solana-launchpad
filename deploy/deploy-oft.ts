import { task } from "hardhat/config";

// Usage: npx hardhat deploy-oft --network <network> --name "TokenName" --symbol "TKN"
task("deploy-oft", "Deploys the MyOFT contract with custom name and symbol")
  .addParam("name", "The token name")
  .addParam("symbol", "The token symbol")
  .setAction(async ({ name, symbol }, hre) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const endpointV2Deployment = await hre.deployments.get('EndpointV2');

    const { address } = await deploy("MyOFT", {
      from: deployer,
      args: [
        name,
        symbol,
        endpointV2Deployment.address,
        deployer,
      ],
      log: true,
      skipIfAlreadyDeployed: false,
    });

    console.log(`Deployed MyOFT: ${address}`);
  }); 