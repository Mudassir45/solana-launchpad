import bs58 from 'bs58'
import { BigNumber } from 'ethers'
import { task, types } from 'hardhat/config'
import { ActionType, HardhatRuntimeEnvironment } from 'hardhat/types'

import { makeBytes32 } from '@layerzerolabs/devtools'
import { EndpointId } from '@layerzerolabs/lz-definitions'

import { getLayerZeroScanLink } from '../solana'

interface TaskArguments {
    dstEid: number
    amount: string
    to: string
    contractName?: string
    contractAddress?: string
}

const action: ActionType<TaskArguments> = async (
    { dstEid, amount, to, contractName, contractAddress },
    hre: HardhatRuntimeEnvironment
) => {
    try {
        const signer = await hre.ethers.getNamedSigner('deployer')
        console.log('Signer address:', signer.address)
        
        // Initialize token contract either from address or name
        let token
        if (contractAddress) {
            // @ts-ignore
            token = (await hre.ethers.getContractAt(contractName || 'MyOFT', contractAddress)).connect(signer)
        } else {
            // @ts-ignore
            token = (await hre.ethers.getContract(contractName || 'MyOFT')).connect(signer)
        }
        console.log('Token contract address:', token.address)

        // Check token balance
        const balance = await token.balanceOf(signer.address)
        console.log('Token balance:', balance.toString())
        console.log('Amount to send:', amount)

        const amountLD = BigNumber.from(amount)
        const sendParam = {
            dstEid,
            to: makeBytes32(bs58.decode(to)),
            amountLD: amountLD.toString(),
            minAmountLD: amountLD.mul(9_000).div(10_000).toString(),
            extraOptions: '0x',
            composeMsg: '0x',
            oftCmd: '0x',
        }
        console.log('Send parameters:', sendParam)

        // Get quote
        const [msgFee] = await token.functions.quoteSend(sendParam, false)
        console.log('Message fee:', {
            nativeFee: msgFee.nativeFee.toString(),
            lzTokenFee: msgFee.lzTokenFee.toString()
        })

        // Check native token balance
        const nativeBalance = await signer.getBalance()
        console.log('Native token balance:', nativeBalance.toString())
        console.log('Required native fee:', msgFee.nativeFee.toString())

        const txResponse = await token.functions.send(sendParam, msgFee, signer.address, {
            value: msgFee.nativeFee,
            gasLimit: 500_000,
        })
        console.log('Transaction sent:', txResponse.hash)
        
        const txReceipt = await txResponse.wait()
        console.log(`send: ${amount} to ${to}: ${txReceipt.transactionHash}`)
        console.log(
            `Track cross-chain transfer here: ${getLayerZeroScanLink(txReceipt.transactionHash, dstEid == EndpointId.SOLANA_V2_TESTNET)}`
        )
    } catch (error: any) {
        console.error('Error details:', {
            message: error.message,
            reason: error.reason,
            code: error.code,
            transactionHash: error.transactionHash,
            transaction: error.transaction ? {
                from: error.transaction.from,
                to: error.transaction.to,
                value: error.transaction.value?.toString(),
                gasLimit: error.transaction.gasLimit?.toString(),
                data: error.transaction.data?.slice(0, 66) + '...' // Show just the function selector
            } : undefined
        })
        throw error
    }
}

task('send', 'Sends a transaction', action)
    .addParam('dstEid', 'Destination endpoint ID', undefined, types.int, false)
    .addParam('amount', 'Amount to send in wei', undefined, types.string, false)
    .addParam('to', 'Recipient address', undefined, types.string, false)
    .addOptionalParam('contractName', 'Name of the contract in deployments folder', 'MyOFT', types.string)
    .addOptionalParam('contractAddress', 'Address of the deployed contract', undefined, types.string)
