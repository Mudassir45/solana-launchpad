const {ethers, Contract, utils} = require('ethers');
const axios = require('axios');
const { util } = require('chai');

const API_URL = 'https://li.quest/v1'
const ADDRESS = '0x4eF03f0eA9e744F22B768E17628cE39a2f48AbE5';

const fromChain = 'POL';
const fromToken = 'USDC';
const toChain = 'DAI';
const toToken = 'USDC';
const fromAmount = '1000000';
const fromAddress = ADDRESS;

const provider = new ethers.providers.JsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/YookT1zCaTk-1s0ONK18r3EZc8g2e9oC', 137);
const wallet = ethers.Wallet.fromMnemonic(process.env.PRIVATE_KEY).connect(provider);

const getQuote = async (fromChain, toChain, fromToken, toToken, fromAmount, fromAddress) => {
    const result = await axios.get('https://li.quest/v1/quote', {
        params: {
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
        }
    });
    return result.data;
}

const getStatus = async (bridge, fromChain, toChain, txHash) => {
    const result = await axios.get('https://li.quest/v1/status', {
        params: {
            bridge,
            fromChain,
            toChain,
            txHash,
        }
    });
    return result.data;
}

const checkAndSetAllowance = async (wallet, tokenAddress, approvalAddress, amount) => {
    const ERC20_ABI = [
        'function allowance(address,address) external view returns (uint256)',
        'function approve(address, uint256) external'
    ]

    // Transactions with the native token don't need approval
    if (tokenAddress == ethers.constants.AddressZero) {
        return
    }

    const erc20 = new Contract(tokenAddress, ERC20_ABI, wallet);
    const allowance = await erc20.allowance(await wallet.getAddress(), approvalAddress);

    if (allowance.lt(utils.parseEther(amount))) { 
        return erc20.approve(approvalAddress, amount);
    }
}

const run = async () => {
    const quote = await getQuote(
        fromChain, toChain, fromToken, toToken, fromAmount, fromAddress
    );

    await checkAndSetAllowance(
        wallet, quote.action.fromToken.address, quote.estimate.approvalAddress, fromAmount
    );

    const tx = await wallet.sendTransaction(quote.transactionRequest);

    await tx.wait();

    if (fromChain != toChain) {
        let result;

        do {
            result = await getStatus(quote.tool, fromChain, toChain, tx.hash);
        } while (result.status != 'DONE' && result.status != 'FAILED')
    }
}

run().then(() => {
    console.log('DONE!')
});
