// import { task } from 'hardhat/config'
// import { HardhatRuntimeEnvironment } from 'hardhat/types'
// import { deployOFT } from '@layerzerolabs/oft-evm'

// task('lz:oft:evm:deploy', 'Deploy OFT contract')
//     .addParam('name', 'Token name')
//     .addParam('symbol', 'Token symbol')
//     .addParam('decimals', 'Token decimals')
//     .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
//         const { name, symbol, decimals } = taskArgs
//         const { deployer } = await hre.getNamedAccounts()
        
//         console.log(`Deploying OFT contract with name: ${name}, symbol: ${symbol}, decimals: ${decimals}`)
        
//         const oft = await deployOFT({
//             name,
//             symbol,
//             decimals: parseInt(decimals),
//             signer: await hre.ethers.getSigner(deployer),
//             endpoint: await hre.getEndpoint(),
//         })

//         console.log(`OFT deployed at: ${oft.address}`)
//         return oft
//     }) 