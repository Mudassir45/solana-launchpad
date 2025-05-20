import 'dotenv/config';
import { Connection, Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import axios from 'axios';
import fs from 'fs';
import { ethers } from 'ethers';

// Load your private key from environment variable
const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
if (!keypairPath) {
    throw new Error('SOLANA_KEYPAIR_PATH environment variable is not set');
}

// Read and parse the keypair file
const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

console.log('Loaded keypair with public key:', keypair.publicKey.toString());

// Example transaction
const connection = new Connection('https://api.devnet.solana.com');

// Prepare Step 1 (Solana OFT creation)
async function prepareStep1() {
    const from = keypair.publicKey.toString();
    const to = '3pmh1XqFhHKDBoAQdGBgrJ6F16t9gxyhfe5qhZHLQedD'; // Replace with a valid Solana address
    const response = await axios.post('http://localhost:3000/api/prepare-step1', {
        mintName: 'MyToken',
        mintSymbol: 'MTK',
        totalTokens: '1000000',
        mintUri: 'https://example.com/token',
        from,
        to,
        destinationChains: ['arbitrum-sepolia', 'bsc-v2-testnet'] // Add destination chains
    });
    return response.data;
}

// Prepare Step 2 (EVM chain deployment)
async function prepareStep2(chains: string[]) {
    const responses = [];
    for (const chain of chains) {
        const response = await axios.post('http://localhost:3000/api/prepare-step2', {
            chain,
            to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Example EVM address
            value: '0.001'
        });
        responses.push(response.data);
    }
    return responses;
}

// Prepare Step 3 (Config update/init)
async function prepareStep3() {
    const response = await axios.post('http://localhost:3000/api/prepare-step3', {});
    return response.data;
}

// Broadcast the signed transaction
async function broadcastSignedTransaction(signedTx: any, step: number, chain?: string) {
    try {
        let command;
        let args;

        switch (step) {
            case 1:
                command = 'pnpm';
                args = [
                    'hardhat',
                    'lz:oft:solana:create',
                    '--eid', '40168',
                    '--program-id', 'HmN84fc4YAhvxF2WnP891XxZb3hoTL1PpjYHyiRXDCc9',
                    '--name', 'MyServerToken',
                    '--symbol', 'MTK',
                    '--amount', '10000000000000',
                    '--uri', 'https://example.com/token',
                    '--only-oft-store', 'true',
                    '--compute-unit-price-scale-factor', '10'
                ];
                break;
            case 2:
                command = 'npx';
                args = [
                    'hardhat',
                    'deploy',
                    '--network',
                    chain || 'arbitrum-sepolia',
                    '--tags',
                    'MyOFT'
                ];
                break;
            case 3:
                command = 'pnpm';
                args = [
                    'hardhat',
                    'lz:oft:solana:init-config',
                    '--oapp-config',
                    'layerzero.config.ts'
                ];
                break;
            case 4:
                command = 'pnpm';
                args = [
                    'hardhat',
                    'lz:oapp:wire',
                    '--oapp-config',
                    'layerzero.config.ts'
                ];
                break;
            default:
                throw new Error(`Unknown step: ${step}`);
        }

        const response = await axios.post('http://localhost:3000/api/broadcast', {
            signedTx: {
                command,
                args
            }
        });
        console.log(`Broadcast Response for ${chain || 'default'}:`, response.data);
    } catch (error) {
        console.error(`Error broadcasting transaction for ${chain || 'default'}:`, error);
    }
}

// Main function to test the flow
async function testFlow() {
    try {
        // Define networks at the start for consistency
        const networks = [
            { api: 'arbitrum-sepolia', cli: 'arbitrum-sepolia' },
            { api: 'bsc-v2-testnet', cli: 'bsc-testnet' }
        ];

        // Step 1: Solana OFT creation
        console.log('Preparing Step 1...');
        const unsignedTx1 = await prepareStep1();
        if (unsignedTx1) {
            const transaction = Transaction.from(Buffer.from(unsignedTx1.unsignedTx, 'base64'));
            transaction.sign(keypair);
            const signedTx1 = transaction.serialize();
            console.log('Signed Transaction Step 1:', signedTx1.toString('hex'));
            await broadcastSignedTransaction(signedTx1, 1);
            // Wait for Solana transaction to be confirmed
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Step 2: EVM chain deployment for multiple networks
        console.log('Preparing Step 2...');
        const unsignedTxs2 = await prepareStep2(networks.map(n => n.api));
        
        if (unsignedTxs2) {
            const privateKey = process.env.PRIVATE_KEY;
            if (!privateKey) {
                throw new Error('PRIVATE_KEY environment variable is not set');
            }
            const wallet = new ethers.Wallet(privateKey);

            // Process each network's transaction
            for (let i = 0; i < networks.length; i++) {
                console.log(`Processing deployment for ${networks[i].api}...`);
                const unsignedTx2 = unsignedTxs2[i];
                const tx = ethers.utils.parseTransaction(unsignedTx2.unsignedTx);
                const txRequest: ethers.providers.TransactionRequest = {
                    to: tx.to,
                    value: tx.value,
                    data: tx.data,
                    nonce: tx.nonce,
                    gasLimit: tx.gasLimit,
                    gasPrice: tx.gasPrice,
                    chainId: tx.chainId
                };
                const signedTx2 = await wallet.signTransaction(txRequest);
                console.log(`Signed Transaction Step 2 for ${networks[i].api}:`, signedTx2);
                await broadcastSignedTransaction(signedTx2, 2, networks[i].cli);
                // Wait between deployments
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Step 3: Config update/init for each network
        console.log('Preparing Step 3...');
        for (const network of networks) {
            console.log(`Updating configuration for ${network.api}...`);
            const unsignedTx3 = await prepareStep3();
            if (unsignedTx3) {
                const privateKey = process.env.PRIVATE_KEY;
                if (!privateKey) {
                    throw new Error('PRIVATE_KEY environment variable is not set');
                }
                const wallet = new ethers.Wallet(privateKey);
                const tx = ethers.utils.parseTransaction(unsignedTx3.unsignedTx);
                const txRequest: ethers.providers.TransactionRequest = {
                    to: tx.to,
                    value: tx.value,
                    data: tx.data,
                    nonce: tx.nonce,
                    gasLimit: tx.gasLimit,
                    gasPrice: tx.gasPrice,
                    chainId: tx.chainId
                };
                const signedTx3 = await wallet.signTransaction(txRequest);
                console.log(`Signed Transaction Step 3 for ${network.api}:`, signedTx3);
                await broadcastSignedTransaction(signedTx3, 3, network.cli);
                // Wait for configuration to be updated
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Step 4: Wire configuration for each network
        console.log('Preparing Step 4...');
        for (const network of networks) {
            console.log(`Wiring configuration for ${network.api}...`);
            await broadcastSignedTransaction(null, 4, network.cli);
            // Wait between wiring operations
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('All steps completed successfully!');
    } catch (error) {
        console.error('Error in test flow:', error);
    }
}

// Run the test flow
testFlow().catch(console.error); 