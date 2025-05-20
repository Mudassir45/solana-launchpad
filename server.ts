import 'dotenv/config';
import express, { Request, Response, RequestHandler } from 'express';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { EndpointId } from '@layerzerolabs/lz-definitions';
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat';
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities';
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools';
import { Connection, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

const app = express();
app.use(express.json());

// Constants for configuration
const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 80000,
        value: 0,
    },
];

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = [
    {
        msgType: 1,
        optionType: ExecutorOptionType.LZ_RECEIVE,
        gas: 200000,
        value: 2500000,
    },
];

interface TokenCreationRequest {
    mintName: string;
    mintSymbol: string;
    totalTokens: string;
    mintUri: string;
    destinationChains: string[]; // Array of chain IDs
}

interface ChainConfig {
    eid: number;
    name: string;
    network: string;
}

// Supported chains configuration
const SUPPORTED_CHAINS: { [key: string]: ChainConfig } = {
    'arbitrum-sepolia': {
        eid: EndpointId.ARBSEP_V2_TESTNET,
        name: 'Arbitrum Sepolia',
        network: 'arbitrum-sepolia'
    },
    'sepolia': {
        eid: EndpointId.SEPOLIA_V2_TESTNET,
        name: 'Sepolia',
        network: 'sepolia'
    },
    'base-v2-testnet': {
        eid: EndpointId.BASE_V2_TESTNET,
        name: 'Base Testnet',
        network: 'base-sepolia'
    },
    'bsc-v2-testnet': {
        eid: EndpointId.BSC_V2_TESTNET,
        name: 'BSC Testnet',
        network: 'bsc-testnet'
    }
};

// Function to update layerzero.config.ts
async function updateLayerZeroConfig(solanaContract: OmniPointHardhat, destinationChains: string[]) {
    const configContent = readFileSync('layerzero.config.ts', 'utf-8');
    
    // Create OmniPointHardhat objects for each destination chain
    const chainConfigs = destinationChains.map(chain => {
        const chainInfo = SUPPORTED_CHAINS[chain];
        return {
            eid: chainInfo.eid,
            contractName: 'MyOFT',
        };
    });

    // Generate connections configuration
    const connections = await generateConnectionsConfig(
        chainConfigs.map(chainConfig => [
            chainConfig,
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ])
    );

    // Create new config content
    const newConfig = `
import { EndpointId } from '@layerzerolabs/lz-definitions'
import { ExecutorOptionType } from '@layerzerolabs/lz-v2-utilities'
import { generateConnectionsConfig } from '@layerzerolabs/metadata-tools'
import { OAppEnforcedOption, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

import { getOftStoreAddress } from './tasks/solana'

const solanaContract: OmniPointHardhat = {
    eid: EndpointId.SOLANA_V2_TESTNET as EndpointId,
    address: getOftStoreAddress(EndpointId.SOLANA_V2_TESTNET),
}

${chainConfigs.map((config, index) => `
const chain${index}: OmniPointHardhat = {
    eid: ${config.eid},
    contractName: 'MyOFT',
}`).join('\n')}

const EVM_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(EVM_ENFORCED_OPTIONS, null, 4)}

const SOLANA_ENFORCED_OPTIONS: OAppEnforcedOption[] = ${JSON.stringify(SOLANA_ENFORCED_OPTIONS, null, 4)}

export default async function () {
    const connections = await generateConnectionsConfig([
        ${chainConfigs.map((_, index) => `
        [
            chain${index},
            solanaContract,
            [['LayerZero Labs'], []],
            [15, 32],
            [SOLANA_ENFORCED_OPTIONS, EVM_ENFORCED_OPTIONS],
        ],`).join('\n')}
    ])

    return {
        contracts: [
            { contract: solanaContract },
            ${chainConfigs.map((_, index) => `{ contract: chain${index} }`).join(',\n            ')}
        ],
        connections,
    }
}
`;

    writeFileSync('layerzero.config.ts', newConfig);
}

// Function to run interactive commands
function runInteractiveCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

interface TokenCreationProgress {
    step1Completed: boolean;
    step2Completed: { [chain: string]: boolean };
    step3Completed: boolean;
    step4Completed: boolean;
    mintAddress?: string;
    oftStoreAddress?: string;
}

// Function to run interactive commands with retry
async function runInteractiveCommandWithRetry(command: string, args: string[], maxRetries = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt} of ${maxRetries}...`);
            await runInteractiveCommand(command, args);
            return; // Success, exit the retry loop
        } catch (error) {
            lastError = error as Error;
            console.error(`Attempt ${attempt} failed:`, error);
            
            // If it's a transaction expiration error, wait before retrying
            if (error instanceof Error && error.message.includes('TransactionExpiredBlockheightExceededError')) {
                const waitTime = attempt * 5000; // Increase wait time with each retry
                console.log(`Waiting ${waitTime/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // For other errors, throw immediately
            throw error;
        }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError;
}

// API endpoint to get supported chains
app.get('/api/supported-chains', (req: Request, res: Response) => {
    res.json(SUPPORTED_CHAINS);
});

// New endpoint to prepare Step 1 (Solana OFT creation)
app.post('/api/prepare-step1', async (req: Request, res: Response) => {
    try {
        const { mintName, mintSymbol, totalTokens, mintUri, from, to } = req.body;
        // Connect to Solana
        const connection = new Connection('https://api.devnet.solana.com');
        // Use provided addresses or fallback to dummy ones for testing
        const fromPubkey = from ? new PublicKey(from) : new PublicKey('11111111111111111111111111111111');
        const toPubkey = to ? new PublicKey(to) : new PublicKey('22222222222222222222222222222222');
        // Fetch a recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        // Example: create a dummy transaction (replace with your actual OFT logic)
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey,
                toPubkey,
                lamports: 1000,
            })
        );
        // Set the recent blockhash
        transaction.recentBlockhash = blockhash;
        // Set the fee payer
        transaction.feePayer = fromPubkey;
        // Serialize the transaction (unsigned)
        const serialized = transaction.serialize({ requireAllSignatures: false }).toString('base64');
        res.json({ unsignedTx: serialized });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

// New endpoint to prepare Step 2 (EVM chain deployment)
app.post('/api/prepare-step2', async (req: Request, res: Response) => {
    try {
        const { chain, to, value } = req.body;
        const chainInfo = SUPPORTED_CHAINS[chain];
        if (!chainInfo) {
            return res.status(400).json({ error: `Unsupported chain: ${chain}` });
        }
        if (!process.env.PRIVATE_KEY) {
            return res.status(500).json({ error: 'PRIVATE_KEY env variable not set' });
        }
        // Use ethers.js to create a wallet and provider with RPC URL
        const provider = new ethers.providers.JsonRpcProvider('https://arbitrum-sepolia-rpc.publicnode.com');
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        // Prepare a simple unsigned transaction (ETH transfer as placeholder)
        const tx = {
            to: to || wallet.address,
            value: value ? ethers.utils.parseEther(value) : ethers.utils.parseEther('0.001'),
            nonce: await provider.getTransactionCount(wallet.address),
            gasLimit: 21000,
            chainId: (await provider.getNetwork()).chainId,
        };
        // Serialize unsigned transaction
        const unsignedTx = ethers.utils.serializeTransaction(tx);
        res.json({ unsignedTx });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

// New endpoint to prepare Step 3 (Config update/init)
app.post('/api/prepare-step3', async (req: Request, res: Response) => {
    try {
        // For demonstration, use the same logic as step2 (ETH transfer placeholder)
        if (!process.env.PRIVATE_KEY) {
            return res.status(500).json({ error: 'PRIVATE_KEY env variable not set' });
        }
        const provider = new ethers.providers.JsonRpcProvider('https://arbitrum-sepolia-rpc.publicnode.com');
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const tx = {
            to: wallet.address,
            value: ethers.utils.parseEther('0.001'),
            nonce: await provider.getTransactionCount(wallet.address),
            gasLimit: 21000,
            chainId: (await provider.getNetwork()).chainId,
        };
        const unsignedTx = ethers.utils.serializeTransaction(tx);
        res.json({ unsignedTx });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

// New endpoint to prepare Step 4 (Config wiring)
app.post('/api/prepare-step4', async (req: Request, res: Response) => {
    try {
        // For demonstration, use the same logic as step2 (ETH transfer placeholder)
        if (!process.env.PRIVATE_KEY) {
            return res.status(500).json({ error: 'PRIVATE_KEY env variable not set' });
        }
        const provider = new ethers.providers.JsonRpcProvider('https://arbitrum-sepolia-rpc.publicnode.com');
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const tx = {
            to: wallet.address,
            value: ethers.utils.parseEther('0.001'),
            nonce: await provider.getTransactionCount(wallet.address),
            gasLimit: 21000,
            chainId: (await provider.getNetwork()).chainId,
        };
        const unsignedTx = ethers.utils.serializeTransaction(tx);
        res.json({ unsignedTx });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

// New endpoint to broadcast signed transactions
app.post('/api/broadcast', async (req: Request, res: Response) => {
    const { signedTx } = req.body;

    // If it's a hex string, treat as EVM signed tx
    if (typeof signedTx === 'string' && signedTx.startsWith('0x')) {
        try {
            const provider = new ethers.providers.JsonRpcProvider('https://arbitrum-sepolia-rpc.publicnode.com');
            const txResponse = await provider.sendTransaction(signedTx);
            await txResponse.wait();
            return res.json({ success: true, txHash: txResponse.hash });
        } catch (error: any) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // Otherwise, fallback to CLI command (for Solana)
    runInteractiveCommand(signedTx.command, signedTx.args)
        .then(() => {
            res.json({ success: true, message: 'Transaction broadcasted successfully' });
        })
        .catch((error) => {
            res.status(500).json({ success: false, error: error.message });
        });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app; 